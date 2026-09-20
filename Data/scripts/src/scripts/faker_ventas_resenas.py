"""Genera datos sintéticos de ventas (pedidos) y reseñas para MS3 (MongoDB),
a partir de los usuarios y productos ya generados por faker_users.py y
build_catalogo.py. No hace scraping ni se conecta a ninguna base de datos:
solo lee los CSVs existentes y escribe los archivos de salida.

Entradas (deben existir):
  - Data/csv/usuarios.csv
  - Data/csv/direcciones_envio.csv
  - Data/csv/catalogo/productos.csv

Salidas en Data/csv/ventas/ (mismo layout que el bucket S3 del blueprint §7,
así el futuro contenedor de ingesta puede subirlos tal cual):
  - ordenes.json         (NDJSON: un pedido por línea — cabecera de la venta)
  - detalle_ordenes.csv  (líneas de cada pedido: producto, cantidad, precio)
  - resenas.json         (NDJSON: una reseña por línea)

Reglas de integridad (importantes, no solo "datos random"):
  - `orden_id` es un string hexadecimal de 24 caracteres, generado de forma
    secuencial (contador global) -> nunca se repite entre dos pedidos, sin
    importar el usuario. Además es compatible con ObjectId de MongoDB, para
    que `load_csv_bd.py --solo-mongo` lo pueda usar directamente como `_id`
    del documento y las rutas existentes de MS3 (que validan el id con
    `mongoose.Types.ObjectId.isValid`) sigan funcionando con datos sembrados.
  - Un mismo `producto_id` SÍ puede aparecer en muchos pedidos distintos
    (incluso de usuarios distintos) — eso es normal y esperado. Lo único que
    nunca se repite es el `orden_id` en sí.
  - Dentro de un mismo pedido no se repite el mismo producto dos veces
    (un pedido no tiene dos líneas separadas para el mismo producto).
  - Una reseña es única por (producto_id, usuario_id), igual que el índice
    único de Backend/ventas-resenas/src/models/Resena.js.
  - `precio_unitario` en el detalle es el precio real del producto en
    `catalogo/productos.csv` (precio pagado en ese momento, no un número
    inventado), y `total` de cada pedido es la suma de sus líneas.
"""

import csv
import json
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from faker import Faker

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[3]  # Data/
CSV_DIR = BASE_DIR / "csv"

USUARIOS_CSV = CSV_DIR / "usuarios.csv"
DIRECCIONES_CSV = CSV_DIR / "direcciones_envio.csv"
PRODUCTOS_CSV = CSV_DIR / "catalogo" / "productos.csv"

OUTPUT_DIR = CSV_DIR / "ventas"
ORDENES_JSON = OUTPUT_DIR / "ordenes.json"
DETALLE_ORDENES_CSV = OUTPUT_DIR / "detalle_ordenes.csv"
RESENAS_JSON = OUTPUT_DIR / "resenas.json"

TOTAL_ORDENES = int(os.getenv("TOTAL_ORDENES", "12000"))
TOTAL_RESENAS = int(os.getenv("TOTAL_RESENAS", "12000"))
DIAS_HISTORIAL = int(os.getenv("DIAS_HISTORIAL", "365"))
SEED = int(os.getenv("SEED", "42"))

ITEMS_POR_ORDEN = [1, 2, 3, 4]
PESOS_ITEMS_POR_ORDEN = [0.40, 0.30, 0.20, 0.10]

ESTADOS_ORDEN = ["confirmada", "cancelada", "fallida"]
PESOS_ESTADOS_ORDEN = [0.90, 0.07, 0.03]

CALIFICACIONES = [5, 4, 3, 2, 1]
PESOS_CALIFICACIONES = [0.40, 0.30, 0.15, 0.10, 0.05]

COMENTARIOS_POR_CALIFICACION = {
    5: [
        "Excelente producto, superó mis expectativas.",
        "Llegó rápido y en perfecto estado, muy recomendado.",
        "Calidad excelente, lo volvería a comprar sin dudar.",
        "Justo lo que necesitaba, funciona perfecto.",
        "",
    ],
    4: [
        "Muy buen producto, cumple lo que promete.",
        "Buena relación calidad-precio.",
        "Todo bien, solo el empaque llegó un poco golpeado.",
        "",
    ],
    3: [
        "Cumple, aunque esperaba un poco más por el precio.",
        "Está bien, nada extraordinario.",
        "",
    ],
    2: [
        "No es lo que esperaba, la calidad podría mejorar.",
        "Llegó con un detalle de fábrica.",
        "",
    ],
    1: [
        "No cumplió mis expectativas para nada.",
        "Llegó dañado, tuve que solicitar cambio.",
        "",
    ],
}

fake = Faker("es_ES")
Faker.seed(SEED)
random.seed(SEED)


def _fecha_aleatoria_reciente() -> str:
    delta = timedelta(days=random.uniform(0, DIAS_HISTORIAL), seconds=random.uniform(0, 86400))
    fecha = datetime.now(timezone.utc) - delta
    return fecha.isoformat()


def _leer_csv(ruta: Path) -> list[dict]:
    if not ruta.exists():
        raise SystemExit(f"Falta {ruta}. Genera primero los usuarios/catálogo (faker_users.py / build_catalogo.py).")
    with ruta.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def cargar_direcciones_por_usuario(filas_direcciones: list[dict]) -> dict[int, str]:
    direcciones = {}
    for fila in filas_direcciones:
        usuario_id = int(fila["usuario_id"])
        if usuario_id not in direcciones:  # nos alcanza con la primera (es_principal)
            direcciones[usuario_id] = f"{fila['direccion']}, {fila['distrito']}, {fila['ciudad']}, {fila['pais']}"
    return direcciones


