# CloudShop · Ingesta (MV de ingesta)

Contenedores Python que extraen el **100 % de los registros** de cada base de datos
operacional (estrategia pull) y cargan archivos CSV/JSON en el bucket S3 del data lake.
Cada contenedor se conecta a una sola fuente con credenciales de **solo lectura** y
usa las credenciales de AWS del IAM Role de la EC2 (nunca claves en el código).

La ingesta es **manual**: un operador la dispara ejecutando `docker compose up` en la
VM de ingesta cuando necesita refrescar los datos en S3. Las imágenes viven en Docker
Hub, así que la VM no necesita compilar nada.

## Contenedores

| Contenedor | Fuente | Tablas/colecciones | Archivos en S3 |
|---|---|---|---|
| `ingesta-usuarios` | PostgreSQL (`cloudshop_usuarios`) | `usuarios`, `direcciones_envio` | `usuarios/usuarios.csv`, `direcciones_envio/direcciones_envio.csv` |
| `ingesta-catalogo` | MySQL (`cloudshop_catalogo`) | `categorias`, `productos`, `inventario`, `movimientos_stock` | `categorias/categorias.csv`, `productos/productos.csv`, `inventario/inventario.csv`, `movimientos_stock/movimientos_stock.csv` |
| `ingesta-ventas` | MongoDB (`cloudshop_ventas`) | `ventas`, `resenas` | `ordenes/ordenes.json`, `detalle_ordenes/detalle_ordenes.csv`, `resenas/resenas.json` |

> **Un prefijo de S3 por tabla, siempre.** Athena/Glue definen una tabla a partir de todos los archivos que comparten un prefijo. Dos archivos con columnas distintas en el mismo prefijo mezclarían sus columnas en Athena.

## Estructura del bucket S3

```text
s3://cloudshop-data-lake-2026-utec-mr-cs2032-v2/
├── usuarios/usuarios.csv
├── direcciones_envio/direcciones_envio.csv
├── categorias/categorias.csv
├── productos/productos.csv
├── inventario/inventario.csv
├── movimientos_stock/movimientos_stock.csv
├── ordenes/ordenes.json
├── detalle_ordenes/detalle_ordenes.csv
└── resenas/resenas.json
```

## Flujo completo

### 1. Publicar imágenes en Docker Hub (una sola vez, desde tu máquina de desarrollo)

```bash
cd Ingesta
cp .env.example .env
nano .env    # DOCKERHUB_USER=tu_usuario_dockerhub

docker compose build
docker login
docker compose push
```

### 2. Configurar la VM de ingesta (primera vez)

En `cloudshop-mv-ingesta` (via SSH o EC2 Instance Connect):

```bash
cd /home/ubuntu/cloudshop/Ingesta

cp .env.example .env
nano .env    # DOCKERHUB_USER=tu_usuario_dockerhub

cp ingesta-usuarios/.env.example ingesta-usuarios/.env
cp ingesta-catalogo/.env.example ingesta-catalogo/.env
cp ingesta-ventas/.env.example  ingesta-ventas/.env

nano ingesta-usuarios/.env   # POSTGRES_HOST=10.0.1.10
nano ingesta-catalogo/.env   # MYSQL_HOST=10.0.1.10
nano ingesta-ventas/.env     # MONGO_URI=mongodb://10.0.1.10:27017/cloudshop_ventas
```

### 3. Trigger manual (cada vez que quieras refrescar S3)

```bash
cd /home/ubuntu/cloudshop/Ingesta

docker compose pull    # descarga las imágenes desde Docker Hub
docker compose up      # ejecuta los 3 contenedores; terminan solos al acabar
```

### 4. Verificar

```bash
docker compose logs    # debe mostrar "OK | tabla/coleccion=... | filas/docs=..." por cada uno

# Ver archivos en S3:
aws s3 ls s3://TU-BUCKET/ --recursive
```

## Requisitos previos

1. Las VMs de datos deben estar corriendo con datos cargados (`docker compose -f docker-compose.datos.yml up -d` + scripts de carga).
2. Usuarios de solo lectura creados automáticamente por los init SQL:
   - PostgreSQL: `ingesta_pg` / `ingesta_pg_readonly`
   - MySQL: `ingesta_my` / `ingesta_my_readonly`
   - MongoDB: sin autenticación (aislado por Security Group)
3. La VM de ingesta debe tener el IAM Role `LabInstanceProfile` asignado (permisos S3).
