# Despliegue AWS de CloudShop (paso a paso, corregido)

Guía operativa para desplegar CloudShop con una sola plantilla CloudFormation.
Es la versión corregida de la guía anterior: rutas, parámetros y comandos ya
coinciden con lo que hay en el repositorio.

La plantilla crea:

- **Dos MVs de aplicación** (App 1 y App 2), que comparten un `sg-app`.
- **Una MV de base de datos** privada (MySQL + PostgreSQL).
- **Una MV de ingesta** (contenedores Python → S3).
- Un **`sg-ingesta`** para la MV de ingesta.
- Un **`sg-bd`** que permite MySQL (3306) y PostgreSQL (5432) **solo** desde
  `sg-app` y `sg-ingesta`.
- Un **bucket S3**. La MV de ingesta usa el instance profile preexistente
  `LabInstanceProfile` (AWS Academy no permite crear roles de IAM).

La plantilla es:

```text
infrastructure/cloudformation.yaml
```

## 1. Arquitectura que se va a crear

```text
MV App 1 ─┐
          ├── sg-app ───────────────┐
MV App 2 ─┘                         │
                                    v
                              MV Base de Datos (PRIVADA, sin IP pública)
                              ├── MySQL :3306
                              └── PostgreSQL :5432
                                    ^
                                    │
                              sg-ingesta
                                    ^
                                    │
                              MV Ingesta ──► S3 (data lake)
```

Las dos MVs de aplicación comparten el mismo Security Group. Por eso una sola
regla permite que ambas accedan a la MV de datos.

La MV de ingesta usa otro Security Group. La MV de datos tiene cuatro reglas
internas:

```text
sg-app     → MySQL       3306
sg-ingesta → MySQL       3306
sg-app     → PostgreSQL  5432
sg-ingesta → PostgreSQL  5432
```

Esos puertos **nunca** se autorizan desde `0.0.0.0/0` (Internet).

---

## 2. Requisitos

Necesitas:

- Cuenta de AWS (AWS Academy o AWS normal).
- Un **Key Pair** de EC2 en la región donde vas a desplegar.
- El repositorio del proyecto accesible desde GitHub (público).
- Los CSV en `Data/csv/` (ya vienen en el repo, no hay que generarlos).
- La plantilla `infrastructure/cloudformation.yaml`.

La plantilla usa por defecto:

```text
AMI: Ubuntu 22.04 (String, ami-0b33d2f1547e52c78)
KeyName: (lo eliges tú al crear el stack; en AWS Academy usa "vockey")
Tipo: t3.micro
```

Si tu curso usa otra AMI o llave, cambia los parámetros al crear el stack.

> **Nota AWS Academy / Learner Lab:** el Learner Lab bloquea la lectura de
> parámetros públicos de SSM, por eso la plantilla **no** usa
> `AWS::SSM::Parameter::Value` para la AMI, sino un ID fijo (`String`). Si el
> ID por defecto no arranca, copia el de tu cuenta: EC2 → **Launch instance** →
> elige **Ubuntu 22.04 LTS (64-bit x86)** y copia el `ami-...` que aparece.

---

## 3. Parámetros importantes de la plantilla

### `KeyName`

El par de llaves para entrar por SSH a las MVs. Es **obligatorio**. En AWS
Academy Learner Lab el nombre por defecto es `vockey` (y descargas `labsuser.pem`).

### `AmiId`

ID de la AMI de Ubuntu 22.04. Ya viene con un valor por defecto, pero si no
arranca, cámbialo por el que muestra tu consola (EC2 → Launch instance → Ubuntu
22.04 LTS).

### `SshCidr`

Controla quién puede usar SSH. Para una práctica rápida:

```text
0.0.0.0/0
```

Más seguro es usar tu IP pública con `/32`, por ejemplo:

```text
181.50.20.10/32
```

### `RepoUrl`

URL pública del repositorio. Las MVs la clonan al arrancar:

```text
https://github.com/<tu-usuario>/CloudComputing-Project.git
```

### `S3BucketName`

Nombre del bucket del data lake. **Debe ser único globalmente**:

```text
cloudshop-data-lake-g05-2026
```

### Credenciales

`MySqlPassword`, `MySqlRootPassword`, `PostgresPassword` y `JwtSecret`. Las MVs
escriben estos valores en sus `.env` automáticamente. Los usuarios de **solo
lectura** de ingesta (`ingesta_my` / `ingesta_pg`) se crean solos en el primer
arranque de la MV de datos.

### `InstanceType`

La plantilla usa `t3.micro`. Si Docker se queda sin memoria durante el `build`
de las imágenes, usa `t3.small`.

