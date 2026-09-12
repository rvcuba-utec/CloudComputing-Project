# Despliegue AWS de CloudShop — Guía desde la consola de AWS Academy

Todo se hace desde el **dashboard de AWS Academy / Learner Lab**. No necesitas
terminal local ni descargar claves. El SSH a las MVs se hace con
**EC2 Instance Connect** directamente en el navegador.

---

## 1. Qué crea la plantilla

La plantilla `infrastructure/cloudformation.yaml` crea todo de una sola vez:

| Recurso | Descripción |
|---|---|
| VPC + subredes | Subred pública (MVs app e ingesta) y privada (MV BD) |
| **MV App 1** | Docker + repo clonado + backends levantados automáticamente |
| **MV App 2** | Igual que App 1 (misma configuración, misma MV) |
| **MV Base de Datos** | MySQL + PostgreSQL en subred **privada** (sin IP pública) |
| **MV Ingesta** | Docker + repo clonado + `.env` de ingesta escritos automáticamente |
| Security Groups | `sg-app`, `sg-bd` (3306/5432 solo desde sg-app y sg-ingesta), `sg-ingesta` |
| Bucket S3 | Data lake para la ingesta |
| NAT Gateway | Salida a internet para la subred privada (la MV BD puede descargar paquetes) |

---

## 2. Crear el stack en CloudFormation

1. En el dashboard de Learner Lab pulsa **AWS** para abrir la consola.
2. Ve a **CloudFormation → Create stack → With new resources (standard)**.
3. En **Template source** elige **Upload a template file** y sube:
   ```
   infrastructure/cloudformation.yaml
   ```
4. Pulsa **Next**. En **Stack name** escribe:
   ```
   cloudshop
   ```
5. Completa los parámetros importantes:

   | Parámetro | Qué poner |
   |---|---|
   | `KeyName` | `vockey` (el Key Pair del Learner Lab) |
   | `AmiId` | Dejar el valor por defecto (Ubuntu 22.04) |
   | `RepoUrl` | URL pública de tu repo en GitHub |
   | `S3BucketName` | `cloudshop-data-lake-2026-utec-mr-cs2032-v2` |
   | `MySqlPassword` / `MySqlRootPassword` | Claves que tú elijas |
   | `PostgresPassword` | Clave que tú elijas |
   | `JwtSecret` | String largo y aleatorio |
   | `CorsOrigins` | `http://localhost:5173` (o la URL de Amplify cuando la tengas) |
   | `InstanceTypeApp` / `InstanceTypeData` / `InstanceTypeIngesta` | `t3.micro` (o `t3.small` si Docker se queda sin memoria) |

6. En **Permissions** selecciona el rol **`LabRole`**.
7. Pulsa **Next → Next → Submit**.
8. Espera el estado **`CREATE_COMPLETE`** (5–10 minutos).
9. Abre la pestaña **Outputs** y anota:

   ```
   App1PublicIp
   App2PublicIp
   DataPrivateIp      ← la necesitas para todo lo que sigue
   IngestaPublicIp
   S3BucketName
   ```

> **Nota AMI:** Si el stack falla porque la AMI no existe en tu región, ve a
> EC2 → **Launch instance** → elige **Ubuntu 22.04 LTS (x86_64)**, copia el
> `ami-...` que aparece, cancela el lanzamiento y vuelve a crear el stack con
> ese ID.

---

## 3. Qué hace el stack automáticamente (no tienes que hacer nada)

| MV | Al arrancar el UserData hace… |
|---|---|
| **App 1 y App 2** | Instala Docker, clona el repo, escribe `Backend/.env` con la IP privada de la BD y levanta `docker compose up -d --build` (microservicios catálogo + usuarios). |
| **Base de Datos** | Instala Docker, clona el repo, escribe `Backend/.env` y levanta `docker compose -f docker-compose.datos.yml up -d` (MySQL + PostgreSQL con esquema e usuarios de solo lectura ya creados). |
| **Ingesta** | Instala Docker, clona el repo y escribe los `.env` de los dos contenedores de ingesta con la IP privada de la BD. **No ejecuta la ingesta aún.** |

