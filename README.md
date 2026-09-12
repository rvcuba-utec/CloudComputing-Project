# CloudShop — E-commerce con arquitectura de microservicios

Proyecto de Cloud Computing: e-commerce con microservicios sobre AWS.

## Estructura del repositorio

```
Backend/                  Microservicios operacionales
├── products/             Catálogo e Inventario (Go + Gin + MySQL)
├── users-address/        Usuarios y Direcciones (Python + FastAPI + PostgreSQL)
├── docker-compose.yml    VM de aplicación (catálogo + usuarios)
├── docker-compose.datos.yml  VM de datos (MySQL + PostgreSQL)
└── DESPLIEGUE.md         Guía de despliegue paso a paso

Data/                     Pipeline de datos
├── csv/                  CSVs generados (usuarios, productos, catálogo)
└── scripts/              Scripts de generación y carga
    ├── scrapping_falabella.py   → scraping de Falabella (50 categorías)
    ├── faker_users.py           → 20,000 usuarios + direcciones sintéticas
    ├── build_catalogo.py        → transforma scraping → CSVs del catálogo
    └── load_csv_bd.py           → carga CSVs en MySQL/PostgreSQL

Proposal/                 Documentos de sustentación
├── 03_Sustentacion_final.md   ← documento principal (backend + datos)
├── 02_Sustentacion_Data_Science_CloudShop.md
└── 01_Sustentacion_Backend_Frontend_CloudShop.md
```

## Estado actual

**Microservicios operacionales:**
- **Catálogo (Go + MySQL)**: 5,699 productos reales (scraping de Falabella), 50 categorías, inventario 1:1, movimientos de stock transaccionales.
- **Usuarios (Python + PostgreSQL)**: 20,000 usuarios con JWT, perfiles y direcciones de envío.

**Datos:**
- 5,699 productos + 50 categorías + 5,699 inventario (MySQL)
- 20,000 usuarios + 20,000 direcciones (PostgreSQL)
- 25,000 movimientos de stock (procedimiento almacenado)
- **Total: ~76,000 registros operacionales**

**Pendiente:**
- Microservicio de Reseñas (Node.js + MongoDB)
- Microservicio de Órdenes (orquestador)
- MV de ingesta (contenedores Python → S3 → Glue → Athena)
- Frontend en AWS Amplify

## Quickstart

Ver `Backend/DESPLIEGUE.md` para el despliegue completo en VMs de AWS.

Para regenerar los datos:
```bash
cd Data/scripts
uv sync
uv run python -m scripts.faker_users        # 20k usuarios + direcciones
uv run python -m scripts.build_catalogo     # scraping → catálogo
uv run python -m scripts.load_csv_bd --dry-run  # validar
```

## Documentación

- **Sustentación final**: `Proposal/03_Sustentacion_final.md`
- **Despliegue**: `Backend/DESPLIEGUE.md`
- **Scripts de datos**: `Data/scripts/README.md`