---

## 4. Crear las MVs con CloudFormation

### 4.1 Subir la plantilla a CloudFormation

1. Abre la consola de AWS.
2. Entra a **CloudFormation**.
3. Selecciona **Create stack**.
4. Selecciona **With new resources (standard)**.
5. En **Template source**, selecciona **Upload a template file**.
6. Sube:

```text
infrastructure/cloudformation.yaml
```

7. Pulsa **Next**.
8. En **Stack name**, escribe:

```text
cloudshop
```

9. Revisa estos parámetros:

| Parámetro | Valor recomendado para clase |
|---|---|
| `KeyName` | tu key pair |
| `AmiId` | dejar el de Ubuntu 22.04 |
| `InstanceTypeApp` / `InstanceTypeData` / `InstanceTypeIngesta` | `t3.micro` o `t3.small` |
| `RepoUrl` | URL pública del repo |
| `S3BucketName` | nombre único del bucket |
| `SshCidr` | tu IP `/32`, si la conoces |

10. En **Permissions**, selecciona el rol del laboratorio **`LabRole`** (en AWS
   Academy es obligatorio; la plantilla ya no crea recursos de IAM, así que no
   hace falta marcar la casilla de *CAPABILITY_IAM*).
11. Pulsa **Next → Next → Submit**.
12. Espera el estado `CREATE_COMPLETE`.
13. Abre la pestaña **Outputs**.

Anota estos valores:

```text
App1PublicIp
App2PublicIp
DatabasePrivateIp
IngestaPublicIp
S3BucketName
```

La IP más importante para configurar el backend es:

```text
DatabasePrivateIp
```

Ejemplo:

```text
172.31.25.40
```

---

## 5. Qué hace la plantilla automáticamente (UserData)

| MV | Al arrancar |
|---|---|
| **App 1 / App 2** | Instala Docker + compose, clona el repo, escribe `Backend/.env` y levanta `docker compose up -d --build` (catálogo + usuarios). |
| **Base de datos** | Instala Docker + compose, clona el repo, escribe `Backend/.env` y levanta `docker compose -f docker-compose.datos.yml up -d` (MySQL + PostgreSQL, con esquema y usuarios de solo lectura). |
| **Ingesta** | Instala Docker + compose, clona el repo y escribe los `.env` de los contenedores. **No** ejecuta la ingesta todavía. |

---

## 6. IP elástica

La conexión entre la aplicación y la base de datos usa la **IP privada** de la
MV de datos (`DatabasePrivateIp`).

**No** se debe poner una IP elástica en la MV de datos solo para que la app se
conecte. La IP elástica es pública y la MV de datos ya está en una subred
privada (sin IP pública), que es lo correcto.

Puedes asignar una IP elástica a `App1` si quieres una IP fija para SSH y para
probar la API directamente antes de crear el NLB. La IP elástica **no**
reemplaza el `DatabasePrivateIp`.

---

## 7. Conectarse a las MVs por SSH

En tu PC abre PowerShell (o una terminal):

```powershell
ssh -i tu-key.pem ubuntu@APP1_PUBLIC_IP
```

Para la MV de ingesta:

```powershell
ssh -i tu-key.pem ubuntu@INGESTA_PUBLIC_IP
```

> La MV de base de datos es **privada** y no tiene SSH directo desde internet.
> Para administrarla, entra primero a App 1 y desde ahí alcanza su IP privada.

Si el archivo `.pem` presenta un error de permisos en Windows:

```powershell
icacls tu-key.pem /inheritance:r
icacls tu-key.pem /grant:r "$($env:USERNAME):(R)"
```

Para salir de una MV:

```bash
exit
```

---

## 8. Preparar la MV App 1

La plantilla ya instaló Docker, clonó el repo y arrancó los contenedores. Solo
verifica:

```bash
docker -v
docker compose version
```

