import csv
import io
import json
import logging
import os
from datetime import datetime, timezone

import boto3
from bson import ObjectId
from pymongo import MongoClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ingesta-ventas")

MONGO_URI = os.environ["MONGO_URI"]
MONGO_DB = os.environ.get("MONGO_DB", "cloudshop_ventas")
S3_BUCKET = os.environ.get("S3_BUCKET", "cloudshop-data-lake-2026-utec-mr-cs2032-v2")

DESTINO_ORDENES = "ordenes/ordenes.json"
DESTINO_DETALLE = "detalle_ordenes/detalle_ordenes.csv"
DESTINO_RESENAS = "resenas/resenas.json"


def _id_str(doc_id):
    return str(doc_id) if isinstance(doc_id, ObjectId) else str(doc_id)


def _fecha_str(valor):
    if valor is None:
        return ""
    if isinstance(valor, datetime):
        if valor.tzinfo is None:
            valor = valor.replace(tzinfo=timezone.utc)
        return valor.isoformat(timespec="seconds")
    return str(valor)


def extraer_ventas(col):
    """Devuelve (lineas_ordenes_ndjson, filas_detalle) a partir de la colección ventas."""
    lineas_ordenes = []
    filas_detalle = []

    for venta in col.find():
        orden_id = _id_str(venta["_id"])
        lineas_ordenes.append(json.dumps({
            "orden_id": orden_id,
            "usuario_id": int(venta.get("usuario_id", 0)),
            "total": float(venta.get("total", 0)),
            "estado": venta.get("estado", ""),
            "direccion_envio": venta.get("direccion_envio", ""),
            "creado_en": _fecha_str(venta.get("creado_en")),
        }, ensure_ascii=False))

        for item in venta.get("items", []):
            filas_detalle.append({
                "orden_id": orden_id,
                "producto_id": str(item.get("producto_id", "")),
                "cantidad": str(item.get("cantidad", "")),
                "precio_unitario": str(item.get("precio_unitario", "")),
            })

    return lineas_ordenes, filas_detalle


def extraer_resenas(col):
    lineas = []
    for r in col.find():
        lineas.append(json.dumps({
            "producto_id": int(r.get("producto_id", 0)),
            "usuario_id": int(r.get("usuario_id", 0)),
            "calificacion": int(r.get("calificacion", 0)),
            "comentario": r.get("comentario", ""),
            "creado_en": _fecha_str(r.get("creado_en")),
        }, ensure_ascii=False))
    return lineas


def detalle_a_csv(filas):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["orden_id", "producto_id", "cantidad", "precio_unitario"])
    writer.writeheader()
    writer.writerows(filas)
    return buf.getvalue().encode("utf-8")


def main():
    log.info("Conectando a MongoDB %s / %s ...", MONGO_URI.split("@")[-1], MONGO_DB)
    cliente = MongoClient(MONGO_URI)
    db = cliente[MONGO_DB]
    s3 = boto3.client("s3")

    lineas_ordenes, filas_detalle = extraer_ventas(db["ventas"])
    lineas_resenas = extraer_resenas(db["resenas"])

    cuerpo_ordenes = ("\n".join(lineas_ordenes) + "\n").encode("utf-8")
    cuerpo_detalle = detalle_a_csv(filas_detalle)
    cuerpo_resenas = ("\n".join(lineas_resenas) + "\n").encode("utf-8")

    s3.put_object(Bucket=S3_BUCKET, Key=DESTINO_ORDENES, Body=cuerpo_ordenes)
    log.info("OK | coleccion=ventas→ordenes | docs=%d | destino=s3://%s/%s", len(lineas_ordenes), S3_BUCKET, DESTINO_ORDENES)

    s3.put_object(Bucket=S3_BUCKET, Key=DESTINO_DETALLE, Body=cuerpo_detalle)
    log.info("OK | coleccion=ventas→detalle_ordenes | filas=%d | destino=s3://%s/%s", len(filas_detalle), S3_BUCKET, DESTINO_DETALLE)

    s3.put_object(Bucket=S3_BUCKET, Key=DESTINO_RESENAS, Body=cuerpo_resenas)
    log.info("OK | coleccion=resenas | docs=%d | destino=s3://%s/%s", len(lineas_resenas), S3_BUCKET, DESTINO_RESENAS)

    log.info("Ingesta finalizada. Archivos cargados correctamente: 3")
    cliente.close()


if __name__ == "__main__":
    main()
