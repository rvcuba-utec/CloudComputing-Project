# CloudShop — Despliegue manual paso a paso en AWS Academy

> Guía 100% consola web de AWS (Academy Learner Lab). **Ningún paso usa AWS CLI ni PowerShell** para crear infraestructura — todo es clic en la consola. Los únicos comandos de terminal que aparecen son `bash` dentro de una sesión **SSH** contra una VM (instalar Docker, levantar `docker compose`, correr un script Python) o en tu máquina local para publicar el repo; eso es inevitable, es exactamente lo mismo que hace el ejemplo de bootstrap del propio `BLUEPRINT.md`.
>
> Este documento asume que ya leíste `BLUEPRINT.md` (arquitectura, puertos, nombres exactos de recursos) y que el repo tiene los 5 microservicios ya construidos (`Backend/{users-address,products,ventas-resenas,ordenes,analitica}`) y el frontend en `Frontend/frontend`.

---

## Antes de empezar

1. Inicia sesión en **AWS Academy Learner Lab** → botón **AWS** (te lleva a la consola con credenciales temporales).
2. Arriba a la derecha, verifica que estás en la región **us-east-1 (N. Virginia)**. Todo CloudShop está definido para esa región.
3. Busca "cuál es mi ip" en Google y anota tu IP pública (la usarás en varias reglas de Security Group como `TU_IP/32`).
4. Ten a mano:
   - El repo de GitHub de CloudShop (URL pública o con tu token si es privado).
   - Un usuario de **Docker Hub** (gratis, para alojar las 5 imágenes).
   - Contraseñas que vayas a usar para MySQL/PostgreSQL/JWT (inventa strings largos ahora, los necesitarás varias veces).

> ⚠️ **Particularidad de AWS Academy:** no existe usuario "root" ni permisos para crear roles IAM nuevos arbitrarios. El laboratorio ya trae un rol llamado **`LabInstanceProfile`** (o similar) con permisos de S3 — lo usamos tal cual en vez de crear uno nuevo. Si tu lab no lo tiene, avisa al profesor; no se puede continuar §8 sin esto.

---

## 1. Crear la VPC

**Sección:** barra de búsqueda superior → `VPC` → selecciona **VPC**.

1. Menú lateral → **Your VPCs**.
2. **Create VPC**.
3. **Resources to create**: **VPC only** (⚠️ no "VPC and more" — crearía subredes/NAT que no queremos).
4. **Name tag**: `cloudshop-vpc`
5. **IPv4 CIDR block**: **IPv4 CIDR manual input** → `10.0.0.0/16`
6. **IPv6 CIDR block**: **No IPv6 CIDR block**
7. **Tenancy**: **Default**
8. **Create VPC**.

**Resultado esperado:** `cloudshop-vpc` en estado `Available`.

---

## 2. Crear la subred pública

**Sección:** menú lateral → **Subnets**.

1. **Create subnet**.
2. **VPC ID**: `cloudshop-vpc`
3. **Subnet name**: `cloudshop-subnet-publica`
4. **Availability Zone**: `us-east-1a`
5. **IPv4 CIDR block**: `10.0.1.0/24`
6. **Create subnet**.

**Activar IP pública automática:**

7. Selecciona la casilla de `cloudshop-subnet-publica`.
8. **Actions** → **Edit subnet settings**.
9. Marca **Enable auto-assign public IPv4 address**.
10. **Save**.

---

## 3. Crear el Internet Gateway

**Sección:** menú lateral → **Internet gateways**.

1. **Create internet gateway**.
2. **Name tag**: `cloudshop-igw`
3. **Create internet gateway**.
4. Selecciona `cloudshop-igw` → **Actions** → **Attach to VPC**.
5. **Available VPCs**: `cloudshop-vpc`
6. **Attach internet gateway**.

**Resultado esperado:** estado `Attached`.

---

## 4. Crear la Route Table pública

**Sección:** menú lateral → **Route tables**.

1. **Create route table**.
2. **Name**: `cloudshop-rt-publica`
3. **VPC**: `cloudshop-vpc`
4. **Create route table**.
5. Selecciona `cloudshop-rt-publica` → pestaña **Routes** → **Edit routes**.
6. **Add route**: **Destination** `0.0.0.0/0`, **Target** → **Internet Gateway** → `cloudshop-igw`.
7. **Save changes**.
8. Pestaña **Subnet associations** → **Edit subnet associations** → marca `cloudshop-subnet-publica` → **Save associations**.

---

## 5. Crear los 4 Security Groups

**Sección:** menú lateral → **Security groups**. Créalos en este orden (algunos se referencian entre sí).

### 5.1 — `cloudshop-sg-alb`

1. **Create security group**.
2. **Name**: `cloudshop-sg-alb` — **Description**: `SG del Application Load Balancer` — **VPC**: `cloudshop-vpc`
3. **Inbound rules** → **Add rule**: Type `HTTP`, Port `80`, Source `0.0.0.0/0`.
4. **Outbound rules**: deja la regla por defecto (todo permitido).
5. **Create security group**.