Si por alguna razón Docker no quedó instalado:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER
```

Después sal de la sesión y vuelve a entrar para que aplique el grupo:

```bash
exit
```

```powershell
ssh -i tu-key.pem ubuntu@APP1_PUBLIC_IP
```

Revisa que el repo esté en su lugar:

```bash
ls -l /home/ubuntu/cloudshop/Backend
```

Debes ver:

```text
docker-compose.yml
docker-compose.datos.yml
users-address/
products/
.env
```

---

## 9. Preparar la MV de base de datos

La MV de datos ya levantó MySQL y PostgreSQL al arrancar. Para verificarlo,
entra a App 1 y consulta la IP privada de la BD (el output `DatabasePrivateIP`):

```bash
ssh -i tu-key.pem ubuntu@APP1_PUBLIC_IP
nc -vz DATABASE_PRIVATE_IP 3306
nc -vz DATABASE_PRIVATE_IP 5432
```

Si ambos puertos responden, las bases están activas.

### Usuarios que ya quedaron creados

| Motor | Usuario | Permisos |
|---|---|---|
| MySQL | `cloud_user` | lectura/escritura (catálogo) |
| MySQL | `ingesta_my` | solo lectura (ingesta) |
| PostgreSQL | `cloud_user` | lectura/escritura (usuarios) |
| PostgreSQL | `ingesta_pg` | solo lectura (ingesta) |

Estos usuarios los crean `Backend/products/init.sql` y
`Backend/postgres-init/01_esquema.sql` en el primer arranque. No hace falta
crearlos a mano.

---

## 10. Cargar los datos CSV → bases de datos

La MV de datos es privada, así que la carga se hace **desde App 1**.

```bash
ssh -i tu-key.pem ubuntu@APP1_PUBLIC_IP

# Instalar uv (gestor de Python del pipeline de datos)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

cd /home/ubuntu/cloudshop/Data/scripts
cp ../Backend/.env .env        # reusa MYSQL_* y DATABASE_URL (ya apuntan a la BD privada)
uv sync
uv run python -m scripts.load_csv_bd --dry-run   # valida CSVs sin conectar
uv run python -m scripts.load_csv_bd             # carga MySQL + PostgreSQL
```

Verificar el conteo (también desde App 1):

```bash
docker run --rm --network host mysql:8.4 sh -c \
  "mysql -h DATABASE_PRIVATE_IP -ucloud_user -p -e 'SELECT (SELECT COUNT(*) FROM cloudshop_catalogo.productos) AS productos;'"
docker run --rm --network host postgres:16-alpine sh -c \
  "psql 'postgresql://cloud_user:CLAVE@DATABASE_PRIVATE_IP:5432/cloudshop_usuarios' -c 'SELECT COUNT(*) FROM usuarios;'"
```

Espera `productos=5699` y `usuarios=20000`.

---

## 11. Verificar los microservicios

Desde App 1:

```bash
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

Desde tu PC (para probar la IP pública):

```bash
curl http://APP1_PUBLIC_IP:8080/api/catalogo/productos?limit=3
curl -X POST http://APP1_PUBLIC_IP:8000/usuarios/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"EMAIL_DE_USUARIO","password":"usuario00042"}'
```

> Las contraseñas de los 20k usuarios Faker son `usuario` + id con 5 dígitos.

---

## 12. Configurar la MV App 2

App 2 ya tiene el mismo `sg-app`, así que la MV BD la autoriza automáticamente.
La plantilla también dejó App 2 lista. Solo verifica:

```powershell
ssh -i tu-key.pem ubuntu@APP2_PUBLIC_IP
```

```bash
docker -v
docker compose ps
curl http://localhost:8000/health
curl http://localhost:8080/health
```

Si necesitas arrancarla manualmente (por ejemplo, después de cargar los datos):

```bash
cd /home/ubuntu/cloudshop/Backend
docker compose up -d --build
```

---

## 13. Preparar la MV de ingesta

La MV de ingesta ya tiene acceso de red a MySQL y PostgreSQL (vía `sg-ingesta`)
y usa usuarios de **solo lectura**. La instancia usa el instance profile
`LabInstanceProfile`, así que `boto3` toma de ahí las credenciales para escribir
en S3 (no hace falta configurar claves).

```powershell
ssh -i tu-key.pem ubuntu@INGESTA_PUBLIC_IP
```

La plantilla ya escribió los `.env`. Verifica que apunten a la IP privada de la
BD:

```bash
cat /home/ubuntu/cloudshop/Ingesta/ingesta-usuarios/.env
cat /home/ubuntu/cloudshop/Ingesta/ingesta-catalogo/.env
```

Debes ver `POSTGRES_HOST=DATABASE_PRIVATE_IP` y `MYSQL_HOST=DATABASE_PRIVATE_IP`.

Ejecuta la ingesta:

```bash
cd /home/ubuntu/cloudshop/Ingesta
docker compose up --build
```

Los contenedores extraen el 100 % de los registros y terminan. Verifica S3:

```bash
aws s3 ls s3://S3_BUCKET_NAME/ --recursive
```

Estructura esperada:

```text
usuarios/usuarios.csv
usuarios/direcciones_envio.csv
catalogo/categorias.csv
catalogo/productos.csv
catalogo/inventario.csv
catalogo/movimientos_stock.csv
```

Flujo de ingesta:

