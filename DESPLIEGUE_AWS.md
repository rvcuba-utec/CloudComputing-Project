# Guía de despliegue en AWS — CloudShop (paso a paso)

Guía hecha para seguirla tal cual, como en los talleres: te dice **en qué carpeta
entrar**, **qué comando ejecutar** y **qué deberías ver**. Todo se hace **desde
las VMs** (conexión SSH): construir imágenes, subirlas a Docker Hub y levantar
los contenedores.

> Arquitectura objetivo:
> Amplify → API Gateway → NLB → 2 VMs app (Docker Compose) → VM datos
> (PostgreSQL + MySQL) → VM ingesta → S3 / Glue / Athena.

---

## Índice

0. [Cómo conectarse a las VMs (SSH)](#0-cómo-conectarse-a-las-vms-ssh)
1. [Crear las VMs con CloudFormation (plantillas de clase)](#1-crear-las-vms-con-cloudformation-plantillas-de-clase)
2. [IP elástica: ¿se usa para conectar app ↔ base de datos?](#2-ip-elástica-se-usa-para-conectar-app--base-de-datos)
3. [MV de aplicación: subir código y publicar imágenes](#3-mv-de-aplicación-subir-código-y-publicar-imágenes)
4. [MV de base de datos: levantar MySQL y PostgreSQL](#4-mv-de-base-de-datos-levantar-mysql-y-postgresql)
5. [Cargar los datos (CSV) en la MV de base de datos](#5-cargar-los-datos-csv-en-la-mv-de-base-de-datos)
6. [Conectar la app con la base de datos y arrancar](#6-conectar-la-app-con-la-base-de-datos-y-arrancar)
7. [Segunda MV app (para el balanceador)](#7-segunda-mv-app-para-el-balanceador)
8. [Balanceador (NLB) y API Gateway](#8-balanceador-nlb-y-api-gateway)
9. [VM de ingesta (fase Data Science)](#9-vm-de-ingesta-fase-data-science)
10. [Frontend (Amplify) — cuando lo tengas](#10-frontend-amplify--cuando-lo-tengas)
11. [Problemas comunes](#11-problemas-comunes)

---

## 0. Cómo conectarse a las VMs (SSH)

Como en el **Taller 1**, necesitas el archivo `.pem` de AWS Academy.

1. En AWS Academy, entra a **AWS Details → Download PEM** y guarda `labsuser.pem`.
2. Ponlo en una carpeta, por ejemplo `C:\Users\maxwe\Desktop\RB22\Cloud\`.
3. Abre **PowerShell** y ve a esa carpeta:

```powershell
cd C:\Users\maxwe\Desktop\RB22\Cloud
```

4. Conéctate a la VM (reemplaza la IP por la de tu instancia):

```powershell
ssh -i labsuser.pem ubuntu@IP_PUBLICA_DE_LA_VM
```

> **Si da error de permisos del `.pem`** en Windows:
> ```powershell
> icacls labsuser.pem /inheritance:r
> icacls labsuser.pem /grant:r "$($env:USERNAME):(R)"
> ```

Ya dentro verás el prompt `ubuntu@ip-172-31-xx-xx:~$`. **Todos los comandos de
esta guía se ejecutan dentro de la VM** (salvo donde se diga "en tu PC").

Para salir de la VM: `exit`.

---

## 1. Crear las VMs con CloudFormation (plantillas de clase)

### 1.1 ¿Sirven las plantillas que ya tengo de clase?

**Sí, son funcionales.** Usan la misma AMI (`Cloud9Ubuntu22`, que ya trae Docker),
el mismo KeyName (`vockey`) y crean una EC2 con 20 GB. Solo hay que **abrir
puertos distintos** porque nuestra app usa dos servicios (8000 y 8080) y la base
de datos usa dos motores (3306 y 5432).

| Plantilla de clase | Puertos que abre | ¿Sirve para CloudShop? | Diferencia / ajuste |
|---|---|---|---|
| `plantilla_crear_mv.yaml` | 22, 80 | Sí, como base | Le faltan 8000 y 8080 |
| `plantilla_crear_mv_test.yaml` | 22, 80, **8000** | Sirve para la MV app | Le falta **8080** (catálogo) |
| `plantilla_crear_mv_bd.yaml` | 22, **8080** | Sirve para la MV BD (Adminer) | Le faltan **3306** (MySQL) y **5432** (PostgreSQL) |
| `plantilla_crear_mv_con_webs.yaml` | 22, 80 | No aplica | Es para webs estáticas |

Por eso dejé **dos plantillas ya ajustadas** en la carpeta `infra/`:

| Archivo | Para qué | Puertos |
|---|---|---|
| `infra/plantilla_mv_app.yaml` | MV de aplicación | 22, 80, **8000**, **8080** |
| `infra/plantilla_mv_bd.yaml` | MV de base de datos | 22, 8080, **3306**, **5432** (solo desde la VPC) |

> Son iguales a las de clase + los puertos nuevos. Puedes usarlas directamente.

### 1.2 Crear la MV de aplicación

1. En la consola de AWS entra a **CloudFormation**.
2. **Create stack → With new resources (standard)**.
3. En **Template source** elige **Upload a template file** y sube
   `infra/plantilla_mv_app.yaml`.
4. **Next**. En **Stack name** escribe `cloudshop-app`.
5. En **InstanceName** escribe `MV App CloudShop`. Deja el resto por defecto.
6. **Next → Next → Submit**.
7. Espera el estado **CREATE_COMPLETE** (unos minutos).
8. Ve a **Outputs** de la pila y anota:
   - `InstancePublicIP` → para el SSH.
   - `InstancePrivateIP` → la usarás **solo si** esta VM consultara a otra (no en este caso).

### 1.3 Crear la MV de base de datos

Repite el mismo procedimiento, pero:

- Sube `infra/plantilla_mv_bd.yaml`.
- **Stack name**: `cloudshop-bd`.
- **InstanceName**: `MV BD CloudShop`.
- En **OrigenBdCidr** deja `172.31.0.0/16` (es el CIDR típico de la VPC por
  defecto). Si tu VPC usa otro rango, cámbialo aquí.
- Al terminar, anota de **Outputs**:
  - `InstancePrivateIP` → **esta es la IP que pondrás en el `.env` del backend**.
  - `DatabaseSecurityGroupId` → por si luego quieres restringir más el acceso.

> **Regla de seguridad (como en el taller de MySQL):** los puertos de base de
> datos **nunca** se abren a `0.0.0.0/0`. Solo a la VPC o, mejor aún, solo al
> Security Group de la MV app (`AppSecurityGroupId`). En la consola puedes
> editar la regla de entrada y cambiar el origen por ese Security Group.

---

## 2. IP elástica: ¿se usa para conectar app ↔ base de datos?

**Respuesta corta:** No. La conexión app ↔ base de datos se hace por **IP privada**
dentro de la VPC. Una IP elástica es una IP **pública**, y no se necesita para
que dos VMs de la misma VPC se hablen.

Detalle:

| Pregunta | Respuesta |
|---|---|
| ¿La app se conecta a la BD por IP pública o privada? | **Privada** (`InstancePrivateIP` de la MV BD). |
| ¿Necesito IP elástica en la MV de base de datos? | **No.** La BD debe quedar privada; una IP elástica la expondría. |
| ¿Necesito IP elástica en la MV de aplicación? | **Opcional pero recomendable** (como el "IP Fija a MV Desarrollo" del taller): te da una IP pública fija para el SSH y para probar la API en el navegador. |
| ¿Cambia la IP privada? | Solo si **detienes e inicias** la instancia. Por eso: **no detengas la MV de base de datos** durante la demo, o actualiza el `.env` si lo haces. |

Cómo asignar una IP elástica a la **MV app** (opcional):

1. Consola AWS → **EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**.
2. Selecciona la IP → **Actions → Associate Elastic IP address**.
3. Instancia: `MV App CloudShop` → **Associate**.
4. Ahora el SSH y las pruebas usan siempre esa IP.

> Si usas reglas de Security Group **de SG a SG** (origen = `sg-app`), la IP de la
> app ni siquiera importa: la BD acepta a cualquier instancia que tenga ese SG.

---

## 3. MV de aplicación: subir código y publicar imágenes

### 3.1 Entrar por SSH

```powershell
cd C:\Users\maxwe\Desktop\RB22\Cloud
ssh -i labsuser.pem ubuntu@IP_PUBLICA_APP
```

### 3.2 Verificar Docker (como en el Taller 1)

```bash
docker -v
```

Debe mostrar algo como `Docker version 27.x`. La AMI Cloud9Ubuntu ya lo trae.

### 3.3 Crear la carpeta del proyecto y clonar

```bash
cd /home/ubuntu
mkdir -p cloudshop
cd cloudshop
git clone TU_REPO_URL .
```

> Si tu repo ya se llama `cloudshop`, también sirve `git clone TU_REPO_URL cloudshop`.

Verifica que estás en la carpeta correcta:

```bash
ls -l
cd Backend
ls -l
```

Debes ver `docker-compose.yml`, `.env.example`, `users-address/`, `products/`.

### 3.4 Iniciar sesión en Docker Hub (como en el Taller 4)

```bash
docker login -u maxwellcs07
```

Ingresa tu contraseña o token. Debe decir `Login Succeeded`.

### 3.5 Construir las imágenes (desde la VM)

```bash
docker compose build
```

Al terminar, revisa las imágenes creadas:

```bash
docker images
```

Debes ver `maxwellcs07/cloudshop-usuarios` y `maxwellcs07/cloudshop-catalogo`.

### 3.6 Subir las imágenes a Docker Hub

```bash
docker compose push
```

### 3.7 Cerrar sesión

```bash
docker logout
```

> **No arranques todavía la app** (`docker compose up`). Primero hay que tener
> lista la base de datos (Paso 4) y el `.env` (Paso 6). Si arrancas antes, el
> servicio de usuarios fallará al no encontrar PostgreSQL.

---

## 4. MV de base de datos: levantar MySQL y PostgreSQL

### 4.1 Entrar por SSH

```powershell
ssh -i labsuser.pem ubuntu@IP_PUBLICA_BD
```

### 4.2 Crear volumen y red (como en el taller de MySQL)

```bash
docker volume create mysql_data
docker volume create pg_data
docker network create red_bd
```

Comprueba que se crearon:

```bash
docker volume ls
docker network ls
```

### 4.3 Levantar MySQL (puerto 3306)

```bash
docker run -d --name mysql_c --network red_bd \
  -e MYSQL_ROOT_PASSWORD=utec \
  -p 3306:3306 \
  -v mysql_data:/var/lib/mysql \
  mysql:8.0
```

### 4.4 Levantar PostgreSQL (puerto 5432)

```bash
docker run -d --name postgres_c --network red_bd \
  -e POSTGRES_PASSWORD=utec \
  -p 5432:5432 \
  -v pg_data:/var/lib/postgresql/data \
  postgres:16
```

### 4.5 Verificar que ambos están arriba

```bash
docker ps
```

Debes ver `mysql_c` y `postgres_c` en estado `Up`.

### 4.6 Crear el usuario de la app en MySQL

```bash
docker exec -i mysql_c mysql -uroot -putec -e "
CREATE USER IF NOT EXISTS 'cloud_user'@'%' IDENTIFIED BY 'cloudshop123';
GRANT ALL PRIVILEGES ON cloudshop_catalogo.* TO 'cloud_user'@'%';
FLUSH PRIVILEGES;"
```

### 4.7 Crear el usuario y la base en PostgreSQL

```bash
docker exec -i postgres_c psql -U postgres -c "CREATE USER usuarios_app WITH PASSWORD 'cloudshop123';"
docker exec -i postgres_c psql -U postgres -c "CREATE DATABASE cloudshop_usuarios OWNER usuarios_app;"
```

> Las **tablas** de usuarios las crea la propia app (`create_all`) cuando arranca.
> La base vacía es lo único que creas aquí.

---

## 5. Cargar los datos (CSV) en la MV de base de datos

### 5.1 Llevar los CSV a la VM (desde tu PC)

En **PowerShell en tu PC**, desde la raíz del proyecto:

```powershell
scp -i C:\Users\maxwe\Desktop\RB22\Cloud\labsuser.pem -r Data\csv ubuntu@IP_PUBLICA_BD:/home/ubuntu/
scp -i C:\Users\maxwe\Desktop\RB22\Cloud\labsuser.pem Backend\products\init.sql ubuntu@IP_PUBLICA_BD:/home/ubuntu/
```

### 5.2 Copiar el esquema y los CSV dentro del contenedor MySQL

De vuelta en la **VM de base de datos**:

```bash
cd /home/ubuntu
docker cp init.sql mysql_c:/tmp/init.sql
docker cp csv mysql_c:/tmp/csv
```

### 5.3 Crear el esquema de MySQL

```bash
docker exec -i mysql_c mysql -uroot -putec < /home/ubuntu/init.sql
```

### 5.4 Cargar las tablas del catálogo (en orden)

```bash
docker exec mysql_c mysql -uroot -putec --local-infile=1 cloudshop_catalogo -e \
"LOAD DATA LOCAL INFILE '/tmp/csv/catalogo/categorias.csv' INTO TABLE categorias
 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '\"' IGNORE 1 LINES;"

docker exec mysql_c mysql -uroot -putec --local-infile=1 cloudshop_catalogo -e \
"LOAD DATA LOCAL INFILE '/tmp/csv/catalogo/productos.csv' INTO TABLE productos
 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '\"' IGNORE 1 LINES;"

docker exec mysql_c mysql -uroot -putec --local-infile=1 cloudshop_catalogo -e \
"LOAD DATA LOCAL INFILE '/tmp/csv/catalogo/inventario.csv' INTO TABLE inventario
 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '\"' IGNORE 1 LINES;"
```

Genera los movimientos de stock:

```bash
docker exec mysql_c mysql -uroot -putec cloudshop_catalogo -e "CALL poblar_movimientos_stock(25000);"
```

Verifica los conteos:

```bash
docker exec mysql_c mysql -uroot -putec cloudshop_catalogo -e \
"SELECT (SELECT COUNT(*) FROM categorias) AS categorias, (SELECT COUNT(*) FROM productos) AS productos, (SELECT COUNT(*) FROM inventario) AS inventario, (SELECT COUNT(*) FROM movimientos_stock) AS movimientos;"
```

### 5.5 Cargar usuarios y direcciones en PostgreSQL

Primero hay que **arrancar la app** una vez para que cree las tablas (Paso 6).
Si ya lo hiciste, copia los CSV y ejecuta:

```bash
docker cp /home/ubuntu/csv/usuarios.csv postgres_c:/tmp/usuarios.csv
docker cp /home/ubuntu/csv/direcciones_envio.csv postgres_c:/tmp/direcciones_envio.csv

docker exec -i postgres_c psql -U usuarios_app -d cloudshop_usuarios -c \
"\copy usuarios FROM '/tmp/usuarios.csv' CSV HEADER"

docker exec -i postgres_c psql -U usuarios_app -d cloudshop_usuarios -c \
"\copy direcciones_envio FROM '/tmp/direcciones_envio.csv' CSV HEADER"
```

> Si el `\copy` dice que la tabla no existe, todavía no has arrancado la app.
> Vuelve al Paso 6, arráncala, y repite este paso.

---

## 6. Conectar la app con la base de datos y arrancar

### 6.1 Volver a la MV de aplicación

```powershell
ssh -i labsuser.pem ubuntu@IP_PUBLICA_APP
```

### 6.2 Entrar a la carpeta del backend

```bash
cd /home/ubuntu/cloudshop/Backend
ls -l
```

### 6.3 Crear el archivo `.env`

```bash
cp .env.example .env
nano .env
```

Deja el contenido así (reemplaza `IP_PRIVADA_BD` por el `InstancePrivateIP` que
anotaste en el Paso 1.3, y las claves por las que usaste en el Paso 4):

```dotenv
DATABASE_URL=postgresql+psycopg2://usuarios_app:CLAVE_SEGURA@IP_PRIVADA_BD:5432/cloudshop_usuarios
JWT_SECRET=un_string_largo_y_aleatorio
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173

MYSQL_HOST=IP_PRIVADA_BD
MYSQL_PORT=3306
MYSQL_USER=cloud_user
MYSQL_PASSWORD=CLAVE_SEGURA
MYSQL_DATABASE=cloudshop_catalogo
```

Guardar en nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

### 6.4 Descargar las imágenes y arrancar

```bash
docker compose pull
docker compose up -d
```

### 6.5 Verificar

```bash
docker compose ps
docker compose logs -f usuarios
```

Prueba de salud (dentro de la VM):

```bash
curl http://localhost:8000/health    # {"status":"ok"}
curl http://localhost:8080/health    # {"status":"UP","database":"CONNECTED"}
```

Desde tu navegador (en tu PC), usando la IP pública de la MV app:

```text
http://IP_PUBLICA_APP:8000/docs       → Swagger del microservicio de usuarios
http://IP_PUBLICA_APP:8080/health     → health del catálogo
http://IP_PUBLICA_APP:8080/api/catalogo/productos
```

> Al arrancar `usuarios`, su `create_all` crea las tablas en PostgreSQL. Ahora sí
> puedes volver al **Paso 5.5** para cargar `usuarios.csv` y `direcciones_envio.csv`.

---

## 7. Segunda MV app (para el balanceador)

Para el NLB necesitas **dos** VMs de aplicación. Crea otra con la misma plantilla
`infra/plantilla_mv_app.yaml` (Stack name `cloudshop-app-2`, InstanceName
`MV App CloudShop 2`) y repite:

1. SSH a la VM 2.
2. `docker -v`
3. `cd /home/ubuntu && mkdir -p cloudshop && cd cloudshop && git clone TU_REPO_URL .`
4. `cd Backend && cp .env.example .env && nano .env` (mismo contenido que la VM 1).
5. `docker compose pull && docker compose up -d`
6. Verifica `/health`.

Ambas VMs apuntan a la **misma** base de datos.

---

## 8. Balanceador (NLB) y API Gateway

### 8.1 NLB privado

1. Crear un **Network Load Balancer** interno.
2. Dos **Target Groups**:
   - `tg-usuarios`: puerto **8000**, health check `/health`, targets = las 2 VMs app.
   - `tg-catalogo`: puerto **8080**, health check `/health`, targets = las 2 VMs app.
3. Listeners del NLB:
   - puerto **8000** → `tg-usuarios`
   - puerto **8080** → `tg-catalogo`

### 8.2 API Gateway

1. Crear una **REST API** (o HTTP API).
2. Crear un **VPC Link** hacia el NLB.
3. Rutas:
   - `ANY /usuarios/{proxy+}` → VPC Link → NLB :8000
   - `ANY /api/catalogo/{proxy+}` → VPC Link → NLB :8080
4. Desplegar el stage (`prod`) y anotar la **Invoke URL**.

Esa Invoke URL es la que consumirá el frontend.

---

## 9. VM de ingesta (fase Data Science)

Instancia EC2 Ubuntu (puede ser la misma plantilla de app). Corre 3 contenedores
Python que:

1. Hacen `SELECT` (solo lectura) sobre PostgreSQL y MySQL.
2. Exportan CSV/JSON.
3. Suben a **S3**.
4. Luego **Glue** cataloga y **Athena** consulta.

> Esta VM nunca escribe en las bases operacionales.

---

## 10. Frontend (Amplify) — cuando lo tengas

El frontend es independiente. Cuando esté listo:

1. Súbelo a un repositorio y conéctalo a **AWS Amplify** (hosting estático).
2. Amplify te da una URL: `https://algo.amplifyapp.com`.
3. En cada MV app, edita `Backend/.env`:
   ```dotenv
   CORS_ORIGINS=https://algo.amplifyapp.com
   ```
4. Recrea solo el contenedor de usuarios:
   ```bash
   cd /home/ubuntu/cloudshop/Backend
   docker compose up -d usuarios
   ```
5. En el frontend, apunta `VITE_API_BASE_URL` a la **Invoke URL del API Gateway**.

**No afecta** a la base de datos, ni al esquema, ni a los CSVs, ni al catálogo.

---

## 11. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `docker compose build` falla por red | La VM no tiene salida a internet | La instancia necesita IP pública o NAT para descargar dependencias |
| `docker push` da `unauthorized` | No se hizo `docker login` | `docker login -u maxwellcs07` |
| `usuarios` reinicia en bucle | No conecta a PostgreSQL | Revisar `DATABASE_URL`, puerto 5432 abierto al origen correcto |
| `catalogo` da `database: DISCONNECTED` | No conecta a MySQL | Revisar `MYSQL_HOST`, puerto 3306 abierto al origen correcto |
| `connection refused` entre VMs | Se usó la IP pública o el SG no permite | Usar la **IP privada** de la MV BD y abrir 3306/5432 a la VPC o al `sg-app` |
| La app no conecta tras reiniciar la MV BD | Cambió la IP privada | Evita detener la MV BD; si pasa, actualiza `MYSQL_HOST`/`DATABASE_URL` y `docker compose up -d` |
| `\copy` dice que la tabla no existe | La app aún no creó las tablas | Arrancar la app (Paso 6) y reintentar |
| Frontend da error CORS | URL de Amplify no listada | Agregar a `CORS_ORIGINS` y recrear `usuarios` |

### Comandos útiles

```bash
# En la MV app
cd /home/ubuntu/cloudshop/Backend
docker compose ps
docker compose logs -f usuarios
docker compose restart usuarios
docker compose down && docker compose up -d
docker compose pull && docker compose up -d

# En la MV de base de datos
docker ps
docker logs mysql_c
docker logs postgres_c
docker exec -it mysql_c mysql -uroot -putec
docker exec -it postgres_c psql -U postgres
```

---

## Checklist final

- [ ] VMs creadas con `infra/plantilla_mv_app.yaml` y `infra/plantilla_mv_bd.yaml`
- [ ] (Opcional) IP elástica asociada a la MV app
- [ ] MV app: código clonado, `docker login`, `build` y `push` a Docker Hub
- [ ] MV BD: contenedores `mysql_c` y `postgres_c` arriba, con volúmenes `mysql_data` y `pg_data`
- [ ] Datos cargados: catálogo (MySQL) y usuarios/direcciones (PostgreSQL)
- [ ] `.env` con la IP privada de la MV BD
- [ ] `docker compose up -d` en la MV app y `/health` OK
- [ ] Segunda MV app lista (para el NLB)
- [ ] NLB con 2 target groups y API Gateway con VPC Link
- [ ] (Futuro) Amplify + CORS actualizado
