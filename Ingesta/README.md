# CloudShop · Ingesta (MV de ingesta)

Contenedores Python que extraen el **100 % de los registros** de cada base de datos
operacional (estrategia pull) y cargan archivos CSV en el bucket S3 del data lake.
Cada contenedor se conecta a una sola fuente con credenciales de **solo lectura** y
usa las credenciales de AWS del IAM Role de la EC2 (nunca claves en el código).

## Contenedores

| Contenedor | Fuente | Tablas | Archivos en S3 |
|---|---|---|---|
| `ingesta-usuarios` | PostgreSQL (`cloudshop_usuarios`) | `usuarios`, `direcciones_envio` | `usuarios/usuarios.csv`, `usuarios/direcciones_envio.csv` |
| `ingesta-catalogo` | MySQL (`cloudshop_catalogo`) | `categorias`, `productos`, `inventario`, `movimientos_stock` | `catalogo/*.csv` |
| `ingesta-ventas` *(pendiente)* | MongoDB | `ordenes`, `resenas` | `ventas/ordenes.json`, `ventas/detalle_ordenes.csv`, `ventas/resenas.json` |

> Para este primer entregable solo existen los microservicios de Catálogo (MySQL) y
> Usuarios (PostgreSQL). `ingesta-ventas` se incorpora cuando exista el microservicio
> de Ventas/Reseñas (MongoDB), junto con el microservicio de Órdenes.

## Estructura del bucket S3

```text
s3://cloudshop-data-lake-2026-g05/
├── usuarios/
│   ├── usuarios.csv
│   └── direcciones_envio.csv
└── catalogo/
    ├── categorias.csv
    ├── productos.csv
    ├── inventario.csv
    └── movimientos_stock.csv
```

## Requisitos previos

1. La MV de datos debe estar desplegada (MySQL + PostgreSQL) y con los CSVs cargados
   (ver `Backend/DESPLIEGUE.md` o `DESPLIEGUE_AWS.md`).
2. Las bases deben tener los usuarios de **solo lectura** creados (se crean
   automáticamente en el primer arranque con `Backend/products/init.sql` y
   `Backend/postgres-init/01_esquema.sql`):
   - PostgreSQL: `ingesta_pg` (contraseña `ingesta_pg_readonly`)
   - MySQL: `ingesta_my` (contraseña `ingesta_my_readonly`)
3. La EC2 de ingesta debe tener un IAM Role con permisos de escritura en el bucket S3.

## Ejecutar

```bash
cd Ingesta

cp ingesta-usuarios/.env.example ingesta-usuarios/.env
cp ingesta-catalogo/.env.example ingesta-catalogo/.env

# Editar las IPs privadas y claves:
nano ingesta-usuarios/.env
nano ingesta-catalogo/.env

docker compose up --build
```

Cada contenedor ejecuta la extracción una vez y termina. Los logs muestran el conteo
de filas extraídas por tabla y el destino `s3://...` de cada archivo.

## Verificación

```bash
docker compose logs        # filas extraídas por tabla y estado OK
aws s3 ls s3://cloudshop-data-lake-2026-g05/ --recursive
```

La analítica posterior (Glue → Athena → Microservicio analítico) consume estos archivos.
