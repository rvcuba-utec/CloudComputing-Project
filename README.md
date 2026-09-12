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

Frontend/                 SPA React (Vite) desplegada en AWS Amplify

Ingesta/                  MV de ingesta (contenedores Python → S3)
├── ingesta-usuarios/     PostgreSQL → usuarios.csv, direcciones_envio.csv
├── ingesta-catalogo/     MySQL → categorias, productos, inventario, movimientos_stock
└── docker-compose.yml    orquesta los contenedores de ingesta

infrastructure/           Infraestructura como código (CloudFormation)
└── cloudformation.yaml   VPC, subredes, Security Groups, 4 MV, S3

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

**Infraestructura (primer entregable):**
- `infrastructure/cloudformation.yaml` despliega la VPC, los Security Groups (app, base de datos privada, ingesta), las 4 MV (2 de aplicación + datos + ingesta) y el bucket S3. La MV de ingesta reutiliza el instance profile del laboratorio `LabInstanceProfile`.
- `Ingesta/` contiene los contenedores Python que extraen el 100 % de los registros y los cargan en S3 (usuarios + catálogo).
- Guía paso a paso: `DESPLIEGUE_AWS.md`.

**Pendiente:**
- Microservicio de Reseñas (Node.js + MongoDB) y su contenedor `ingesta-ventas`
- Microservicio de Órdenes (orquestador)
- Glue (catálogo de datos) + Athena (consultas y vistas) + Microservicio analítico
- API Gateway + NLB privado + segunda MV de producción
- Frontend en AWS Amplify

## Quickstart

Despliegue completo en AWS: ver `DESPLIEGUE_AWS.md` (CloudFormation).
Despliegue manual de las VMs: ver `Backend/DESPLIEGUE.md`.

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
- **Despliegue en AWS (paso a paso)**: `DESPLIEGUE_AWS.md`
- **Despliegue manual de VMs**: `Backend/DESPLIEGUE.md`
- **Ingesta**: `Ingesta/README.md`
- **Scripts de datos**: `Data/scripts/README.md`
- **Frontend**: `Frontend/README.md`
