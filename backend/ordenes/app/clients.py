"""Clientes HTTP hacia MS2 (Catálogo) y MS3 (Ventas y Reseñas).

Todas las llamadas reenvían el Bearer token del usuario que hizo la request original a
este orquestador: así MS2/MS3 aplican sus propias reglas de autorización sin necesitar
un "service account" separado (fuera de alcance del blueprint).
"""

import httpx

from .config import settings


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def obtener_producto(client: httpx.AsyncClient, producto_id: int, token: str) -> dict | None:
    resp = await client.get(f"{settings.CATALOGO_URL}/api/catalogo/productos/{producto_id}", headers=_headers(token))
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["data"]


async def _movimiento_inventario(client: httpx.AsyncClient, ruta: str, producto_id: int, cantidad: int, token: str) -> tuple[bool, dict | None]:
    resp = await client.post(
        f"{settings.CATALOGO_URL}/api/catalogo/inventario/{ruta}",
        json={"producto_id": producto_id, "cantidad": cantidad},
        headers=_headers(token),
    )
    if resp.status_code == 200:
        return True, resp.json()
    return False, resp.json() if resp.content else None


async def reservar_stock(client: httpx.AsyncClient, producto_id: int, cantidad: int, token: str) -> tuple[bool, dict | None]:
    return await _movimiento_inventario(client, "reservar", producto_id, cantidad, token)


async def liberar_stock(client: httpx.AsyncClient, producto_id: int, cantidad: int, token: str) -> tuple[bool, dict | None]:
    return await _movimiento_inventario(client, "liberar", producto_id, cantidad, token)


async def confirmar_venta_stock(client: httpx.AsyncClient, producto_id: int, cantidad: int, token: str) -> tuple[bool, dict | None]:
    return await _movimiento_inventario(client, "confirmar-venta", producto_id, cantidad, token)


async def crear_venta(client: httpx.AsyncClient, usuario_id: int, items: list[dict], total: float, direccion_envio: str | None, token: str) -> dict:
    resp = await client.post(
        f"{settings.VENTAS_URL}/ventas",
        json={"usuario_id": usuario_id, "items": items, "total": total, "direccion_envio": direccion_envio or ""},
        headers=_headers(token),
    )
    resp.raise_for_status()
    return resp.json()["data"]


async def obtener_venta(client: httpx.AsyncClient, venta_id: str, token: str) -> dict | None:
    resp = await client.get(f"{settings.VENTAS_URL}/ventas/{venta_id}", headers=_headers(token))
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()["data"]


async def actualizar_estado_venta(client: httpx.AsyncClient, venta_id: str, estado: str, token: str) -> dict:
    resp = await client.patch(
        f"{settings.VENTAS_URL}/ventas/{venta_id}/estado",
        json={"estado": estado},
        headers=_headers(token),
    )
    resp.raise_for_status()
    return resp.json()["data"]