Los usuarios de ingesta (`ingesta_my` en MySQL, `ingesta_pg` en PostgreSQL) se
crean solos en el primer arranque de la MV BD. No hay que crearlos a mano.

---

## 4. Conectarse a las MVs — EC2 Instance Connect (desde la consola)

No necesitas terminal local. Desde la consola de AWS:

1. Ve a **EC2 → Instances**.
2. Selecciona la MV (App 1, App 2 o Ingesta).
3. Pulsa **Connect → EC2 Instance Connect → Connect**.

Se abre una terminal en el navegador como usuario `ubuntu`.

> **La MV de Base de Datos es privada** (sin IP pública), así que EC2 Instance
> Connect directo **no funciona** para ella. Para administrarla, conéctate
> primero a **App 1** y desde esa terminal verifica la conectividad:
>
> ```bash
> nc -vz DATA_PRIVATE_IP 3306
> nc -vz DATA_PRIVATE_IP 5432
> ```
>
> Si ambos puertos responden, las bases están activas. Normalmente no necesitas
> entrar a la MV BD: todo lo que hace falta (carga de datos, verificación) se
> hace desde App 1 apuntando a la IP privada.

---

## 5. Verificar que los microservicios arrancaron

Desde la terminal de **App 1** (EC2 Instance Connect):

```bash
docker compose -f /home/ubuntu/cloudshop/Backend/docker-compose.yml ps
curl http://localhost:8080/health
curl http://localhost:8000/health
```

Resultados esperados:

```json
{"status":"UP","database":"CONNECTED"}
```

```json
{"status":"ok"}
```

Si los contenedores aún están arrancando (el UserData puede tardar 3–5 min
desde que la MV aparece como "running"):

```bash
cat /var/log/userdata.log
```

Ese archivo muestra todo lo que ejecutó el UserData. Si ves el git clone y el
`docker compose up` al final, el arranque fue correcto.

---

## 6. Cargar los datos CSV en las bases de datos

Los CSV ya están en el repo (`Data/csv/`). El script `load_csv_bd.py` se ejecuta
**desde App 1**, que tiene red a la MV BD por la subred privada.

Desde la terminal de **App 1** (EC2 Instance Connect):

```bash
# Instalar uv (gestor de Python del pipeline)
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

cd /home/ubuntu/cloudshop/Data/scripts
# El .env del Backend ya tiene MYSQL_* y DATABASE_URL apuntando a la BD privada
cp /home/ubuntu/cloudshop/Backend/.env .env

uv sync
uv run python -m scripts.load_csv_bd --dry-run   # valida sin conectar
uv run python -m scripts.load_csv_bd             # carga los datos
```

Verifica el conteo:

```bash
docker run --rm mysql:8.4 mysql \
  -h DATA_PRIVATE_IP -ucloud_user -pTU_CLAVE \
  -e "SELECT COUNT(*) FROM cloudshop_catalogo.productos;"

docker run --rm postgres:16-alpine psql \
  "postgresql://cloud_user:TU_CLAVE@DATA_PRIVATE_IP:5432/cloudshop_usuarios" \
  -c "SELECT COUNT(*) FROM usuarios;"
```

Espera `productos = 5699` y `usuarios = 20000`.

Después de cargar el catálogo, genera los movimientos de stock (mínimo 25k
registros requeridos):

```bash
docker run --rm mysql:8.4 mysql \
  -h DATA_PRIVATE_IP -ucloud_user -pTU_CLAVE \
  cloudshop_catalogo \
  -e "CALL poblar_movimientos_stock(25000);"
```

---

## 7. Ejecutar la ingesta (MV Ingesta)

Conéctate a la **MV Ingesta** por EC2 Instance Connect y verifica los `.env`:

```bash
cat /home/ubuntu/cloudshop/Ingesta/ingesta-usuarios/.env
cat /home/ubuntu/cloudshop/Ingesta/ingesta-catalogo/.env
```

Deben mostrar `POSTGRES_HOST=DATA_PRIVATE_IP` y `MYSQL_HOST=DATA_PRIVATE_IP`.

Lanza la ingesta (los contenedores corren una vez y terminan):

```bash
cd /home/ubuntu/cloudshop/Ingesta
docker compose up --build
```

