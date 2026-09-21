# CloudShop — Despliegue 100 % desde el navegador (AWS Academy)

> Variante del despliegue manual en la que **ningún paso requiere abrir una terminal en tu laptop** — ni siquiera para conectarte a las VMs. Todo se hace desde pestañas del navegador en la consola de AWS:
>
> * La infraestructura (VPC, SGs, EC2, S3, Glue/Athena, ALB, Amplify) se crea con la consola web, igual que en `DESPLIEGUE_AWS_MANUAL.md`.
> * Las conexiones SSH a las VMs se sustituyen por **EC2 Instance Connect** — el botón **Connect** de la consola abre un terminal en el navegador sin necesidad de descargar `vockey.pem` ni de tener un cliente SSH local.
> * La copia de archivos hacia S3 (`scp` + upload manual) se reemplaza por `aws s3 cp` ejecutado directamente en el terminal del navegador, dentro de la VM de ingesta (que ya tiene `LabInstanceProfile`).
>
> Cualquier paso que en `DESPLIEGUE_AWS_MANUAL.md` dice "pega esto en tu terminal local" aquí lo haces en la pestaña del navegador que abre EC2 Instance Connect.

---

## Antes de empezar

1. Inicia sesión en **AWS Academy Learner Lab** → botón **AWS** (consola con credenciales temporales).
2. Arriba a la derecha, verifica la región **us-east-1 (N. Virginia)**.
3. Ten a mano:
   - URL del repo de GitHub de CloudShop (pública, o con token si es privado).
   - Un usuario de **Docker Hub** (gratis) para alojar las 5 imágenes.
   - Las contraseñas que usarás para MySQL / PostgreSQL / JWT (invéntalas ahora).

> ⚠️ **Particularidad de AWS Academy:** el laboratorio trae un rol llamado `LabInstanceProfile` con permisos de S3 — lo usamos tal cual. Sin él no se puede continuar §8.

---

## 1. Crear la VPC

**Sección:** barra de búsqueda superior → `VPC` → **VPC**.

1. Menú lateral → **Your VPCs** → **Create VPC**.
2. **Resources to create**: **VPC only** (⚠️ no "VPC and more").
3. **Name tag**: `cloudshop-vpc`
4. **IPv4 CIDR block**: `10.0.0.0/16`
5. **IPv6 CIDR block**: **No IPv6 CIDR block** — **Tenancy**: **Default**.
6. **Create VPC**.

---

## 2. Crear la subred pública

**Sección:** menú lateral → **Subnets** → **Create subnet**.

1. **VPC ID**: `cloudshop-vpc`
2. **Subnet name**: `cloudshop-subnet-publica`
3. **Availability Zone**: `us-east-1a`
4. **IPv4 CIDR block**: `10.0.1.0/24` → **Create subnet**.

**Activar IP pública automática:**

5. Selecciona `cloudshop-subnet-publica` → **Actions** → **Edit subnet settings** → marca **Enable auto-assign public IPv4 address** → **Save**.

---

## 3. Crear el Internet Gateway

**Sección:** menú lateral → **Internet gateways** → **Create internet gateway**.

1. **Name tag**: `cloudshop-igw` → **Create internet gateway**.
2. Selecciona `cloudshop-igw` → **Actions** → **Attach to VPC** → `cloudshop-vpc` → **Attach**.

---

## 4. Crear la Route Table pública

**Sección:** menú lateral → **Route tables** → **Create route table**.

1. **Name**: `cloudshop-rt-publica` — **VPC**: `cloudshop-vpc` → **Create route table**.
2. Pestaña **Routes** → **Edit routes** → **Add route**: Destination `0.0.0.0/0`, Target → **Internet Gateway** → `cloudshop-igw` → **Save changes**.
3. Pestaña **Subnet associations** → **Edit subnet associations** → marca `cloudshop-subnet-publica` → **Save associations**.

---

## 5. Crear los 4 Security Groups

**Sección:** menú lateral → **Security groups**.

### 5.1 — `cloudshop-sg-alb`

1. **Create security group** — **Name**: `cloudshop-sg-alb` — **VPC**: `cloudshop-vpc`.
2. **Inbound rules** → **Add rule**: Type `HTTP`, Port `80`, Source `0.0.0.0/0`.
3. **Create security group**.

