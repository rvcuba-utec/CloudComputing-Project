import os
import csv
import io
import logging
from datetime import date, datetime
from decimal import Decimal

import boto3
import pymysql

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("ingesta-catalogo")

# IP privada de la MV de base de datos (PostgreSQL/MySQL).
MYSQL_HOST = os.environ["MYSQL_HOST"]
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_DB = os.environ.get("MYSQL_DB", "cloudshop_catalogo")
MYSQL_USER = os.environ["MYSQL_USER"]  # usuario de SOLO LECTURA (ingesta_my)
MYSQL_PASSWORD = os.environ["MYSQL_PASSWORD"]

S3_BUCKET = os.environ.get("S3_BUCKET", "cloudshop-data-lake-2026-utec-mr-cs2032-20260912")

# Plantilla: para agregar más tablas -> agregar otra entrada.
EXTRACCIONES = {
    "categorias": ("SELECT * FROM categorias", "catalogo/categorias.csv"),
    "productos": ("SELECT * FROM productos", "catalogo/productos.csv"),
    "inventario": ("SELECT * FROM inventario", "catalogo/inventario.csv"),
    "movimientos_stock": ("SELECT * FROM movimientos_stock", "catalogo/movimientos_stock.csv"),
}


def normalizar_valor(valor):
    """Convierte tipos de MySQL en valores CSV estables y sin secretos."""
    if valor is None:
        return ""
    if isinstance(valor, datetime):
        return valor.isoformat(sep="T")
    if isinstance(valor, date):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, bytes):
        return valor.decode("utf-8", "replace")
    return valor


def extraer_tabla(cur, consulta):
    cur.execute(consulta)
    columnas = [descripcion[0] for descripcion in cur.description]
    filas = cur.fetchall()
    return columnas, filas


def a_csv(columnas, filas):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columnas)
    for fila in filas:
        writer.writerow([normalizar_valor(v) for v in fila])
    return buffer.getvalue().encode("utf-8")


def main():
    log.info("Conectando a MySQL %s:%s/%s ...", MYSQL_HOST, MYSQL_PORT, MYSQL_DB)
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        db=MYSQL_DB,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        charset="utf8mb4",
    )

    # boto3 toma automáticamente las credenciales del IAM Role de la EC2.
    s3 = boto3.client("s3")

    total_ok = 0
    try:
        with conn.cursor() as cur:
            for nombre, (consulta, destino) in EXTRACCIONES.items():
                columnas, filas = extraer_tabla(cur, consulta)
                cuerpo = a_csv(columnas, filas)
                s3.put_object(Bucket=S3_BUCKET, Key=destino, Body=cuerpo)
                total_ok += 1
                log.info(
                    "OK | tabla=%s | filas=%d | destino=s3://%s/%s | %s",
                    nombre,
                    len(filas),
                    S3_BUCKET,
                    destino,
                    datetime.now().astimezone().isoformat(timespec="seconds"),
                )
    finally:
        conn.close()

    log.info("Ingesta finalizada. Tablas cargadas correctamente: %d", total_ok)


if __name__ == "__main__":
    main()
