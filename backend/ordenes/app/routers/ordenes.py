"""Orquestador de compras: coordina MS2 (Catálogo/Inventario) y MS3 (Ventas).

Este servicio no tiene base de datos propia (blueprint §5.4): la "orden" persistida es
la venta que crea MS3; aquí solo se coordina la secuencia reservar → registrar → confirmar,
con compensación (liberar stock) cuando un paso falla.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from .. import clients
from ..core.deps import UsuarioClaims, get_current_claims
from ..schemas.orden import (
    EstadoOrdenOut,
    ItemPrevisualizado,
    OrdenOut,
    OrdenRequest,
    PrevisualizacionOut,
)

router = APIRouter(prefix="/ordenes", tags=["ordenes"])


@router.post("/previsualizar", response_model=PrevisualizacionOut, summary="Calcula precio y disponibilidad sin reservar stock")
async def previsualizar(payload: OrdenRequest, claims: UsuarioClaims = Depends(get_current_claims)):
    items_out: list[ItemPrevisualizado] = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for item in payload.items:
                producto = await clients.obtener_producto(client, item.producto_id, claims.token)
                if producto is None:
                    items_out.append(ItemPrevisualizado(
                        producto_id=item.producto_id, nombre="Producto no encontrado", cantidad=item.cantidad,
                        precio_unitario=0, subtotal=0, disponible=False, stock_disponible=0,
                    ))
                    continue
                disponible = bool(producto.get("activo")) and producto.get("stock_disponible", 0) >= item.cantidad
                precio_unitario = float(producto["precio"])
                items_out.append(ItemPrevisualizado(
                    producto_id=item.producto_id,
                    nombre=producto["nombre"],
                    cantidad=item.cantidad,
                    precio_unitario=precio_unitario,
                    subtotal=round(precio_unitario * item.cantidad, 2),
                    disponible=disponible,
                    stock_disponible=producto.get("stock_disponible", 0),
                ))
    except httpx.RequestError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"No se pudo consultar el catálogo: {error}")

    total = round(sum(i.subtotal for i in items_out), 2)
    todo_disponible = all(i.disponible for i in items_out)
    return PrevisualizacionOut(items=items_out, total=total, todo_disponible=todo_disponible)


@router.post("/confirmar", response_model=OrdenOut, status_code=status.HTTP_201_CREATED, summary="Reserva stock, registra la venta y confirma el descuento de inventario")
async def confirmar(payload: OrdenRequest, claims: UsuarioClaims = Depends(get_current_claims)):
    token = claims.token
    reservados: list[tuple[int, int]] = []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1) Validar y obtener precios antes de reservar nada.
            productos: dict[int, dict] = {}
            for item in payload.items:
                producto = await clients.obtener_producto(client, item.producto_id, token)
                if producto is None or not producto.get("activo"):
                    raise HTTPException(status.HTTP_404_NOT_FOUND, f"El producto {item.producto_id} no existe o no está disponible")
                productos[item.producto_id] = producto

            # 2) Reservar stock item por item; si alguno falla, liberar lo ya reservado.
            for item in payload.items:
                ok, detalle = await clients.reservar_stock(client, item.producto_id, item.cantidad, token)
                if not ok:
                    for pid, cantidad in reservados:
                        await clients.liberar_stock(client, pid, cantidad, token)
                    mensaje = (detalle or {}).get("error", {}).get("message", "stock insuficiente")
                    raise HTTPException(status.HTTP_409_CONFLICT, f"No se pudo reservar el producto {item.producto_id}: {mensaje}")
                reservados.append((item.producto_id, item.cantidad))

            # 3) Registrar la venta en MS3 (estado inicial "pendiente").
            items_payload = [
                {"producto_id": item.producto_id, "cantidad": item.cantidad, "precio_unitario": productos[item.producto_id]["precio"]}
                for item in payload.items
            ]
            total = round(sum(p["precio_unitario"] * p["cantidad"] for p in items_payload), 2)

            try:
                venta = await clients.crear_venta(client, claims.id, items_payload, total, payload.direccion_envio, token)
            except httpx.HTTPStatusError as error:
                for pid, cantidad in reservados:
                    await clients.liberar_stock(client, pid, cantidad, token)
                raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"No se pudo registrar la venta: {error}")

            venta_id = venta["_id"]

            # 4) Confirmar el descuento definitivo de inventario por cada item.
            for item in payload.items:
                ok, _ = await clients.confirmar_venta_stock(client, item.producto_id, item.cantidad, token)
                if not ok:
                    # Limitación real y documentada: MS2 no expone un endpoint de reingreso,
                    # así que no se puede revertir el stock ya confirmado en items previos.
                    await clients.actualizar_estado_venta(client, venta_id, "fallida", token)
                    raise HTTPException(
                        status.HTTP_502_BAD_GATEWAY,
                        f"La venta {venta_id} quedó marcada como fallida: no se pudo confirmar el stock del producto {item.producto_id}",
                    )

            await clients.actualizar_estado_venta(client, venta_id, "confirmada", token)
            return OrdenOut(orden_id=venta_id, estado="confirmada", total=total)
    except httpx.RequestError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Error de comunicación con los microservicios: {error}")


@router.get("/{orden_id}/estado", response_model=EstadoOrdenOut, summary="Consulta el estado de una orden")
async def estado(orden_id: str, claims: UsuarioClaims = Depends(get_current_claims)):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            venta = await clients.obtener_venta(client, orden_id, claims.token)
    except httpx.RequestError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"No se pudo consultar la venta: {error}")

    if venta is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe una orden con ese identificador")

    return EstadoOrdenOut(orden_id=venta["_id"], estado=venta["estado"], total=venta["total"], items=venta["items"])


@router.post("/{orden_id}/cancelar", response_model=OrdenOut, summary="Cancela una orden aún no confirmada")
async def cancelar(orden_id: str, claims: UsuarioClaims = Depends(get_current_claims)):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            venta = await clients.obtener_venta(client, orden_id, claims.token)
            if venta is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe una orden con ese identificador")

            if venta["estado"] != "pendiente":
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"No se puede cancelar: la orden está en estado '{venta['estado']}' "
                    "(el modelo de inventario de MS2 no admite reingreso de stock tras confirmar una venta)",
                )

            for item in venta["items"]:
                await clients.liberar_stock(client, item["producto_id"], item["cantidad"], claims.token)

            await clients.actualizar_estado_venta(client, orden_id, "cancelada", claims.token)
            return OrdenOut(orden_id=orden_id, estado="cancelada", total=venta["total"])
    except httpx.RequestError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Error de comunicación con los microservicios: {error}")