### 5.2 — `cloudshop-sg-app`

1. **Create security group** — **Name**: `cloudshop-sg-app` — **VPC**: `cloudshop-vpc`.
2. **Inbound rules** — agrega **estas 5 reglas**:

   | # | Type | Port range | Source | Propósito |
   |---|---|---|---|---|
   | 1 | SSH | 22 | `18.206.107.24/29` | EC2 Instance Connect (us-east-1) — permite el terminal del navegador |
   | 2 | Custom TCP | 8000 | `cloudshop-sg-alb` | MS usuarios |
   | 3 | Custom TCP | 8080 | `cloudshop-sg-alb` | MS catálogo |
   | 4 | Custom TCP | 8001, 8002, 8003 | `cloudshop-sg-alb` | MS analítica, ventas, órdenes |
   | 5 | Custom TCP | 8081 | `18.206.107.24/29` | Swagger UI (reservado, desde el navegador) |

   > 📌 El rango `18.206.107.24/29` es el bloque de IPs del servicio **EC2 Instance Connect** para us-east-1. Permite que el terminal del navegador llegue por SSH a tus VMs sin abrir el puerto 22 a todo Internet.

3. **Create security group**.

### 5.3 — `cloudshop-sg-ingesta`

1. **Create security group** — **Name**: `cloudshop-sg-ingesta` — **VPC**: `cloudshop-vpc`.
2. **Inbound rules** → SSH `22` → Source `18.206.107.24/29` (EC2 Instance Connect, igual que arriba).
3. **Create security group**.

### 5.4 — `cloudshop-sg-bd`

1. **Create security group** — **Name**: `cloudshop-sg-bd` — **VPC**: `cloudshop-vpc`.
2. **Inbound rules** — agrega **7 reglas**:

   | # | Type | Port | Source |
   |---|---|---|---|
   | 1 | SSH | 22 | `cloudshop-sg-app` |
   | 2 | MySQL/Aurora | 3306 | `cloudshop-sg-app` |
   | 3 | MySQL/Aurora | 3306 | `cloudshop-sg-ingesta` |
   | 4 | PostgreSQL | 5432 | `cloudshop-sg-app` |
   | 5 | PostgreSQL | 5432 | `cloudshop-sg-ingesta` |
   | 6 | Custom TCP | 27017 | `cloudshop-sg-app` |
   | 7 | Custom TCP | 27017 | `cloudshop-sg-ingesta` |

3. **Create security group**.

> ⚠️ **Regla de oro:** 3306 / 5432 / 27017 **nunca** a `0.0.0.0/0`. Solo `sg-app` y `sg-ingesta`.

---

## 6. Lanzar las 4 EC2

**Sección:** barra de búsqueda → `EC2` → **Instances** → **Launch instances**.

Configuración común:

- **AMI**: Ubuntu Server 22.04 LTS (HVM), 64-bit (x86).
- **Instance type**: `t3.micro`
- **Key pair**: `vockey` *(selecciónalo en el asistente aunque no lo vayas a usar localmente — EC2 Instance Connect necesita que la instancia tenga un key pair asignado para funcionar).*
- **Network settings** → **Edit**: VPC `cloudshop-vpc`, Subnet `cloudshop-subnet-publica`, Auto-assign public IP `Enable`, Firewall → *existing security group* (ver tabla).
- **Configure storage**: `20 GiB`, `gp3`.

| Campo | `cloudshop-mv-datos` | `cloudshop-mv-ingesta` | `cloudshop-mv-app-1` | `cloudshop-mv-app-2` |
|---|---|---|---|---|
| **Name** | `cloudshop-mv-datos` | `cloudshop-mv-ingesta` | `cloudshop-mv-app-1` | `cloudshop-mv-app-2` |
| **Security group** | `cloudshop-sg-bd` | `cloudshop-sg-ingesta` | `cloudshop-sg-app` | `cloudshop-sg-app` |
| **Advanced → IAM instance profile** | *(ninguno)* | `LabInstanceProfile` | *(ninguno)* | *(ninguno)* |
| **IP privada fija** | `10.0.1.10` | `10.0.1.20` | `10.0.1.11` | `10.0.1.12` |

