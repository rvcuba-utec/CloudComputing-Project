"""Rutas de analítica (blueprint §5.5), todas admin-only sobre el catálogo Glue.

Las tablas y sus tipos exactos están definidas en DESPLIEGUE_AWS_MANUAL.md §8-9:
- `usuarios`, `direcciones_envio`, `categorias`, `productos`, `inventario`,
  `movimientos_stock` y `detalle_ordenes` vienen de CSV vía OpenCSVSerde, que
  solo soporta columnas `string` — por eso llevan CAST explícito. Sus columnas
  de id son las de las tablas operacionales reales (`productos.id`,
  `usuarios.id`), no `producto_id`/`usuario_id`.
- `ordenes` y `resenas` vienen de NDJSON vía JsonSerDe, con tipos nativos
  (bigint/double/int), por eso ahí sí se puede comparar/sumar sin CAST.

Sin el S3 + Glue del blueprint ya poblados, estas consultas no se pueden
ejecutar de punta a punta en un entorno local; el servicio responde 503 en ese
caso en vez de inventar datos.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from ..core.deps import UsuarioClaims, require_admin
from ..services.athena import AthenaConsultaFallida, AthenaNoConfigurado, ejecutar_consulta

router = APIRouter(prefix="/analitica", tags=["analitica"])

_CONSULTAS = {
    "ticket-promedio": """
        SELECT d.ciudad, ROUND(AVG(o.total), 2) AS ticket_promedio, COUNT(*) AS total_ordenes
        FROM ordenes o
        JOIN usuarios u ON CAST(u.id AS bigint) = o.usuario_id
        JOIN direcciones_envio d ON CAST(d.usuario_id AS bigint) = CAST(u.id AS bigint)
        WHERE o.estado = 'confirmada'
        GROUP BY d.ciudad
        ORDER BY ticket_promedio DESC
    """,
    "productos-mas-vendidos": """
        SELECT p.id AS producto_id, p.nombre,
               SUM(CAST(det.cantidad AS bigint)) AS unidades_vendidas,
               SUM(CAST(det.cantidad AS double) * CAST(det.precio_unitario AS double)) AS ingresos
        FROM detalle_ordenes det
        JOIN productos p ON CAST(p.id AS bigint) = CAST(det.producto_id AS bigint)
        JOIN ordenes o ON o.orden_id = det.orden_id
        WHERE o.estado = 'confirmada'
        GROUP BY p.id, p.nombre
        ORDER BY unidades_vendidas DESC
        LIMIT 20
    """,
    "ventas-por-categoria": """
        SELECT c.nombre AS categoria,
               date_format(from_iso8601_timestamp(o.creado_en), '%Y-%m') AS mes,
               SUM(CAST(det.cantidad AS double) * CAST(det.precio_unitario AS double)) AS ingresos
        FROM detalle_ordenes det
        JOIN productos p ON CAST(p.id AS bigint) = CAST(det.producto_id AS bigint)
        JOIN categorias c ON CAST(c.id AS bigint) = CAST(p.categoria_id AS bigint)
        JOIN ordenes o ON o.orden_id = det.orden_id
        WHERE o.estado = 'confirmada'
        GROUP BY c.nombre, date_format(from_iso8601_timestamp(o.creado_en), '%Y-%m')
        ORDER BY mes, ingresos DESC
    """,
    "ventas-por-ciudad": """
        SELECT d.ciudad, COUNT(*) AS total_ordenes, SUM(o.total) AS ingresos
        FROM ordenes o
        JOIN usuarios u ON CAST(u.id AS bigint) = o.usuario_id
        JOIN direcciones_envio d ON CAST(d.usuario_id AS bigint) = CAST(u.id AS bigint)
        WHERE o.estado = 'confirmada'
        GROUP BY d.ciudad
        ORDER BY ingresos DESC
    """,
    "calificacion-vs-ventas": """
        SELECT p.id AS producto_id, p.nombre,
               ROUND(AVG(r.calificacion), 2) AS calificacion_promedio,
               COALESCE(SUM(CAST(det.cantidad AS bigint)), 0) AS unidades_vendidas
        FROM productos p
        LEFT JOIN resenas r ON r.producto_id = CAST(p.id AS bigint)
        LEFT JOIN detalle_ordenes det ON CAST(det.producto_id AS bigint) = CAST(p.id AS bigint)
        GROUP BY p.id, p.nombre
        ORDER BY unidades_vendidas DESC
    """,
    "clientes-frecuentes": """
        SELECT u.id AS usuario_id, u.nombre, u.email, COUNT(*) AS total_ordenes, SUM(o.total) AS gasto_total
        FROM ordenes o
        JOIN usuarios u ON CAST(u.id AS bigint) = o.usuario_id
        WHERE o.estado = 'confirmada'
        GROUP BY u.id, u.nombre, u.email
        ORDER BY total_ordenes DESC, gasto_total DESC
        LIMIT 20
    """,
}


def _responder(nombre_consulta: str):
    sql = _CONSULTAS[nombre_consulta].strip()
    try:
        datos = ejecutar_consulta(sql)
    except AthenaNoConfigurado as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error))
    except AthenaConsultaFallida as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error))
    return {"data": datos, "query": sql}


@router.get("/ticket-promedio", summary="Ticket promedio por ciudad")
def ticket_promedio(_admin: UsuarioClaims = Depends(require_admin)):
    return _responder("ticket-promedio")


@router.get("/productos-mas-vendidos", summary="Productos con más unidades vendidas")
def productos_mas_vendidos(_admin: UsuarioClaims = Depends(require_admin)):
    return _responder("productos-mas-vendidos")


@router.get("/ventas-por-categoria", summary="Ingresos por categoría y mes")
def ventas_por_categoria(_admin: UsuarioClaims = Depends(require_admin)):
    return _responder("ventas-por-categoria")


@router.get("/ventas-por-ciudad", summary="Órdenes e ingresos por ciudad")
def ventas_por_ciudad(_admin: UsuarioClaims = Depends(require_admin)):
    return _responder("ventas-por-ciudad")


@router.get("/calificacion-vs-ventas", summary="Calificación promedio vs. unidades vendidas por producto")
def calificacion_vs_ventas(_admin: UsuarioClaims = Depends(require_admin)):
    return _responder("calificacion-vs-ventas")


@router.get("/clientes-frecuentes", summary="Clientes con más órdenes confirmadas")
def clientes_frecuentes(_admin: UsuarioClaims = Depends(require_admin)):
    return _responder("clientes-frecuentes")
