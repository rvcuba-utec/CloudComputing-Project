# Scripts de datos — CloudShop

Pipeline de generación y carga de datos para las bases de datos operacionales. Gestor: **uv** (Python ≥ 3.14).

## Scripts

| Script | Entrada | Salida |
|---|---|---|
| `scrapping_falabella.py` | Falabella (Playwright) | `Data/csv/products.csv` (+ imágenes en `Data/csv/imagenes/`) |
| `faker_users.py` | — | `Data/csv/usuarios.csv` (20,000) y `Data/csv/direcciones_envio.csv` (20,000) |
| `build_catalogo.py` | `Data/csv/products.csv` | `Data/csv/catalogo/{categorias,productos,inventario}.csv` |
| `faker_ventas_resenas.py` | usuarios + catálogo (arriba) | `Data/csv/ventas/{ordenes.json,detalle_ordenes.csv,resenas.json}` |
| `load_csv_bd.py` | todos los archivos anteriores | MySQL (`cloudshop_catalogo`) + PostgreSQL (`cloudshop_usuarios`) + MongoDB (`cloudshop_ventas`) |

Variables de entorno (opcionales, vía `.env` o entorno):
- `faker_users.py`: `TOTAL_USUARIOS`, `BATCH_SIZE`, `BCRYPT_ROUNDS`, `PASSWORD_PREFIX`, `PAIS`, `CIUDAD`.
- `faker_ventas_resenas.py`: `TOTAL_ORDENES` (12,000), `TOTAL_RESENAS` (12,000), `DIAS_HISTORIAL` (365), `SEED` (42).
- `load_csv_bd.py`: requiere `MYSQL_*`, `DATABASE_URL` y `MONGO_URI` (plantilla: `Backend/.env.example`).

## Uso

```bash
cd Data/scripts
uv sync                                              # instalar dependencias (incluye pymongo)

# 1. Usuarios y direcciones sintéticas (idempotente: reanuda si se corta)
uv run python -m scripts.faker_users

# 2. Transformar el scraping al esquema del catálogo (determinista, seed=42)
uv run python -m scripts.build_catalogo

# 3. Órdenes, detalle de órdenes y reseñas (determinista, seed=42; requiere 1 y 2)
uv run python -m scripts.faker_ventas_resenas

# 4. Cargar en las bases de datos (requiere .env con la IP de la VM de datos)
cp ../Backend/.env.example .env && nano .env
uv run python -m scripts.load_csv_bd --dry-run        # valida los archivos sin conectar
uv run python -m scripts.load_csv_bd                 # carga completa (MySQL + Postgres + Mongo)
uv run python -m scripts.load_csv_bd --solo-mongo     # solo ventas/reseñas

# Re-scraping (opcional, horas de runtime):
# uv run playwright install chromium
# uv run python -m scripts.scrapping_falabella
```

## Integridad de ventas/reseñas

- `orden_id` es un código único de 24 caracteres hexadecimales (compatible con
  `ObjectId` de MongoDB) generado con un contador global: **dos pedidos nunca
  comparten `orden_id`**, sin importar el usuario. `load_csv_bd.py` valida esto
  explícitamente antes de cargar.
- Un mismo `producto_id` sí puede aparecer en muchos pedidos distintos (incluso
  de usuarios distintos) — es lo esperable con miles de compras y ~5,700 productos.
- Cada reseña es única por `(producto_id, usuario_id)`, igual que el índice
  único de `Backend/ventas-resenas/src/models/Resena.js`.
- `precio_unitario` de cada línea de pedido es el precio real del producto en
  `catalogo/productos.csv` al momento de generarlo (no un número inventado), y
  el `total` del pedido es la suma de sus líneas.

## Conteo actual

| Dataset | Registros |
|---|---|
| usuarios | 20,000 |
| direcciones_envio | 20,000 |
| categorías | 50 |
| productos | 5,699 |
| inventario | 5,699 (284 agotados) |
| movimientos_stock (al cargar) | 25,000 |
| órdenes (`ventas`, MongoDB) | 12,000 |
| líneas de pedido (`detalle_ordenes`) | ~27,000 (1–4 por orden) |
| reseñas (`resenas`, MongoDB) | 12,000 |

Guía completa de despliegue y carga: `Backend/DESPLIEGUE.md`.