Lanza las 4, una por una.

### 6.1 Fijar la IP privada de cada instancia

Para **cada** VM, después de que arranque:

1. **Instances** → selecciónala → **Instance state** → **Stop instance**. Espera `Stopped`.
2. Menú lateral → **Network Interfaces** → busca la ENI de esa VM.
3. **Actions** → **Manage IP addresses** → cambia la IPv4 a la de la tabla → **Save**.
4. **Instances** → selecciona la VM → **Instance state** → **Start instance**.

### 6.2 Conectarte a una VM (terminal en el navegador)

> Esta sección reemplaza el `ssh -i "vockey.pem" ubuntu@<IP>` de la guía original. **No necesitas descargar ni usar el archivo `.pem`.**

Para cada VM:

1. **EC2** → **Instances** → selecciona la VM → botón **Connect** (arriba a la derecha).
2. Selecciona la pestaña **EC2 Instance Connect**.
3. El campo **User name** debe decir `ubuntu`. Deja todo como está.
4. Clic en **Connect**.

Se abrirá una nueva pestaña del navegador con un terminal SSH directo a la VM. Pega ahí los comandos de las secciones siguientes igual que si fuera un terminal local.

> 📌 Cada vez que necesites acceder a una VM en los pasos siguientes, repite estos 4 clics: **Instances → VM → Connect → EC2 Instance Connect → Connect**.

---

## 7. Configurar cada VM (en el terminal del navegador)

### 7.1 Bootstrap común (las 4 VMs)

Abre EC2 Instance Connect para **cada** VM y pega:

```bash
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sudo sh /tmp/get-docker.sh
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
exit
```

Cierra la pestaña del terminal (el `exit` lo hace automáticamente) y **vuelve a abrirla con EC2 Instance Connect** (mismos 4 clics) para que el grupo `docker` tome efecto. Luego clona el repo:

```bash
git clone --depth 1 https://github.com/TU-USUARIO/CloudComputing-Project.git /home/ubuntu/cloudshop
sudo chown -R ubuntu:ubuntu /home/ubuntu/cloudshop
cd /home/ubuntu/cloudshop
```

> Reemplaza la URL por la de tu fork. Si el repo es privado, usa un token de acceso personal en la URL.

### 7.2 `cloudshop-mv-datos`: MySQL + PostgreSQL + MongoDB

Abre EC2 Instance Connect en `cloudshop-mv-datos`:

```bash
cd /home/ubuntu/cloudshop/backend
cp .env.example .env
nano .env
```

Define como mínimo:

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

Verifica esquemas:

```bash
docker exec cloudshop-mysql mysql -ucloud_user -p"$(grep MYSQL_PASSWORD .env | cut -d= -f2)" -e "USE cloudshop_catalogo; SHOW TABLES;"
docker exec cloudshop-postgres psql -U cloud_user -d cloudshop_usuarios -c "\dt"
docker exec cloudshop-mongo mongosh --quiet --eval "db.getMongo()"
```

> 📌 Esta VM no necesita `docker login` — solo corre imágenes oficiales.

### 7.3 `cloudshop-mv-app-1`: build + push de las 5 imágenes

Abre EC2 Instance Connect en `cloudshop-mv-app-1`:

```bash
cd /home/ubuntu/cloudshop/backend
cp .env.example .env
nano .env
```

Completa **todas** las variables (mismas claves de MySQL/PostgreSQL que en `mv-datos`):

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

# Bucket de imágenes — completa con el nombre real tras crear el bucket en §8.0
IMAGES_S3_BASE_URL=https://cloudshop-imagenes-TU-USUARIO-2026.s3.amazonaws.com
```

Build, login y push:

```bash
docker compose build
docker login                       # pide usuario y contraseña/token de Docker Hub
docker compose push
```

> 📌 **Nota de memoria (t3.micro = 1 GiB RAM):** si `docker compose build` se cae, agrega swap primero:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> ```

Levanta los 5 microservicios:

```bash
docker compose up -d
docker compose ps        # los 5 en "healthy"
```

### 7.4 Cargar los datos (usuarios, catálogo, ventas, reseñas)