Verifica el bucket S3 desde la consola: ve a **S3 → cloudshop-data-lake-2026-utec-mr-cs2032-v2**
y confirma que existen las carpetas `catalogo/` y `usuarios/` con los CSV.

O desde la misma terminal de Ingesta (el IAM Role del Lab ya tiene acceso):

```bash
aws s3 ls s3://cloudshop-data-lake-2026-utec-mr-cs2032-v2/ --recursive
```

Estructura esperada:

```
catalogo/categorias.csv
catalogo/productos.csv
catalogo/inventario.csv
catalogo/movimientos_stock.csv
usuarios/usuarios.csv
usuarios/direcciones_envio.csv
```

---

## 8. Configurar NLB y API Gateway (Hito 2)

Desde la consola de AWS (no hace falta terminal):

1. **EC2 → Load Balancers → Create → Network Load Balancer** (interno/privado).
2. Crea dos **Target Groups**: uno para el puerto `8080` (catálogo) y otro para
   `8000` (usuarios). Health check en `/health`.
3. Registra **App 1 y App 2** en ambos Target Groups.
4. Crea los listeners del NLB.
5. Modifica `sg-app` para que 8080/8000 solo entren desde el SG del NLB.
6. En **API Gateway → HTTP API**, crea una integración con el DNS del NLB.

El flujo final:

```
Frontend (Amplify)
       │ HTTPS
       ▼
API Gateway
       │
       ▼
NLB (privado)
       │
       ▼
MV App 1  /  MV App 2
```

---

## 9. Conectar el frontend

En **Amplify** configura:

```
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://URL_DE_API_GATEWAY
```

En el `.env` del Backend (en ambas MVs app) agrega el origen de Amplify:

```
CORS_ORIGINS=https://mi-app.amplifyapp.com
```

Y reinicia los contenedores:

```bash
cd /home/ubuntu/cloudshop/Backend
docker compose up -d
```

---

## 10. Problemas comunes

### Los contenedores no arrancaron

```bash
cat /var/log/userdata.log
```

Busca si el `docker compose up` aparece al final. Si no aparece, el UserData
falló antes. Lo más común: el repo no es público o el `MYSQL_HOST` quedó vacío.

### `connection refused` a la BD

Desde App 1:

```bash
nc -vz DATA_PRIVATE_IP 3306
nc -vz DATA_PRIVATE_IP 5432
```

Si falla, verifica en la consola que la MV BD está **running** y que `sg-bd`
tiene reglas desde `sg-app`.

### El contenedor `usuarios` se reinicia

Causas más comunes: `DATABASE_URL` incorrecta, contraseña mal escrita, o
PostgreSQL aún iniciando. Revisa con `docker logs cloudshop-usuarios`.

### El contenedor `catalogo` muestra `DISCONNECTED`

Revisa `docker logs cloudshop-catalogo` y confirma que `MYSQL_HOST`,
`MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_DATABASE` en `/home/ubuntu/cloudshop/Backend/.env`
apuntan a la IP privada de la BD.

### La ingesta falla con permiso denegado en S3

El IAM Role del instance profile (`LabInstanceProfile`) debe tener permisos de
escritura en S3. En AWS Academy eso ya viene configurado en el Lab. Si falla,
verifica que la MV Ingesta tiene el instance profile asignado (consola EC2 →
instancia → IAM role).

---

## 11. Checklist final

- [ ] Stack `cloudshop` terminó en `CREATE_COMPLETE`.
- [ ] App 1 y App 2: `curl localhost:8080/health` → `CONNECTED`.
- [ ] App 1 y App 2: `curl localhost:8000/health` → `{"status":"ok"}`.
- [ ] MV BD accesible desde App 1 por 3306 y 5432.
- [ ] Datos cargados: `productos=5699`, `usuarios=20000`, `movimientos_stock≥25000`.
- [ ] Ingesta ejecutada: 6 archivos CSV en S3.
- [ ] NLB creado con App 1 y App 2 como targets (Hito 2).
- [ ] API Gateway integrado con el NLB (Hito 2).
- [ ] Frontend en Amplify apunta a la URL del API Gateway (Hito 2).
