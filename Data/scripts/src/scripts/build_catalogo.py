"""Transforma el CSV del scraping de Falabella (products.csv) a los CSVs
del catálogo listos para cargar en MySQL (cloudshop_catalogo).

Salidas en Data/csv/catalogo/:
  - categorias.csv  (id, nombre, descripcion)   -> tabla categorias
  - productos.csv   (id, categoria_id, sku, nombre, descripcion, marca,
                     imagen_url, origen_url, precio, precio_oferta, activo)
  - inventario.csv  (producto_id, stock_disponible, stock_reservado)

Reglas:
  - Categorías 1:1 con las categorías scrapeadas (slug -> nombre legible).
  - precio = COALESCE(cmr_price, internet_price, event_price, normal_price);
    las filas sin ningún precio válido se descartan.
  - precio_oferta = normal_price solo si difiere del precio vigente.
  - Stock sintético determinista (seed fija): 1-500 unidades, ~5% agotado.
"""

import re
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[3]  # Data/
CSV_DIR = BASE_DIR / "csv"
SOURCE_CSV = CSV_DIR / "products.csv"
OUTPUT_DIR = CSV_DIR / "catalogo"

PRECIO_COLS = ["cmr_price", "internet_price", "event_price", "normal_price"]

SEED = 42
FRACCION_AGOTADOS = 0.05

MAX_NOMBRE = 150
MAX_MARCA = 80
MAX_URL = 512


def nombre_legible(slug: str) -> str:
    return " ".join(palabra.capitalize() for palabra in str(slug).split("-"))


def parse_precio(valor) -> float:
    if valor is None:
        return np.nan

    s = str(valor).strip()
    if s == "" or s.lower() == "nan":
        return np.nan

    # Formato de miles: "1,449" o "1,349.90" -> quitar las comas.
    if re.fullmatch(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?", s):
        s = s.replace(",", "")
    elif "," in s:
        # Precio múltiple ("69.90,99.90"): tomar el primer valor (el más bajo).
        s = s.split(",")[0]

    try:
        return float(s)
    except ValueError:
        return np.nan


def consolidar_precios(df: pd.DataFrame) -> pd.DataFrame:
    precios = df[PRECIO_COLS].apply(lambda col: col.map(parse_precio))
    df["precio"] = precios.bfill(axis=1).iloc[:, 0].round(2)
    df = df[df["precio"].notna() & (df["precio"] > 0)].copy()

    normal = precios.loc[df.index, "normal_price"]
    con_oferta = normal.notna() & (normal != df["precio"])
    df["precio_oferta"] = np.where(con_oferta, normal, np.nan)
    return df


def main():
    if not SOURCE_CSV.exists():
        raise SystemExit(f"No existe {SOURCE_CSV}. Ejecuta scrapping_falabella.py primero.")

    df = pd.read_csv(SOURCE_CSV)
    df = df.rename(columns={"description": "descripcion"})
    df = df.drop_duplicates(subset=["link"])
    df = df[df["category"].notna() & (df["category"].astype(str).str.strip() != "")]
    print(f"Filas leídas de {SOURCE_CSV.name}: {len(df)} (sin duplicados por link)")

    df = consolidar_precios(df)
    print(f"Filas con precio válido: {len(df)}")

    categorias_slug = list(df["category"].drop_duplicates())
    mapa_categorias = {slug: i + 1 for i, slug in enumerate(categorias_slug)}
    df["categoria_id"] = df["category"].map(mapa_categorias)

    df = df.sort_values(["categoria_id", "name"], kind="stable").reset_index(drop=True)
    df["id"] = np.arange(1, len(df) + 1)
    df["sku"] = [f"CAT-{i:06d}" for i in df["id"]]
    df["nombre"] = df["name"].astype(str).str.slice(0, MAX_NOMBRE)
    df["marca"] = df["brand_name"].fillna("").astype(str).str.slice(0, MAX_MARCA)
    df["imagen_url"] = df["local_image"].fillna("").astype(str).str.slice(0, MAX_URL)
    df["origen_url"] = df["link"].fillna("").astype(str).str.slice(0, MAX_URL)
    df["activo"] = 1

    rng = np.random.default_rng(SEED)
    n = len(df)
    stock = rng.integers(1, 501, size=n)
    agotados = rng.choice(n, size=max(1, int(n * FRACCION_AGOTADOS)), replace=False)
    stock[agotados] = 0
    reservado = np.where(stock > 0, rng.integers(0, 11, size=n), 0)

    categorias_df = pd.DataFrame(
        {
            "id": range(1, len(categorias_slug) + 1),
            "nombre": [nombre_legible(slug) for slug in categorias_slug],
            "descripcion": [f"Catálogo de {nombre_legible(slug).lower()}" for slug in categorias_slug],
        }
    )

    productos_df = df[
        ["id", "categoria_id", "sku", "nombre", "descripcion", "marca",
         "imagen_url", "origen_url", "precio", "precio_oferta", "activo"]
    ].rename(columns={"id": "id"})

    inventario_df = pd.DataFrame(
        {
            "producto_id": df["id"],
            "stock_disponible": stock,
            "stock_reservado": reservado,
        }
    )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    categorias_out = OUTPUT_DIR / "categorias.csv"
    productos_out = OUTPUT_DIR / "productos.csv"
    inventario_out = OUTPUT_DIR / "inventario.csv"

    categorias_df.to_csv(categorias_out, index=False)
    productos_df.to_csv(productos_out, index=False)
    inventario_df.to_csv(inventario_out, index=False)

    print("\n=== RESUMEN ===")
    print(f"Categorías: {len(categorias_df)} -> {categorias_out}")
    print(f"Productos:  {len(productos_df)} -> {productos_out}")
    print(f"Inventario: {len(inventario_df)} -> {inventario_out}")
    print(f"Productos con precio_oferta: {int(productos_df['precio_oferta'].notna().sum())}")
    print(f"Productos agotados (stock 0): {int((inventario_df['stock_disponible'] == 0).sum())}")
    print("\nProductos por categoría:")
    print(productos_df.groupby("categoria_id", sort=True).size().to_string())


if __name__ == "__main__":
    main()