> ⚠️ **Imágenes del catálogo:** antes de cargar los datos, completa el **§8.0** (crear el bucket de imágenes y subir los JPGs). Una vez hecho, regresa aquí con `IMAGES_S3_BASE_URL` definido para que `productos.csv` se genere con URLs absolutas de S3. Si omites este paso, las imágenes quedarán en blanco en el frontend.

En el mismo terminal de `cloudshop-mv-app-1`:

```bash
cd /home/ubuntu/cloudshop/Data/scripts
sudo apt-get install -y python3-pip pipx
pipx install uv
pipx ensurepath
exit
```

Vuelve a abrir EC2 Instance Connect en `cloudshop-mv-app-1` (para que el PATH de `uv` tome efecto):

```bash
cd /home/ubuntu/cloudshop/Data/scripts
uv sync
cp ../../backend/.env.example .env
nano .env    # mismos valores de MYSQL_HOST / DATABASE_URL / MONGO_URI del paso 7.3
             # y IMAGES_S3_BASE_URL=https://cloudshop-imagenes-TU-USUARIO-2026.s3.amazonaws.com
```

Regenera el catálogo con URLs de S3 y luego genera ventas/reseñas, valida y carga:

```bash
# Regenera productos.csv con imagen_url apuntando al bucket de imágenes
uv run python -m scripts.build_catalogo
```

```bash
uv run python -m scripts.faker_ventas_resenas
uv run python -m scripts.load_csv_bd --dry-run
uv run python -m scripts.load_csv_bd
```

> 📌 Si definiste `IMAGES_S3_BASE_URL` **después** de ya haber cargado los datos, vuelve a correr `build_catalogo.py` y `load_csv_bd.py --solo-mysql` para recargar solo MySQL con los URLs correctos.

Verifica conteos:

```bash
docker exec cloudshop-mysql mysql -ucloud_user -p"CLAVE" -e "
  USE cloudshop_catalogo;
  SELECT (SELECT COUNT(*) FROM productos) productos, (SELECT COUNT(*) FROM movimientos_stock) movimientos;"
docker exec cloudshop-postgres psql -U cloud_user -d cloudshop_usuarios -c "SELECT COUNT(*) FROM usuarios;"
docker exec cloudshop-mongo mongosh cloudshop_ventas --quiet --eval "db.ventas.countDocuments()"
```

### 7.5 `cloudshop-mv-ingesta`: ingesta-usuarios + ingesta-catalogo

Abre EC2 Instance Connect en `cloudshop-mv-ingesta`:

```bash
cd /home/ubuntu/cloudshop/Ingesta
cp ingesta-usuarios/.env.example ingesta-usuarios/.env
cp ingesta-catalogo/.env.example ingesta-catalogo/.env
nano ingesta-usuarios/.env
#   POSTGRES_HOST=10.0.1.10
#   POSTGRES_PASSWORD=ingesta_pg_readonly
#   S3_BUCKET=<el bucket del paso 8>
nano ingesta-catalogo/.env
#   MYSQL_HOST=10.0.1.10
#   MYSQL_PASSWORD=ingesta_my_readonly
#   S3_BUCKET=<el mismo bucket>

docker compose up --build
docker compose logs        # "OK | tabla=... | filas=..." por cada tabla
```

### 7.6 `cloudshop-mv-app-2`: solo pull

Abre EC2 Instance Connect en `cloudshop-mv-app-2`:

```bash
cd /home/ubuntu/cloudshop/backend
cp .env.example .env
nano .env    # EXACTAMENTE los mismos valores que en mv-app-1

docker login
docker compose pull
docker compose up -d
docker compose ps
```

---

## 8. S3

### 8.0 Bucket de imágenes del catálogo (público)

> ⚠️ **Hazlo antes de §7.4 (carga de datos).** Las URLs de imágenes se graban en MySQL durante la carga; si creas el bucket después, tendrás que recargar MySQL.

**Sección:** barra de búsqueda → `S3` → **Buckets** → **Create bucket**.

1. **Bucket name**: `cloudshop-imagenes-TU-USUARIO-2026` (único globalmente — usa tu usuario real).
2. **AWS Region**: `us-east-1`.
3. **Object Ownership**: `ACLs disabled`.
4. **Block Public Access**: **desmarca las 4 casillas** (este bucket debe ser público para que el frontend pueda cargar las imágenes directamente).
5. Marca la casilla de confirmación "I acknowledge that the current settings...".
6. **Create bucket**.