### 5.2 — `cloudshop-sg-app`

1. **Create security group**. **Name**: `cloudshop-sg-app` — **VPC**: `cloudshop-vpc`
2. **Inbound rules** — agrega **estas 4 reglas**:

   | # | Type | Port range | Source |
   |---|---|---|---|
   | 1 | SSH | 22 | My IP |
   | 2 | Custom TCP | 8000, 8080, 8001, 8002, 8003 (una regla por puerto, o los 5 en una fila si la consola te deja rango separado por coma) | `cloudshop-sg-alb` |
   | 3 | Custom TCP | 8081 | My IP |
   | 4 | SSH | — | *(ninguna extra; ya cubierta arriba)* |

   > 📌 Puerto 8081 es Swagger UI (pendiente de construir per BLUEPRINT §11, pero deja la regla lista). Los puertos 8000/8080/8001/8002/8003 son los 5 microservicios — solo deben recibir tráfico del ALB, nunca directo de Internet.
3. **Create security group**.

### 5.3 — `cloudshop-sg-ingesta`

1. **Create security group**. **Name**: `cloudshop-sg-ingesta` — **VPC**: `cloudshop-vpc`
2. **Inbound rules**: Type `SSH`, Port `22`, Source `My IP`.
3. **Create security group**.

### 5.4 — `cloudshop-sg-bd`

1. **Create security group**. **Name**: `cloudshop-sg-bd` — **VPC**: `cloudshop-vpc`
2. **Inbound rules** — agrega **7 reglas**:

   | # | Type | Port | Source |
   |---|---|---|---|
   | 1 | SSH | 22 | `cloudshop-sg-app` |
   | 2 | MySQL/Aurora | 3306 | `cloudshop-sg-app` |
   | 3 | MySQL/Aurora | 3306 | `cloudshop-sg-ingesta` |
   | 4 | PostgreSQL | 5432 | `cloudshop-sg-app` |
   | 5 | PostgreSQL | 5432 | `cloudshop-sg-ingesta` |
   | 6 | Custom TCP 27017 | 27017 | `cloudshop-sg-app` |
   | 7 | Custom TCP 27017 | 27017 | `cloudshop-sg-ingesta` |

3. **Create security group**.

> ⚠️ **Regla de oro (BLUEPRINT §4):** 3306/5432/27017 **nunca** a `0.0.0.0/0`. Solo `sg-app` y `sg-ingesta`.

---

## 6. Lanzar las 4 EC2

**Sección:** barra de búsqueda → `EC2` → **Instances** → **Launch instances**.

Configuración común para las 4 (los valores que cambian están en la tabla de abajo):

- **Application and OS Images (AMI)**: **Ubuntu** → **Ubuntu Server 22.04 LTS (HVM), SSD Volume Type**, **64-bit (x86)**.
- **Instance type**: `t3.micro`
- **Key pair**: `vockey`
- **Network settings** → **Edit**: **VPC** `cloudshop-vpc`, **Subnet** `cloudshop-subnet-publica`, **Auto-assign public IP**: `Enable`, **Firewall**: *Select existing security group* (ver tabla).
- **Configure storage**: `20 GiB`, `gp3`.

| Campo | `cloudshop-mv-datos` | `cloudshop-mv-ingesta` | `cloudshop-mv-app-1` | `cloudshop-mv-app-2` |
|---|---|---|---|---|
| **Name** | `cloudshop-mv-datos` | `cloudshop-mv-ingesta` | `cloudshop-mv-app-1` | `cloudshop-mv-app-2` |
| **Security group** | `cloudshop-sg-bd` | `cloudshop-sg-ingesta` | `cloudshop-sg-app` | `cloudshop-sg-app` |
| **Advanced details → IAM instance profile** | *(ninguno)* | `LabInstanceProfile` | *(ninguno)* | *(ninguno)* |
| **IP privada fija (pasos abajo)** | `10.0.1.10` | `10.0.1.20` | `10.0.1.11` | `10.0.1.12` |

Lanza las 4 con **Launch instance**, una por una (repite el asistente completo 4 veces).

### 6.1 Fijar la IP privada de cada instancia

Para **cada una** de las 4, después de que arranque:

1. **Instances** → selecciónala → **Instance state** → **Stop instance**. Espera a `Stopped`.
2. Menú lateral → **Network Interfaces**.
3. Busca la ENI cuya descripción/instancia coincide con la VM.
4. Selecciónala → **Actions** → **Manage IP addresses**.
5. Cambia la **IPv4 address** actual por la de la tabla de arriba (`10.0.1.10`/`.11`/`.12`/`.20`).
6. **Save**.
7. Vuelve a **Instances** → selecciona la VM → **Instance state** → **Start instance**.

### 6.2 Conectarte por SSH

Para cada VM: selecciónala → **Connect** → pestaña **SSH client** → copia el comando `ssh -i "vockey.pem" ubuntu@<IP-pública>` → pégalo en tu terminal local.

