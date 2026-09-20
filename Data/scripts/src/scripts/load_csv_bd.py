"""Carga los CSVs/JSON de Data/csv en las bases de datos operacionales.

MySQL (cloudshop_catalogo):
    catalogo/categorias.csv → categorias
    catalogo/productos.csv  → productos
    catalogo/inventario.csv → inventario
    + CALL poblar_movimientos_stock(N)   [--movimientos N]

PostgreSQL (cloudshop_usuarios):
    usuarios.csv            → usuarios
    direcciones_envio.csv   → direcciones_envio

MongoDB (cloudshop_ventas, MS3 Ventas y Reseñas):
    ventas/ordenes.json + ventas/detalle_ordenes.csv → colección `ventas`
        (se combinan: cada línea de detalle_ordenes.csv se anida como un
        elemento de `items` dentro del pedido con el mismo orden_id)
    ventas/resenas.json                              → colección `resenas`

La carga es COMPLETA (no incremental): limpia las colecciones/tablas destino
antes de insertar. Reusa las mismas variables del despliegue
(Backend/.env.example): MYSQL_* para MySQL, DATABASE_URL para PostgreSQL,
MONGO_URI para MongoDB.

Uso (dentro de Data/scripts/):
    uv run python -m scripts.load_csv_bd --dry-run     # solo valida los archivos
    uv run python -m scripts.load_csv_bd               # carga las 3 bases de datos
    uv run python -m scripts.load_csv_bd --solo-mysql --movimientos 25000
    uv run python -m scripts.load_csv_bd --solo-postgres
    uv run python -m scripts.load_csv_bd --solo-mongo
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[3]  # Data/
CSV_DIR = BASE_DIR / "csv"

CATEGORIAS_CSV = CSV_DIR / "catalogo" / "categorias.csv"
PRODUCTOS_CSV = CSV_DIR / "catalogo" / "productos.csv"
INVENTARIO_CSV = CSV_DIR / "catalogo" / "inventario.csv"
USUARIOS_CSV = CSV_DIR / "usuarios.csv"
DIRECCIONES_CSV = CSV_DIR / "direcciones_envio.csv"
ORDENES_JSON = CSV_DIR / "ventas" / "ordenes.json"
DETALLE_ORDENES_CSV = CSV_DIR / "ventas" / "detalle_ordenes.csv"
RESENAS_JSON = CSV_DIR / "ventas" / "resenas.json"


def leer_filas(ruta: Path) -> list[dict]:
    if not ruta.exists():
        raise SystemExit(f"Falta {ruta}. Genera los CSVs primero (faker_users.py / build_catalogo.py).")
    with ruta.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def leer_ndjson(ruta: Path) -> list[dict]:
    if not ruta.exists():
        raise SystemExit(f"Falta {ruta}. Genera primero las ventas/reseñas (faker_ventas_resenas.py).")
    with ruta.open(encoding="utf-8") as f:
        return [json.loads(linea) for linea in f if linea.strip()]


def nulo_si_vacio(valor: str | None):
    if valor is None:
        return None
    valor = valor.strip()
    return valor if valor else None


def validar(filas_categorias, filas_productos, filas_inventario, filas_usuarios, filas_direcciones,
            filas_ordenes, filas_detalle, filas_resenas):
    ids_categorias = {int(r["id"]) for r in filas_categorias}
    ids_productos = {int(r["id"]) for r in filas_productos}
    ids_usuarios = {int(r["id"]) for r in filas_usuarios}

    problemas = []
    sin_categoria = [r["sku"] for r in filas_productos if int(r["categoria_id"]) not in ids_categorias]
    if sin_categoria:
        problemas.append(f"{len(sin_categoria)} productos con categoria_id inexistente (ej. {sin_categoria[0]})")
    sin_producto = [int(r["producto_id"]) for r in filas_inventario if int(r["producto_id"]) not in ids_productos]
    if sin_producto:
        problemas.append(f"{len(sin_producto)} filas de inventario con producto_id inexistente (ej. {sin_producto[0]})")
    sin_usuario = [int(r["usuario_id"]) for r in filas_direcciones if int(r["usuario_id"]) not in ids_usuarios]
    if sin_usuario:
        problemas.append(f"{len(sin_usuario)} direcciones con usuario_id inexistente (ej. {sin_usuario[0]})")

    # --- Ventas y reseñas (MongoDB) ---
    ids_ordenes = [r["orden_id"] for r in filas_ordenes]
    ids_ordenes_unicos = set(ids_ordenes)
    if len(ids_ordenes) != len(ids_ordenes_unicos):
        problemas.append(
            f"orden_id duplicado: {len(ids_ordenes) - len(ids_ordenes_unicos)} pedidos repiten el mismo "
            "código de orden (dos usuarios NO pueden compartir un orden_id)"
        )
    sin_usuario_orden = [r["orden_id"] for r in filas_ordenes if int(r["usuario_id"]) not in ids_usuarios]
    if sin_usuario_orden:
        problemas.append(f"{len(sin_usuario_orden)} órdenes con usuario_id inexistente (ej. {sin_usuario_orden[0]})")
    sin_orden = [r["orden_id"] for r in filas_detalle if r["orden_id"] not in ids_ordenes_unicos]
    if sin_orden:
        problemas.append(f"{len(sin_orden)} líneas de detalle_ordenes con orden_id inexistente (ej. {sin_orden[0]})")
    sin_producto_detalle = [r["orden_id"] for r in filas_detalle if int(r["producto_id"]) not in ids_productos]
    if sin_producto_detalle:
        problemas.append(f"{len(sin_producto_detalle)} líneas de detalle_ordenes con producto_id inexistente")
    sin_usuario_resena = [
        (r["usuario_id"], r["producto_id"]) for r in filas_resenas if int(r["usuario_id"]) not in ids_usuarios
    ]
    if sin_usuario_resena:
        problemas.append(f"{len(sin_usuario_resena)} reseñas con usuario_id inexistente")
    sin_producto_resena = [
        (r["usuario_id"], r["producto_id"]) for r in filas_resenas if int(r["producto_id"]) not in ids_productos
    ]
    if sin_producto_resena:
        problemas.append(f"{len(sin_producto_resena)} reseñas con producto_id inexistente")
    pares_resena = [(r["producto_id"], r["usuario_id"]) for r in filas_resenas]
    if len(pares_resena) != len(set(pares_resena)):
        problemas.append("hay reseñas duplicadas para el mismo par (producto_id, usuario_id)")

    return problemas


def cargar_mysql(filas_categorias, filas_productos, filas_inventario, movimientos: int):
    import pymysql

    conexion = pymysql.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.getenv("MYSQL_USER", "cloud_user"),
        password=os.getenv("MYSQL_PASSWORD", "cloud_pass"),
        database=os.getenv("MYSQL_DATABASE", "cloudshop_catalogo"),
        charset="utf8mb4",
        autocommit=False,
    )
    try:
        with conexion.cursor() as cur:
            cur.execute("DELETE FROM movimientos_stock")
            cur.execute("DELETE FROM inventario")
            cur.execute("DELETE FROM productos")
            cur.execute("DELETE FROM categorias")

            cur.executemany(
                "INSERT INTO categorias (id, nombre, descripcion) VALUES (%s, %s, %s)",
                [
                    (int(r["id"]), r["nombre"].strip(), nulo_si_vacio(r["descripcion"]))
                    for r in filas_categorias
                ],
            )
            cur.executemany(
                """INSERT INTO productos
                   (id, categoria_id, sku, nombre, descripcion, marca, imagen_url,
                    origen_url, precio, precio_oferta, activo)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [
                    (
                        int(r["id"]),
                        int(r["categoria_id"]),
                        r["sku"].strip(),
                        r["nombre"].strip(),
                        nulo_si_vacio(r["descripcion"]),
                        nulo_si_vacio(r["marca"]),
                        nulo_si_vacio(r["imagen_url"]),
                        nulo_si_vacio(r["origen_url"]),
                        float(r["precio"]),
                        float(r["precio_oferta"]) if nulo_si_vacio(r["precio_oferta"]) else None,
                        int(r["activo"]),
                    )
                    for r in filas_productos
                ],
            )
            cur.executemany(
                """INSERT INTO inventario (producto_id, stock_disponible, stock_reservado)
                   VALUES (%s, %s, %s)""",
                [
                    (int(r["producto_id"]), int(r["stock_disponible"]), int(r["stock_reservado"]))
                    for r in filas_inventario
                ],
            )
            conexion.commit()
            print(f"[mysql] categorias={len(filas_categorias)}, productos={len(filas_productos)}, "
                  f"inventario={len(filas_inventario)}")

            if movimientos > 0:
                try:
                    cur.callproc("poblar_movimientos_stock", (movimientos,))
                except Exception as exc:
                    raise SystemExit(
                        f"No se pudo ejecutar poblar_movimientos_stock({movimientos}): {exc}. "
                        "El procedimiento se crea con Backend/products/init.sql; verifica que la BD "
                        "se inicializó montando ese archivo."
                    ) from exc
                conexion.commit()
                print(f"[mysql] movimientos_stock poblados con {movimientos} filas")
    finally:
        conexion.close()