**Añadir la bucket policy** (lectura pública de objetos, sin listar el bucket):

7. Dentro del bucket → pestaña **Permissions** → sección **Bucket policy** → **Edit**.
8. Pega esto (reemplaza `cloudshop-imagenes-TU-USUARIO-2026` con tu nombre real):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::cloudshop-imagenes-TU-USUARIO-2026/*"
    }
  ]
}
```

9. **Save changes**.

**Subir las imágenes desde `cloudshop-mv-ingesta`** (ya tiene `LabInstanceProfile`):

Abre EC2 Instance Connect en `cloudshop-mv-ingesta` y ejecuta:

```bash
# Las 5.134 imágenes JPG ya están en el repo clonado durante el bootstrap (§7.1)
aws s3 sync /home/ubuntu/cloudshop/Data/csv/imagenes/ \
    s3://cloudshop-imagenes-TU-USUARIO-2026/imagenes/ \
    --only-show-errors
# Tarda ~3-5 minutos. Al terminar muestra un resumen de archivos subidos.
```

**Verificación rápida:**

```bash
aws s3 ls s3://cloudshop-imagenes-TU-USUARIO-2026/imagenes/ | wc -l
# Debe mostrar ~5134
```

**Actualiza el `.env` de `mv-app-1` y `mv-app-2`** con el nombre real del bucket:

```bash
# En mv-app-1 (y luego mv-app-2):
cd /home/ubuntu/cloudshop/backend
nano .env
# IMAGES_S3_BASE_URL=https://cloudshop-imagenes-TU-USUARIO-2026.s3.amazonaws.com
docker compose up -d    # recarga el entorno (el backend no usa esta variable, pero queda registrada)
```

> 📌 El backend Go no sirve imágenes — simplemente guarda y devuelve el string `imagen_url` de MySQL. Lo que importa es que MySQL tenga las URLs absolutas de S3, lo cual se logra regenerando `productos.csv` con `build_catalogo.py` antes de correr `load_csv_bd.py` (§7.4).

---

### 8.1 Bucket de datos (data lake, privado)

**Sección:** barra de búsqueda → `S3` → **Buckets** → **Create bucket**.

1. **Bucket name**: `cloudshop-data-lake-TU-USUARIO-2026` (único globalmente — usa el tuyo).
2. **AWS Region**: `us-east-1`
3. **Object Ownership**: `ACLs disabled`.
4. **Block Public Access**: las 4 casillas marcadas (acceso solo vía `LabInstanceProfile`).
5. **Create bucket**.
6. Dentro del bucket → **Create folder** → `athena-results` → **Create folder**.

### 8.2 Subir los archivos de ventas/reseñas desde la VM (sin `scp` ni laptop)

> En la guía original este paso requería `scp` a tu laptop y luego subir desde ahí. Aquí se hace directamente desde la VM de ingesta, que ya tiene `LabInstanceProfile` con permisos S3.

Abre EC2 Instance Connect en `cloudshop-mv-ingesta` y copia los archivos desde `mv-app-1` a S3:

```bash
# Los archivos están en cloudshop-mv-app-1, cópialos primero a esta VM con scp interno:
scp -o StrictHostKeyChecking=no ubuntu@10.0.1.11:/home/ubuntu/cloudshop/Data/csv/ventas/ordenes.json /tmp/
scp -o StrictHostKeyChecking=no ubuntu@10.0.1.11:/home/ubuntu/cloudshop/Data/csv/ventas/detalle_ordenes.csv /tmp/
scp -o StrictHostKeyChecking=no ubuntu@10.0.1.11:/home/ubuntu/cloudshop/Data/csv/ventas/resenas.json /tmp/

# Súbelos al bucket (reemplaza TU-BUCKET):
aws s3 cp /tmp/ordenes.json         s3://TU-BUCKET/ordenes/ordenes.json
aws s3 cp /tmp/detalle_ordenes.csv  s3://TU-BUCKET/detalle_ordenes/detalle_ordenes.csv
aws s3 cp /tmp/resenas.json         s3://TU-BUCKET/resenas/resenas.json
```

> 📌 La VM de ingesta puede ejecutar `aws s3 cp` porque tiene `LabInstanceProfile`. Las VMs de app y datos no tienen ese perfil, por eso usamos la de ingesta como puente.

**Resultado esperado en el bucket** (una vez `ingesta-usuarios`/`ingesta-catalogo` también corrieron):

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
athena-results/   (vacía)
```

### 8.3 Crear las 9 tablas del catálogo Glue (vía Athena, sin Crawler)

**Sección:** barra de búsqueda → `Athena` → **Query editor**.

**Primera vez que abres Athena:**

1. Banner de resultado de consulta → **Edit settings** (o **Workgroups**).
2. **Workgroups** → **Create workgroup** → **Name**: `cloudshop-wg` → **Query result location**: `s3://TU-BUCKET/athena-results/` → **Create workgroup**.
3. En el Query editor, cambia el workgroup activo a `cloudshop-wg`.
4. Panel izquierdo → **Database** → **Create** → escribe `cloudshop_analytics` → crea la base de datos en Glue.
5. Selecciona `cloudshop_analytics` como base de datos activa.

Pega y ejecuta (botón **Run**) cada `CREATE EXTERNAL TABLE`, uno por uno, reemplazando `TU-BUCKET`:

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

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS cloudshop_analytics.resenas (
  producto_id bigint, usuario_id bigint, calificacion int,
  comentario string, creado_en string
)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://TU-BUCKET/resenas/';
```

**Verificación:** menú lateral de Athena → `cloudshop_analytics` → deben listarse 9 tablas. Corre `SELECT COUNT(*) FROM cloudshop_analytics.usuarios;` → debe devolver `20000`.

> 📌 Cada `CREATE EXTERNAL TABLE` registra la tabla en **AWS Glue Data Catalog** automáticamente (visible en **Glue** → **Databases** → `cloudshop_analytics` → **Tables**). No hace falta correr un Crawler.

---

## 9. Athena: 6 consultas + 2 vistas

Mismo **Query editor**, base `cloudshop_analytics`, workgroup `cloudshop-wg`.

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

**2 vistas:**

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

Actualiza `ATHENA_OUTPUT_S3` en los `.env` de `mv-app-1` y `mv-app-2` con el bucket real y reinicia `analitica`:

```bash
# en mv-app-1 y mv-app-2 (via EC2 Instance Connect)
docker compose up -d analitica
curl -H "Authorization: Bearer TU_TOKEN_DE_ADMIN" http://localhost:8001/analitica/ticket-promedio
```

---

## 10. Application Load Balancer

**Sección:** consola **EC2** → menú lateral → **Target Groups**.

### 10.1 Crear los 5 Target Groups

Repite con **Create target group**:

| Target group | Protocol : Port | Health check path |
|---|---|---|
| `cloudshop-tg-usuarios` | HTTP : 8000 | `/health` |
| `cloudshop-tg-catalogo` | HTTP : 8080 | `/health` |
| `cloudshop-tg-analitica` | HTTP : 8001 | `/health` |
| `cloudshop-tg-ventas` | HTTP : 8002 | `/health` |
| `cloudshop-tg-ordenes` | HTTP : 8003 | `/health` |

Para cada uno:
1. **Target type**: **Instances**.
2. **VPC**: `cloudshop-vpc`.
3. **Health check path**: `/health`.
4. **Next** → en **Register targets**: marca `cloudshop-mv-app-1` y `cloudshop-mv-app-2` → especifica el puerto correspondiente → **Include as pending below** → **Create target group**.

### 10.2 Crear el ALB

**Sección:** menú lateral → **Load Balancers** → **Create load balancer** → **Application Load Balancer**.

1. **Name**: `cloudshop-alb` — **Scheme**: **Internet-facing**.
2. **VPC**: `cloudshop-vpc` — **Mappings**: `us-east-1a` → `cloudshop-subnet-publica`.
3. **Security groups**: quita el default, selecciona `cloudshop-sg-alb`.
4. **Listener HTTP : 80** → **Default action** → **Forward to** → `cloudshop-tg-usuarios`.
5. **Create load balancer**.

### 10.3 Reglas de enrutamiento por path

Selecciona `cloudshop-alb` → pestaña **Listeners** → `HTTP:80` → **Manage rules** → agrega en este orden:

| Prioridad | Path pattern | Forward to |
|---|---|---|
| 1 | `/usuarios/*/ventas` | `cloudshop-tg-ventas` |
| 2 | `/productos/*/resenas` | `cloudshop-tg-ventas` |
| 3 | `/usuarios/*` | `cloudshop-tg-usuarios` |
| 4 | `/api/catalogo/*` | `cloudshop-tg-catalogo` |
| 5 | `/ventas/*` | `cloudshop-tg-ventas` |
| 6 | `/ordenes/*` | `cloudshop-tg-ordenes` |
| 7 | `/analitica/*` | `cloudshop-tg-analitica` |

> ⚠️ Orden importa: `/usuarios/*/ventas` debe ir **antes** que `/usuarios/*`.

**Verificación:**
1. Copia el **DNS name** del ALB (algo como `cloudshop-alb-123456.us-east-1.elb.amazonaws.com`).
2. **Target Groups** → cada uno → pestaña **Targets** → ambas instancias en `healthy`.
3. Desde el navegador: `http://<DNS-DEL-ALB>/api/catalogo/categorias` debe devolver JSON.

---

## 11. Frontend en AWS Amplify

**Sección:** barra de búsqueda → `Amplify` → **Deploy an app**.

1. **Git provider**: GitHub (autoriza si es la primera vez).
2. Selecciona tu repositorio y la rama (`main`).
3. **App name**: `cloudshop-frontend`.
4. Si te pregunta por monorepo: **App root**: `Frontend/frontend`.
5. Verifica que el build settings coincida con `Frontend/amplify.yml` del repo.
6. **Environment variables** → **Add variable**:
   - `VITE_USE_MOCKS` = `false`
   - `VITE_API_BASE_URL` = `http://<DNS-DEL-ALB>` (sin slash final)
7. **Save and deploy**.

Cuando termine el primer deploy, copia el dominio de Amplify (ej. `https://main.dXXXXX.amplifyapp.com`).

Abre EC2 Instance Connect en **mv-app-1** y **mv-app-2**, y actualiza `CORS_ORIGINS`:

```bash
cd /home/ubuntu/cloudshop/backend
nano .env
# CORS_ORIGINS=https://main.dXXXXX.amplifyapp.com,http://localhost:5173
docker compose up -d      # recrea contenedores con el nuevo CORS_ORIGINS
```

**Reescritura SPA:** Amplify → tu app → **Rewrites and redirects** → **Add rule**:
- **Source**: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>`
- **Target**: `/index.html`
- **Type**: `200 (Rewrite)`

---

## 12. Verificación final

1. **5 microservicios sanos en ambas VMs** (via EC2 Instance Connect):
   ```bash
   for p in 8000 8080 8001 8002 8003; do curl -s http://localhost:$p/health; echo; done
   ```
2. **ALB responde por path** (desde el navegador, usando el DNS del ALB): `/api/catalogo/categorias`, `/usuarios/auth/login` (POST), etc.
3. **Roles**: registra un usuario con email en `ADMIN_EMAILS` → token con `rol=admin`; con usuario normal, `POST /api/catalogo/productos` debe dar `403`.
4. **Flujo de compra completo** en el frontend de Amplify: login → catálogo → detalle → "Comprar" → "Mis compras" → reseña.
5. **Panel `/admin`** (usuario admin): crear/editar/desactivar producto; listar usuarios; ver órdenes.
6. **S3 imágenes**: bucket público con ~5.134 objetos bajo `imagenes/`; una URL de imagen de un producto devuelve el JPG en el navegador (§8.0).
7. **S3 data lake**: 9 carpetas con datos (§8.2).
8. **Athena**: 9 tablas devuelven filas; 6 consultas y 2 vistas corren sin error (§9).
9. **Security Groups**: los puertos 3306/5432/27017 no deben ser accesibles desde Internet.

### Pendientes conocidos

- **`ingesta-ventas`** (MongoDB → S3) no está construido — mientras tanto los 3 archivos se suben desde la VM de ingesta (§8.2).
- **Swagger UI centralizado** no existe — cada microservicio FastAPI tiene `/docs` nativo; MS2 (Go) y MS3 (Node) no tienen Swagger nativo.