---

## 7. Configurar cada VM (dentro de la sesión SSH)

### 7.1 Bootstrap común (las 4 VMs)

Pega esto en la sesión SSH de **cada** VM:

```bash
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sudo sh /tmp/get-docker.sh
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
exit
```

Vuelve a conectarte por SSH (para que el grupo `docker` tome efecto) y clona el repo:

```bash
git clone --depth 1 https://github.com/TU-USUARIO/CloudComputing-Project.git /home/ubuntu/cloudshop
sudo chown -R ubuntu:ubuntu /home/ubuntu/cloudshop
cd /home/ubuntu/cloudshop
```

> Reemplaza la URL por la de tu propio fork/repo. Si es privado, usa un token de acceso personal en la URL o configura una deploy key.

### 7.2 `cloudshop-mv-datos`: MySQL + PostgreSQL + MongoDB

```bash
cd /home/ubuntu/cloudshop/backend
cp .env.example .env
nano .env
```

En el `.env`, como mínimo define (deja el resto en sus valores por defecto):

```dotenv
MYSQL_ROOT_PASSWORD=una_clave_larga_1
MYSQL_PASSWORD=una_clave_larga_2
PG_PASSWORD=una_clave_larga_3
```

Levanta las 3 bases de datos:

```bash
docker compose -f docker-compose.datos.yml up -d
docker compose -f docker-compose.datos.yml ps      # espera "healthy" en las 3
```

Verifica que los esquemas se crearon:

```bash
docker exec cloudshop-mysql mysql -ucloud_user -p"$(grep MYSQL_PASSWORD .env | cut -d= -f2)" -e "USE cloudshop_catalogo; SHOW TABLES;"
docker exec cloudshop-postgres psql -U cloud_user -d cloudshop_usuarios -c "\dt"
docker exec cloudshop-mongo mongosh --quiet --eval "db.getMongo()"
```

> 📌 Esta VM **no necesita `docker login` ni Docker Hub** — solo corre bases de datos oficiales (`mysql`, `postgres`, `mongo`), no imágenes propias.

### 7.3 `cloudshop-mv-app-1`: build + push de las 5 imágenes

Esta es la única VM donde se **compila** el código (las demás solo hacen `pull`).

```bash
cd /home/ubuntu/cloudshop/backend
cp .env.example .env
nano .env
```

Completa **todas** las variables del `.env` (mismas claves de MySQL/PostgreSQL que pusiste en `mv-datos`, más las nuevas):

```dotenv
DOCKERHUB_USER=tu_usuario_dockerhub

MYSQL_HOST=10.0.1.10
MYSQL_PASSWORD=una_clave_larga_2
DATABASE_URL=postgresql+psycopg2://cloud_user:una_clave_larga_3@10.0.1.10:5432/cloudshop_usuarios
MONGO_URI=mongodb://10.0.1.10:27017/cloudshop_ventas

JWT_SECRET=un_string_largo_y_aleatorio_igual_en_los_5_servicios
ADMIN_EMAILS=admin@cloudshop.pe
CORS_ORIGINS=http://localhost:5173

AWS_REGION=us-east-1
ATHENA_DATABASE=cloudshop_analytics
ATHENA_WORKGROUP=cloudshop-wg
ATHENA_OUTPUT_S3=s3://TU-BUCKET/athena-results/
```

> ⚠️ `CORS_ORIGINS` lo vas a **volver a editar** en el paso 17 (Amplify) para agregar el dominio público del frontend. Por ahora déjalo así para poder probar.

Build, login y push (puede tardar varios minutos en un `t3.micro`; si el build de una imagen falla por falta de memoria, ver la nota de swap más abajo):

```bash
docker compose build
docker login                       # pide tu usuario y contraseña/token de Docker Hub
docker compose push
```