def cargar_postgres(filas_usuarios, filas_direcciones):
    import psycopg

    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("Falta DATABASE_URL en el entorno (copia Backend/.env.example a Data/scripts/.env).")
    url = url.replace("postgresql+psycopg2://", "postgresql://", 1)

    with psycopg.connect(url) as conexion:
        with conexion.cursor() as cur:
            try:
                cur.execute("DELETE FROM direcciones_envio")
                cur.execute("DELETE FROM usuarios")
            except Exception as exc:
                raise SystemExit(
                    f"No existen las tablas en PostgreSQL: {exc}. "
                    "Arranca la VM de datos (docker-compose.datos.yml monta postgres-init/01_esquema.sql) "
                    "o levanta el servicio usuarios una vez (create_all)."
                ) from exc

            with cur.copy("COPY usuarios (id, nombre, email, password_hash, creado_en) FROM STDIN") as cp:
                for r in filas_usuarios:
                    cp.write_row(
                        (int(r["id"]), r["nombre"].strip(), r["email"].strip(),
                         r["password_hash"].strip(), r["creado_en"].strip())
                    )

            with cur.copy(
                """COPY direcciones_envio
                   (id, usuario_id, direccion, distrito, ciudad, pais, es_principal) FROM STDIN"""
            ) as cp:
                for r in filas_direcciones:
                    cp.write_row(
                        (int(r["id"]), int(r["usuario_id"]), r["direccion"].strip(),
                         r["distrito"].strip(), r["ciudad"].strip(), r["pais"].strip(),
                         r["es_principal"].strip().lower() == "true")
                    )

            for tabla in ("usuarios", "direcciones_envio"):
                cur.execute(
                    f"SELECT setval(pg_get_serial_sequence('{tabla}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {tabla}), 1))"
                )
        conexion.commit()
    print(f"[postgres] usuarios={len(filas_usuarios)}, direcciones={len(filas_direcciones)}")


