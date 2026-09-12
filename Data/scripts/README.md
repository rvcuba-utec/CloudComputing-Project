# Scripts de datos — CloudShop

Pipeline de generación y carga de datos para las bases de datos operacionales. Gestor: **uv** (Python ≥ 3.14).

## Scripts

| Script | Entrada | Salida |
|---|---|---|
| `scrapping_falabella.py` | Falabella (Playwright) | `Data/csv/products.csv` (+ imágenes en `Data/csv/imagenes/`) |
| `faker_users.py` | — | `Data/csv/usuarios.csv` (20,000) y `Data/csv/direcciones_envio.csv` (20,000) |
| `build_catalogo.py` | `Data/csv/products.csv` | `Data/csv/catalogo/{categorias,productos,inventario}.csv` |
| `load_csv_bd.py` | los CSVs anteriores | MySQL (`cloudshop_catalogo`) + PostgreSQL (`cloudshop_usuarios`) |

Variables de entorno (opcionales, vía `.env` o entorno): `TOTAL_USUARIOS`, `BATCH_SIZE`, `BCRYPT_ROUNDS`, `PASSWORD_PREFIX`, `PAIS`, `CIUDAD`. Para `load_csv_bd.py` se requieren `MYSQL_*` y `DATABASE_URL` (plantilla: `Backend/.env.example`).

## Uso

```bash
cd Data/scripts
uv sync                                              # instalar dependencias

# 1. Usuarios y direcciones sintéticas (idempotente: reanuda si se corta)
uv run python -m scripts.faker_users

# 2. Transformar el scraping al esquema del catálogo (determinista, seed=42)
uv run python -m scripts.build_catalogo

# 3. Cargar en las bases de datos (requiere .env con la IP de la VM de datos)
cp ../Backend/.env.example .env && nano .env
uv run python -m scripts.load_csv_bd --dry-run        # valida CSVs sin conectar
uv run python -m scripts.load_csv_bd                 # carga completa

# Re-scraping (opcional, horas de runtime):
# uv run playwright install chromium
# uv run python -m scripts.scrapping_falabella
```

## Conteo actual

| Dataset | Registros |
|---|---|
| usuarios | 20,000 |
| direcciones_envio | 20,000 |
| categorías | 50 |
| productos | 5,699 |
| inventario | 5,699 (284 agotados) |
| movimientos_stock (al cargar) | 25,000 |

Guía completa de despliegue y carga: `Backend/DESPLIEGUE.md`.