def generar_ordenes(total_usuarios: int, precios_por_producto: dict[int, float], direcciones: dict[int, str]):
    """Genera cabeceras (ordenes) y líneas (detalle_ordenes). Devuelve (ordenes, detalle)."""
    ordenes = []
    detalle = []
    ids_producto = list(precios_por_producto.keys())

    for contador in range(1, TOTAL_ORDENES + 1):
        orden_id = f"{contador:024x}"  # 24 hex chars: compatible con ObjectId de Mongo
        usuario_id = random.randint(1, total_usuarios)
        cantidad_items = random.choices(ITEMS_POR_ORDEN, weights=PESOS_ITEMS_POR_ORDEN, k=1)[0]
        productos_pedido = random.sample(ids_producto, k=min(cantidad_items, len(ids_producto)))

        total_orden = 0.0
        for producto_id in productos_pedido:
            cantidad = random.randint(1, 3)
            precio_unitario = precios_por_producto[producto_id]
            detalle.append({
                "orden_id": orden_id,
                "producto_id": producto_id,
                "cantidad": cantidad,
                "precio_unitario": precio_unitario,
            })
            total_orden += cantidad * precio_unitario

        ordenes.append({
            "orden_id": orden_id,
            "usuario_id": usuario_id,
            "total": round(total_orden, 2),
            "estado": random.choices(ESTADOS_ORDEN, weights=PESOS_ESTADOS_ORDEN, k=1)[0],
            "direccion_envio": direcciones.get(usuario_id, ""),
            "creado_en": _fecha_aleatoria_reciente(),
        })

        if contador % 2000 == 0:
            print(f"  ... {contador}/{TOTAL_ORDENES} órdenes")

    return ordenes, detalle


def generar_resenas(total_usuarios: int, ids_producto: list[int]):
    """Genera reseñas únicas por (producto_id, usuario_id)."""
    resenas = []
    pares_usados = set()
    intentos_maximos = TOTAL_RESENAS * 5
    intentos = 0

    while len(resenas) < TOTAL_RESENAS and intentos < intentos_maximos:
        intentos += 1
        usuario_id = random.randint(1, total_usuarios)
        producto_id = random.choice(ids_producto)
        clave = (producto_id, usuario_id)
        if clave in pares_usados:
            continue
        pares_usados.add(clave)

        calificacion = random.choices(CALIFICACIONES, weights=PESOS_CALIFICACIONES, k=1)[0]
        resenas.append({
            "producto_id": producto_id,
            "usuario_id": usuario_id,
            "calificacion": calificacion,
            "comentario": random.choice(COMENTARIOS_POR_CALIFICACION[calificacion]),
            "creado_en": _fecha_aleatoria_reciente(),
        })

        if len(resenas) % 2000 == 0:
            print(f"  ... {len(resenas)}/{TOTAL_RESENAS} reseñas")

    if len(resenas) < TOTAL_RESENAS:
        print(f"[ADVERTENCIA] Solo se generaron {len(resenas)} reseñas únicas "
              f"(se pidieron {TOTAL_RESENAS}); se agotaron los pares producto/usuario disponibles.")

    return resenas


def escribir_ndjson(ruta: Path, filas: list[dict]):
    with ruta.open("w", encoding="utf-8") as f:
        for fila in filas:
            f.write(json.dumps(fila, ensure_ascii=False) + "\n")


def escribir_csv(ruta: Path, filas: list[dict], columnas: list[str]):
    with ruta.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columnas)
        writer.writeheader()
        writer.writerows(filas)


def main():
    filas_usuarios = _leer_csv(USUARIOS_CSV)
    filas_direcciones = _leer_csv(DIRECCIONES_CSV)
    filas_productos = _leer_csv(PRODUCTOS_CSV)

    total_usuarios = len(filas_usuarios)
    precios_por_producto = {int(r["id"]): float(r["precio"]) for r in filas_productos}
    direcciones = cargar_direcciones_por_usuario(filas_direcciones)

    print(f"Usuarios: {total_usuarios} | Productos: {len(precios_por_producto)} | "
          f"Órdenes a generar: {TOTAL_ORDENES} | Reseñas a generar: {TOTAL_RESENAS}")

    print("\nGenerando órdenes y su detalle...")
    ordenes, detalle = generar_ordenes(total_usuarios, precios_por_producto, direcciones)

    print("\nGenerando reseñas...")
    resenas = generar_resenas(total_usuarios, list(precios_por_producto.keys()))

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    escribir_ndjson(ORDENES_JSON, ordenes)
    escribir_csv(DETALLE_ORDENES_CSV, detalle, ["orden_id", "producto_id", "cantidad", "precio_unitario"])
    escribir_ndjson(RESENAS_JSON, resenas)

    orden_ids = {o["orden_id"] for o in ordenes}
    assert len(orden_ids) == len(ordenes), "Se generaron orden_id duplicados (no debería pasar)."

    print("\n=== RESUMEN ===")
    print(f"Órdenes:         {len(ordenes)} -> {ORDENES_JSON}")
    print(f"Líneas de pedido:{len(detalle):>6} -> {DETALLE_ORDENES_CSV}")
    print(f"Reseñas:         {len(resenas)} -> {RESENAS_JSON}")
    print(f"orden_id únicos: {len(orden_ids)} (= total de órdenes, sin colisiones)")
    print(f"Promedio de calificación: {sum(r['calificacion'] for r in resenas) / len(resenas):.2f}")


if __name__ == "__main__":
    main()