> 📌 **Nota de memoria (t3.micro = 1 GiB RAM):** si `docker compose build` muere sin terminar (el proceso simplemente se corta), crea un swapfile antes de reintentar:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> ```

Ahora sí levanta los 5 microservicios (ya construidos localmente, no hace falta `pull`):

```bash
docker compose up -d
docker compose ps        # los 5 en "healthy"
```

### 7.4 Cargar los datos (usuarios, catálogo, ventas, reseñas)

Se corre **en `cloudshop-mv-app-1`** (ya tiene el repo clonado y red hacia `sg-bd` vía `sg-app`).

```bash
cd /home/ubuntu/cloudshop/Data/scripts
sudo apt-get install -y python3-pip pipx
pipx install uv
pipx ensurepath
exit    # cierra y vuelve a conectarte para que el PATH tome el nuevo `uv`
```

```bash
cd /home/ubuntu/cloudshop/Data/scripts
uv sync
cp ../../backend/.env.example .env
nano .env    # mismos valores de MYSQL_HOST/DATABASE_URL/MONGO_URI que usaste en 7.3
```

Los CSVs de usuarios y catálogo (`Data/csv/usuarios.csv`, `Data/csv/direcciones_envio.csv`, `Data/csv/catalogo/*.csv`) ya vienen en el repo. Genera ventas y reseñas, valida y carga:

```bash
uv run python -m scripts.faker_ventas_resenas
uv run python -m scripts.load_csv_bd --dry-run
uv run python -m scripts.load_csv_bd
```

Verifica conteos:

```bash
docker exec cloudshop-mysql mysql -ucloud_user -p"CLAVE" -e "
  USE cloudshop_catalogo;
  SELECT (SELECT COUNT(*) FROM productos) productos, (SELECT COUNT(*) FROM movimientos_stock) movimientos;"
docker exec cloudshop-postgres psql -U cloud_user -d cloudshop_usuarios -c "SELECT COUNT(*) FROM usuarios;"
docker exec cloudshop-mongo mongosh cloudshop_ventas --quiet --eval "db.ventas.countDocuments()"
```

### 7.5 `cloudshop-mv-ingesta`: publicar imágenes y ejecutar ingesta

Las imágenes de ingesta viven en Docker Hub. Primero publícalas desde tu máquina de desarrollo (o desde `cloudshop-mv-app-1` donde ya está el código y Docker):

```bash
# En tu máquina de desarrollo (una sola vez):
cd Ingesta
cp .env.example .env
nano .env    # DOCKERHUB_USER=tu_usuario_dockerhub

docker compose build
docker login
docker compose push
```

Luego configura y dispara la ingesta en `cloudshop-mv-ingesta`:

```bash
cd /home/ubuntu/cloudshop/Ingesta

cp .env.example .env
nano .env
#   DOCKERHUB_USER=tu_usuario_dockerhub

cp ingesta-usuarios/.env.example ingesta-usuarios/.env
cp ingesta-catalogo/.env.example ingesta-catalogo/.env
cp ingesta-ventas/.env.example  ingesta-ventas/.env

nano ingesta-usuarios/.env
#   POSTGRES_HOST=10.0.1.10
#   POSTGRES_PASSWORD=ingesta_pg_readonly     (usuario ya creado por postgres-init/01_esquema.sql)
#   S3_BUCKET=<el bucket del paso 8>

nano ingesta-catalogo/.env
#   MYSQL_HOST=10.0.1.10
#   MYSQL_PASSWORD=ingesta_my_readonly
#   S3_BUCKET=<el mismo bucket>

nano ingesta-ventas/.env
#   MONGO_URI=mongodb://10.0.1.10:27017/cloudshop_ventas
#   S3_BUCKET=<el mismo bucket>

docker compose pull           # descarga las 3 imágenes desde Docker Hub
docker compose up             # ejecuta los 3 contenedores; terminan solos al acabar
docker compose logs           # debe mostrar "OK | tabla/coleccion=... | filas/docs=..." por cada uno
```

> Para **re-ejecutar la ingesta** en cualquier momento (ej. después de crear un producto nuevo via Postman): `docker compose up` — no hace falta `pull` salvo que hayas publicado una nueva imagen.

### 7.6 `cloudshop-mv-app-2`: solo pull

```bash
cd /home/ubuntu/cloudshop/backend
cp .env.example .env
nano .env    # EXACTAMENTE los mismos valores que en mv-app-1 (mismo JWT_SECRET, mismo DOCKERHUB_USER, etc.)

docker login
docker compose pull
docker compose up -d
docker compose ps
```

---

## 8. S3 + Glue (catálogo de datos)

### 8.1 Crear el bucket

**Sección:** barra de búsqueda → `S3` → **Buckets** → **Create bucket**.

1. **Bucket name**: un nombre único global, ej. `cloudshop-data-lake-TU-USUARIO-2026` (los nombres de S3 son únicos en todo AWS, así que el del blueprint probablemente ya esté tomado — usa el tuyo y actualiza `ATHENA_OUTPUT_S3` y los `.env` de ingesta con el nombre real).
2. **AWS Region**: `us-east-1`
3. **Object Ownership**: `ACLs disabled` (por defecto).
4. **Block Public Access**: deja las 4 casillas marcadas (bucket privado — el acceso es solo vía `LabInstanceProfile`).
5. **Create bucket**.
6. Dentro del bucket → **Create folder** → nombre `athena-results` → **Create folder** (aquí escribirá Athena los resultados de cada consulta).

### 8.2 Verificar contenido del bucket

Una vez ejecutada la ingesta completa (§7.5), el bucket debe tener este layout:

```text
usuarios/usuarios.csv
direcciones_envio/direcciones_envio.csv
categorias/categorias.csv
productos/productos.csv
inventario/inventario.csv
movimientos_stock/movimientos_stock.csv
ordenes/ordenes.json
detalle_ordenes/detalle_ordenes.csv
resenas/resenas.json
athena-results/   (vacía, la usa Athena)
```

> ⚠️ **Un prefijo = una tabla.** Nunca pongas dos archivos con columnas distintas en la misma carpeta (ver la nota en `BLUEPRINT.md` §7) — por eso son 9 carpetas separadas y no 3 agrupadas por origen.

### 8.3 Crear las 9 tablas del catálogo Glue (vía Athena, sin Crawler)

**Sección:** barra de búsqueda → `Athena` → **Query editor**.

**Primera vez que abres Athena:**

1. Banner "Before you run your first query, configure a query result location in Amazon S3" → clic en **Edit settings** (o ve a **Workgroups** en el menú lateral).
2. Crea un workgroup nuevo: **Workgroups** → **Create workgroup** → **Name**: `cloudshop-wg` → **Query result location**: `s3://TU-BUCKET/athena-results/` → **Create workgroup**.
3. En el **Query editor**, arriba a la derecha, cambia el workgroup activo a `cloudshop-wg`.
4. En el panel izquierdo, **Data source**: `AwsDataCatalog`. **Database**: clic en **Create** → escribe `cloudshop_analytics` → esto crea la base de datos en el catálogo de Glue (aunque estés parado en Athena).
5. Selecciona `cloudshop_analytics` como base de datos activa (desplegable **Database** en el panel izquierdo).

**Ahora pega y ejecuta (botón "Run") cada uno de estos 9 `CREATE EXTERNAL TABLE`, uno por uno, reemplazando `TU-BUCKET`:**

Las tablas CSV usan `OpenCSVSerde` (respeta comillas/comas dentro de texto, como las descripciones de productos) — por eso **todas sus columnas quedan como `string`**; las consultas del paso 9 hacen `CAST` donde hace falta un número.

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.usuarios (
  id string, nombre string, email string, password_hash string,
  estado string, rol string, creado_en string, actualizado_en string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES ('separatorChar'=',','quoteChar'='"','escapeChar'='\\')
STORED AS TEXTFILE
LOCATION 's3://TU-BUCKET/usuarios/'
TBLPROPERTIES ('skip.header.line.count'='1');
```

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.direcciones_envio (
  id string, usuario_id string, direccion string, distrito string,
  ciudad string, pais string, es_principal string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES ('separatorChar'=',','quoteChar'='"','escapeChar'='\\')
STORED AS TEXTFILE
LOCATION 's3://TU-BUCKET/direcciones_envio/'
TBLPROPERTIES ('skip.header.line.count'='1');
```

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.categorias (
  id string, nombre string, descripcion string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES ('separatorChar'=',','quoteChar'='"','escapeChar'='\\')
STORED AS TEXTFILE
LOCATION 's3://TU-BUCKET/categorias/'
TBLPROPERTIES ('skip.header.line.count'='1');
```

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.productos (
  id string, categoria_id string, sku string, nombre string, descripcion string,
  marca string, imagen_url string, origen_url string, precio string,
  precio_oferta string, activo string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES ('separatorChar'=',','quoteChar'='"','escapeChar'='\\')
STORED AS TEXTFILE
LOCATION 's3://TU-BUCKET/productos/'
TBLPROPERTIES ('skip.header.line.count'='1');
```

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.inventario (
  producto_id string, stock_disponible string, stock_reservado string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES ('separatorChar'=',','quoteChar'='"','escapeChar'='\\')
STORED AS TEXTFILE
LOCATION 's3://TU-BUCKET/inventario/'
TBLPROPERTIES ('skip.header.line.count'='1');
```

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.movimientos_stock (
  id string, producto_id string, tipo string, cantidad string, fecha string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES ('separatorChar'=',','quoteChar'='"','escapeChar'='\\')
STORED AS TEXTFILE
LOCATION 's3://TU-BUCKET/movimientos_stock/'
TBLPROPERTIES ('skip.header.line.count'='1');
```

Las tablas JSON (NDJSON, una línea = un documento) usan el SerDe de JSON y **sí** tienen tipos nativos:

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.ordenes (
  orden_id string, usuario_id bigint, total double, estado string,
  direccion_envio string, creado_en string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://TU-BUCKET/ordenes/';
```

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.detalle_ordenes (
  orden_id string, producto_id string, cantidad string, precio_unitario string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'
WITH SERDEPROPERTIES ('separatorChar'=',','quoteChar'='"','escapeChar'='\\')
STORED AS TEXTFILE
LOCATION 's3://TU-BUCKET/detalle_ordenes/'
TBLPROPERTIES ('skip.header.line.count'='1');
```

> ⚠️ `detalle_ordenes` es CSV → OpenCSVSerde, así que **también** va todo como `string`, igual que las demás tablas CSV. Es tentador declarar `producto_id bigint`/`cantidad int` directamente ya que este archivo no tiene comas embebidas, pero OpenCSVSerde **solo soporta columnas `string` de forma confiable** (es una limitación documentada de Athena/Hive, no un detalle de implementación) — declarar otro tipo puede devolver `NULL` en todas las filas en vez de fallar limpiamente. Las 6 consultas del paso 9 y `Backend/analitica/app/routers/analitica.py` ya asumen que esta tabla es 100% string y hacen `CAST` donde hace falta.

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.resenas (
  producto_id bigint, usuario_id bigint, calificacion int,
  comentario string, creado_en string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://TU-BUCKET/resenas/';
```

**Verificación:** menú lateral de Athena → pestaña de la base `cloudshop_analytics` → deben listarse las 9 tablas. Corre `SELECT COUNT(*) FROM cloudshop_analytics.usuarios;` y debe devolver `20000` (o el número que hayas cargado).

> 📌 Esto **es** el catálogo de Glue: cada `CREATE EXTERNAL TABLE` en Athena registra la tabla en AWS Glue Data Catalog automáticamente (puedes verlo en la consola de **Glue** → **Databases** → `cloudshop_analytics` → **Tables**, ahí aparecen las 9). No hace falta correr un Crawler aparte.

---

## 9. Athena: 6 consultas + 2 vistas

Mismo **Query editor** de Athena, base `cloudshop_analytics`, workgroup `cloudshop-wg`. Estas son exactamente las consultas que ejecuta MS5 (`Backend/analitica/app/routers/analitica.py`) — cópialas tal cual para verificar que Athena las acepta antes de probar el endpoint.

```sql
-- 1) Ticket promedio por ciudad
SELECT d.ciudad, ROUND(AVG(o.total), 2) AS ticket_promedio, COUNT(*) AS total_ordenes
FROM ordenes o
JOIN usuarios u ON CAST(u.id AS bigint) = o.usuario_id
JOIN direcciones_envio d ON CAST(d.usuario_id AS bigint) = CAST(u.id AS bigint)
WHERE o.estado = 'confirmada'
GROUP BY d.ciudad
ORDER BY ticket_promedio DESC;
```

```sql
-- 2) Productos más vendidos
SELECT p.id AS producto_id, p.nombre,
       SUM(CAST(det.cantidad AS bigint)) AS unidades_vendidas,
       SUM(CAST(det.cantidad AS double) * CAST(det.precio_unitario AS double)) AS ingresos
FROM detalle_ordenes det
JOIN productos p ON CAST(p.id AS bigint) = CAST(det.producto_id AS bigint)
JOIN ordenes o ON o.orden_id = det.orden_id
WHERE o.estado = 'confirmada'
GROUP BY p.id, p.nombre
ORDER BY unidades_vendidas DESC
LIMIT 20;
```

```sql
-- 3) Ventas por categoría y mes
SELECT c.nombre AS categoria, date_format(from_iso8601_timestamp(o.creado_en), '%Y-%m') AS mes,
       SUM(CAST(det.cantidad AS double) * CAST(det.precio_unitario AS double)) AS ingresos
FROM detalle_ordenes det
JOIN productos p ON CAST(p.id AS bigint) = CAST(det.producto_id AS bigint)
JOIN categorias c ON CAST(c.id AS bigint) = CAST(p.categoria_id AS bigint)
JOIN ordenes o ON o.orden_id = det.orden_id
WHERE o.estado = 'confirmada'
GROUP BY c.nombre, date_format(from_iso8601_timestamp(o.creado_en), '%Y-%m')
ORDER BY mes, ingresos DESC;
```

```sql
-- 4) Órdenes e ingresos por ciudad
SELECT d.ciudad, COUNT(*) AS total_ordenes, SUM(o.total) AS ingresos
FROM ordenes o
JOIN usuarios u ON CAST(u.id AS bigint) = o.usuario_id
JOIN direcciones_envio d ON CAST(d.usuario_id AS bigint) = CAST(u.id AS bigint)
WHERE o.estado = 'confirmada'
GROUP BY d.ciudad
ORDER BY ingresos DESC;
```

```sql
-- 5) Calificación vs. unidades vendidas
SELECT p.id AS producto_id, p.nombre,
       ROUND(AVG(r.calificacion), 2) AS calificacion_promedio,
       COALESCE(SUM(CAST(det.cantidad AS bigint)), 0) AS unidades_vendidas
FROM productos p
LEFT JOIN resenas r ON r.producto_id = CAST(p.id AS bigint)
LEFT JOIN detalle_ordenes det ON CAST(det.producto_id AS bigint) = CAST(p.id AS bigint)
GROUP BY p.id, p.nombre
ORDER BY unidades_vendidas DESC;
```

```sql
-- 6) Clientes más frecuentes
SELECT u.id AS usuario_id, u.nombre, u.email, COUNT(*) AS total_ordenes, SUM(o.total) AS gasto_total
FROM ordenes o
JOIN usuarios u ON CAST(u.id AS bigint) = o.usuario_id
WHERE o.estado = 'confirmada'
GROUP BY u.id, u.nombre, u.email
ORDER BY total_ordenes DESC, gasto_total DESC
LIMIT 20;
```

> Estas 6 consultas son copia exacta del SQL en `Backend/analitica/app/routers/analitica.py` (una sola fuente de verdad) — pégalas aquí para verificar en Athena antes de probar los endpoints de MS5.

**2 vistas** (consolidan las consultas anteriores para que el equipo/profesor las revise directamente):

```sql
CREATE OR REPLACE VIEW cloudshop_analytics.vw_detalle_ventas AS
SELECT o.orden_id, o.usuario_id, o.creado_en, o.estado,
       CAST(det.producto_id AS bigint) AS producto_id, p.nombre AS producto, c.nombre AS categoria,
       CAST(det.cantidad AS bigint) AS cantidad,
       CAST(det.precio_unitario AS double) AS precio_unitario,
       CAST(det.cantidad AS double) * CAST(det.precio_unitario AS double) AS subtotal
FROM ordenes o
JOIN detalle_ordenes det ON o.orden_id = det.orden_id
JOIN productos p ON CAST(p.id AS bigint) = CAST(det.producto_id AS bigint)
JOIN categorias c ON CAST(c.id AS bigint) = CAST(p.categoria_id AS bigint);
```

```sql
CREATE OR REPLACE VIEW cloudshop_analytics.vw_valor_cliente AS
SELECT u.id AS usuario_id, u.nombre,
       COUNT(DISTINCT o.orden_id) AS cantidad_ordenes,
       ROUND(SUM(o.total), 2) AS gasto_total,
       ROUND(AVG(o.total), 2) AS ticket_promedio,
       MAX(o.creado_en) AS ultima_compra
FROM usuarios u
JOIN ordenes o ON CAST(u.id AS bigint) = o.usuario_id
GROUP BY u.id, u.nombre;
```

> 📌 Estas 2 vistas y las 6 consultas están adaptadas al esquema **realmente implementado** (`direccion_envio` como texto plano en `ordenes`, no una tabla de direcciones normalizada por pedido; `orden_id` como string; `creado_en` en ISO 8601). El documento de sustentación original (`Proposal/02_Sustentacion_Data_Science_CloudShop.md`, ya no está en el repo) asumía un esquema ligeramente distinto — esta es la versión que realmente corre contra los datos que genera `faker_ventas_resenas.py`.

**Configura `ATHENA_OUTPUT_S3` en los `.env` de `mv-app-1` y `mv-app-2`** con el bucket real (`s3://TU-BUCKET/athena-results/`) y reinicia el contenedor `analitica`:

```bash
docker compose up -d analitica
curl -H "Authorization: Bearer TU_TOKEN_DE_ADMIN" http://localhost:8001/analitica/ticket-promedio
```

---

## 10. Application Load Balancer

**Sección:** consola **EC2** → menú lateral → **Target Groups** (bajo "Load Balancing").

### 10.1 Crear los 5 Target Groups

Repite 5 veces con **Create target group**:

| Target group | Protocol : Port | Health check path |
|---|---|---|
| `cloudshop-tg-usuarios` | HTTP : 8000 | `/health` |
| `cloudshop-tg-catalogo` | HTTP : 8080 | `/health` |
| `cloudshop-tg-analitica` | HTTP : 8001 | `/health` |
| `cloudshop-tg-ventas` | HTTP : 8002 | `/health` |
| `cloudshop-tg-ordenes` | HTTP : 8003 | `/health` |

Para cada uno:
1. **Choose a target type**: **Instances**.
2. **Target group name**: (de la tabla).
3. **Protocol : Port**: (de la tabla).
4. **VPC**: `cloudshop-vpc`.
5. **Health checks** → **Health check path**: `/health`.
6. **Next** → en **Register targets**, marca **`cloudshop-mv-app-1`** y **`cloudshop-mv-app-2`** → especifica el mismo puerto de la tabla en **Ports for the selected instances** → **Include as pending below** → **Create target group**.

### 10.2 Crear el ALB

**Sección:** menú lateral → **Load Balancers** → **Create load balancer** → **Application Load Balancer** → **Create**.

1. **Name**: `cloudshop-alb`
2. **Scheme**: **Internet-facing**
3. **VPC**: `cloudshop-vpc` — **Mappings**: marca `us-east-1a` → subred `cloudshop-subnet-publica`.
4. **Security groups**: quita el default, selecciona `cloudshop-sg-alb`.
5. **Listeners and routing**: Listener HTTP : 80 → **Default action** → **Forward to** → `cloudshop-tg-usuarios` (cualquiera sirve como default; las reglas de abajo lo sobreescriben para todo lo demás).
6. **Create load balancer**.

### 10.3 Reglas de enrutamiento por path

Selecciona `cloudshop-alb` → pestaña **Listeners** → el listener `HTTP:80` → **Manage rules** (o **View/edit rules**) → ícono `+` para agregar reglas, **en este orden de prioridad** (de arriba hacia abajo, la 1 se evalúa primero):

| Prioridad | Path pattern | Forward to |
|---|---|---|
| 1 | `/usuarios/*/ventas` | `cloudshop-tg-ventas` |
| 2 | `/productos/*/resenas` | `cloudshop-tg-ventas` |
| 3 | `/usuarios/*` | `cloudshop-tg-usuarios` |
| 4 | `/api/catalogo/*` | `cloudshop-tg-catalogo` |
| 5 | `/ventas/*` | `cloudshop-tg-ventas` |
| 6 | `/ordenes/*` | `cloudshop-tg-ordenes` |
| 7 | `/analitica/*` | `cloudshop-tg-analitica` |

> ⚠️ El orden importa: `/usuarios/*/ventas` y `/productos/*/resenas` deben ir **antes** que `/usuarios/*`, si no la regla genérica las captura primero y nunca llegan a MS3.

**Verificación:**

1. Copia el **DNS name** del ALB (pestaña **Description**, algo como `cloudshop-alb-123456.us-east-1.elb.amazonaws.com`).
2. **Target Groups** → cada uno de los 5 → pestaña **Targets** → ambas instancias en `healthy`.
3. `curl http://<DNS-DEL-ALB>/api/catalogo/categorias` desde tu máquina debe responder JSON.

---

## 11. Frontend en AWS Amplify

**Sección:** barra de búsqueda → `Amplify` → **Deploy an app** (o **New app** → **Host web app**).

1. **Git provider**: GitHub (autoriza el acceso si es la primera vez).
2. Selecciona tu repositorio y la rama (`main`).
3. **App settings**: **App name**: `cloudshop-frontend`.
4. **Monorepo**: si te lo pregunta, marca que la app está en una subcarpeta → **App root**: `Frontend/frontend`.
5. Verifica que el **Build settings (amplify.yml)** detectado coincide con `Frontend/amplify.yml` del repo (build command `npm run build`, artefactos en `frontend/dist` con el `appRoot` ya indicado). Si no lo detecta, pégalo manualmente en el editor que te muestra.
6. **Environment variables** → **Add variable** (dos):
   - `VITE_USE_MOCKS` = `false`
   - `VITE_API_BASE_URL` = `http://<DNS-DEL-ALB>` (el del paso 10.3, **sin** slash final)
7. **Save and deploy**.

Cuando termine el primer deploy, copia el dominio que te asigna Amplify (algo como `https://main.dXXXXXXXXXX.amplifyapp.com`).

**Vuelve a las 2 VMs de aplicación** y actualiza `CORS_ORIGINS` en su `.env` para incluir ese dominio:

```bash
# en mv-app-1 Y mv-app-2
cd /home/ubuntu/cloudshop/backend
nano .env
# CORS_ORIGINS=https://main.dXXXXXXXXXX.amplifyapp.com,http://localhost:5173
docker compose up -d      # recrea los contenedores con el nuevo CORS_ORIGINS
```

### Reescritura SPA (rutas de React Router)

Amplify → tu app → **Rewrites and redirects** → **Manage redirects** → **Add rule**:
- **Source address**: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>`
- **Target address**: `/index.html`
- **Type**: `200 (Rewrite)`

(Esto es lo que ya trae `Frontend/frontend/amplify-rewrites.json` — si Amplify te dejó importarlo directamente, mejor.)

---

## 12. Verificación final

Recorre este checklist (coincide con `BLUEPRINT.md` §14):

1. **5 microservicios sanos en ambas VMs de app:**
   ```bash
   for p in 8000 8080 8001 8002 8003; do curl -s http://localhost:$p/health; echo; done
   ```
2. **ALB responde por path** (desde tu máquina, usando el DNS del ALB): `/api/catalogo/categorias`, `/usuarios/auth/login` (POST), `/ventas` (POST, con token), `/ordenes/previsualizar` (POST, con token), `/analitica/ticket-promedio` (GET, con token de admin).
3. **Roles**: registra un usuario con un email que esté en `ADMIN_EMAILS` → su token trae `rol=admin`. Con un usuario normal, `POST /api/catalogo/productos` debe dar `403`.
4. **Flujo de compra completo** en el frontend de Amplify: login → catálogo → detalle de producto → "Comprar" → aparece en "Mis compras" → dejar una reseña.
5. **Panel `/admin`** (con el usuario admin): crear un producto, editarlo, desactivarlo; ver la lista de usuarios y promover a uno; ver la tabla de órdenes.
6. **S3**: 9 carpetas con datos (ver §8.2).
7. **Athena**: las 9 tablas devuelven filas; las 6 consultas y 2 vistas corren sin error (§9).
8. **Security Groups**: intenta `mysql -h <IP-pública-de-mv-datos> -P 3306` desde tu máquina — debe **fallar/quedarse colgado** (el puerto no está abierto a tu IP, solo a `sg-app`/`sg-ingesta`).

### Pendientes conocidos (no bloquean la entrega, pero quedan documentados)

- **Swagger UI centralizado** (`docs/openapi/*.yaml`) no existe todavía — cada microservicio FastAPI sigue teniendo su Swagger nativo en `/docs` (MS1, MS4, MS5); MS2 (Go) y MS3 (Node) no tienen Swagger nativo.