def cargar_mongo(filas_ordenes, filas_detalle, filas_resenas):
    """Carga la colección `ventas` (pedido + items anidados) y `resenas` en MongoDB.

    El `orden_id` generado por faker_ventas_resenas.py es un string hex de 24
    caracteres, así que se usa directamente como `_id` (ObjectId) del pedido:
    las rutas de MS3 que validan el id con ObjectId.isValid() siguen
    funcionando igual con estos datos sembrados que con pedidos creados en vivo.
    """
    import pymongo
    from bson import ObjectId

    uri = os.getenv("MONGO_URI")
    if not uri:
        raise SystemExit("Falta MONGO_URI en el entorno (copia Backend/.env.example a Data/scripts/.env).")

    detalle_por_orden: dict[str, list[dict]] = {}
    for r in filas_detalle:
        detalle_por_orden.setdefault(r["orden_id"], []).append({
            "producto_id": int(r["producto_id"]),
            "cantidad": int(r["cantidad"]),
            "precio_unitario": float(r["precio_unitario"]),
        })

    documentos_ventas = [
        {
            "_id": ObjectId(r["orden_id"]),
            "usuario_id": int(r["usuario_id"]),
            "items": detalle_por_orden.get(r["orden_id"], []),
            "total": float(r["total"]),
            "estado": r["estado"],
            "direccion_envio": r.get("direccion_envio", ""),
            "creado_en": datetime.fromisoformat(r["creado_en"]),
            "actualizado_en": datetime.fromisoformat(r["creado_en"]),
        }
        for r in filas_ordenes
    ]

    documentos_resenas = [
        {
            "producto_id": int(r["producto_id"]),
            "usuario_id": int(r["usuario_id"]),
            "calificacion": int(r["calificacion"]),
            "comentario": r.get("comentario", ""),
            "creado_en": datetime.fromisoformat(r["creado_en"]),
        }
        for r in filas_resenas
    ]

    cliente = pymongo.MongoClient(uri, serverSelectionTimeoutMS=5000)
    try:
        bd = cliente.get_default_database()
        bd.ventas.delete_many({})
        bd.resenas.delete_many({})
        if documentos_ventas:
            bd.ventas.insert_many(documentos_ventas, ordered=False)
        if documentos_resenas:
            bd.resenas.insert_many(documentos_resenas, ordered=False)
        print(f"[mongo] ventas={len(documentos_ventas)}, resenas={len(documentos_resenas)}")
    finally:
        cliente.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--solo-mysql", action="store_true", help="Carga únicamente el catálogo en MySQL")
    parser.add_argument("--solo-postgres", action="store_true", help="Carga únicamente usuarios/direcciones en PostgreSQL")
    parser.add_argument("--solo-mongo", action="store_true", help="Carga únicamente ventas/reseñas en MongoDB")
    parser.add_argument("--movimientos", type=int, default=25000, metavar="N",
                        help="Filas de movimientos_stock vía procedimiento almacenado (0 = omitir)")
    parser.add_argument("--dry-run", action="store_true", help="Lee y valida los CSVs/JSON sin conectarse a las BDs")
    args = parser.parse_args()

    filas_categorias = leer_filas(CATEGORIAS_CSV)
    filas_productos = leer_filas(PRODUCTOS_CSV)
    filas_inventario = leer_filas(INVENTARIO_CSV)
    filas_usuarios = leer_filas(USUARIOS_CSV)
    filas_direcciones = leer_filas(DIRECCIONES_CSV)

    # Solo se exigen si de verdad se va a tocar Mongo: así --solo-mysql/--solo-postgres
    # siguen funcionando aunque faker_ventas_resenas.py todavía no se haya corrido.
    necesita_mongo = not (args.solo_mysql or args.solo_postgres)
    filas_ordenes = leer_ndjson(ORDENES_JSON) if necesita_mongo else []
    filas_detalle = leer_filas(DETALLE_ORDENES_CSV) if necesita_mongo else []
    filas_resenas = leer_ndjson(RESENAS_JSON) if necesita_mongo else []

    print(f"Archivos leídos: categorias={len(filas_categorias)}, productos={len(filas_productos)}, "
          f"inventario={len(filas_inventario)}, usuarios={len(filas_usuarios)}, "
          f"direcciones={len(filas_direcciones)}, ordenes={len(filas_ordenes)}, "
          f"detalle_ordenes={len(filas_detalle)}, resenas={len(filas_resenas)}")

    problemas = validar(filas_categorias, filas_productos, filas_inventario, filas_usuarios, filas_direcciones,
                         filas_ordenes, filas_detalle, filas_resenas)
    if problemas:
        for p in problemas:
            print(f"[ERROR] {p}", file=sys.stderr)
        raise SystemExit(
            "Integridad referencial rota; regenera con faker_users.py / build_catalogo.py / faker_ventas_resenas.py"
        )
    print("Integridad referencial: OK")

    if args.dry_run:
        print("--dry-run: sin conexión a las bases de datos. Nada más que hacer.")
        return

    load_dotenv()

    if args.solo_postgres:
        cargar_postgres(filas_usuarios, filas_direcciones)
        return
    if args.solo_mysql:
        cargar_mysql(filas_categorias, filas_productos, filas_inventario, args.movimientos)
        return
    if args.solo_mongo:
        cargar_mongo(filas_ordenes, filas_detalle, filas_resenas)
        return

    cargar_mysql(filas_categorias, filas_productos, filas_inventario, args.movimientos)
    cargar_postgres(filas_usuarios, filas_direcciones)
    cargar_mongo(filas_ordenes, filas_detalle, filas_resenas)
    print("\nCarga completa. Verifica con: "
          "docker exec cloudshop-mysql mysql -u$MYSQL_USER -p -e 'SELECT COUNT(*) FROM cloudshop_catalogo.productos' "
          "y análogamente en PostgreSQL/Mongo.")


if __name__ == "__main__":
    main()