```text
MV ingesta
   |
   | SELECT con usuario de solo lectura
   v
MV BD: MySQL/PostgreSQL
   |
   | genera CSV
   v
S3
   |
   v
Glue → Athena (roadmap)
```

---

## 14. Cómo se verifica la seguridad de la conexión

La conexión de App 1 y App 2 hacia la BD funciona porque ambas tienen `sg-app`.
La conexión de Ingesta funciona porque tiene `sg-ingesta`.

La MV BD **no** acepta 3306 o 5432 basándose en una IP pública. Acepta según el
Security Group de origen:

```text
SourceSecurityGroupId: sg-app
SourceSecurityGroupId: sg-ingesta
```

Si una cuarta MV no tiene ninguno de esos SG, no podrá conectarse, aunque esté
dentro de la misma VPC. La IP privada indica el destino; el Security Group
decide si la conexión puede pasar.

---

## 15. Configurar NLB y API Gateway (Hito 2)

Para usar las dos MVs app en producción:

1. Crear un Security Group para el NLB.
2. Crear un Target Group para el puerto 8000.
3. Crear un Target Group para el puerto 8080.
4. Registrar App 1 y App 2 en ambos Target Groups.
5. Crear health checks con `/health`.
6. Crear los listeners del NLB.
7. Modificar `sg-app` para permitir 8000 y 8080 solo desde el SG del NLB.

En la arquitectura final, las peticiones pasan por **API Gateway → NLB**, no
directamente por las IPs públicas de las MVs app.

---

## 16. Conectar el frontend cuando esté listo

El frontend se publica en AWS Amplify. No se coloca dentro de la MV BD.

El flujo final será:

```text
Frontend React en Amplify
          |
          | HTTPS
          v
API Gateway
          |
          v
NLB privado
          |
          v
MV App 1 o MV App 2
```

En el frontend se configura:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://URL_DEL_API_GATEWAY
```

En el `.env` del backend se agrega el origen de Amplify:

```dotenv
CORS_ORIGINS=https://mi-aplicacion.amplifyapp.com
```

Durante las pruebas iniciales (sin API Gateway), puedes apuntar el frontend a:

```dotenv
VITE_API_BASE_URL=http://APP1_PUBLIC_IP
```

---

## 17. Problemas comunes

### `connection refused` a PostgreSQL o MySQL

Desde App 1:

```bash
nc -vz DATABASE_PRIVATE_IP 3306
nc -vz DATABASE_PRIVATE_IP 5432
```

Si falla:

1. Revisa que la MV BD esté activa.
2. Revisa los puertos con `docker ps` (en la MV BD).
3. Revisa que la app tenga `sg-app` y la ingesta `sg-ingesta`.
4. Revisa que la BD tenga las reglas desde `sg-app` y `sg-ingesta`.
5. Revisa que `DATABASE_PRIVATE_IP` sea correcta.

### El contenedor `usuarios` se reinicia

Las causas más comunes:

- `DATABASE_URL` incorrecta.
- PostgreSQL apagado.
- Contraseña incorrecta.
- Puerto 5432 bloqueado.

### El contenedor `catalogo` muestra `DISCONNECTED`

Revisa `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` y el
puerto 3306.

### La MV de ingesta puede conectarse pero no escribir

Eso es lo esperado. `ingesta_my` e `ingesta_pg` tienen solo permisos `SELECT`.

### `load_csv_bd.py` no encuentra las tablas

Asegúrate de que la MV BD arrancó con los `init.sql` montados (el
`docker-compose.datos.yml` ya lo hace). Las tablas se crean en el primer arranque
del contenedor.

---

## 18. Checklist final

- [ ] Se creó el stack `cloudshop` y terminó en `CREATE_COMPLETE`.
- [ ] Existen App 1, App 2, BD e Ingesta.
- [ ] App 1 y App 2 comparten `sg-app`.
- [ ] La MV BD está en la subred privada (sin IP pública).
- [ ] BD permite 3306/5432 solo desde `sg-app` y `sg-ingesta`.
- [ ] `MYSQL_HOST` y `DATABASE_URL` usan la IP privada de la BD.
- [ ] `curl localhost:8080/health` muestra `CONNECTED`.
- [ ] `curl localhost:8000/health` responde `{"status":"ok"}`.
- [ ] Los datos se cargaron con `load_csv_bd.py` (productos=5699, usuarios=20000).
- [ ] La ingesta cargó los CSV en S3.
- [ ] Ingesta usa usuarios de solo lectura.
- [ ] NLB y API Gateway quedan para el Hito 2.
- [ ] Amplify usará la URL de API Gateway cuando el frontend esté listo.
