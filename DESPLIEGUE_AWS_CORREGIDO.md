# Despliegue AWS corregido de CloudShop

Esta es la guía operativa final para desplegar CloudShop usando una sola
plantilla CloudFormation. La plantilla crea:

- Dos MVs de aplicación.
- Una MV de base de datos.
- Una MV de ingesta.
- Un `sg-app` compartido por las dos MVs de aplicación.
- Un `sg-ingesta` para la MV de ingesta.
- Un `sg-bd` que permite MySQL y PostgreSQL solamente desde `sg-app` y
  `sg-ingesta`.

La plantilla es:

```text
infra/plantilla_cloudshop_completa.yaml
```

## 1. Arquitectura que se va a crear

```text
MV App 1 ─┐
          ├── sg-app ───────────────┐
MV App 2 ─┘                         │
                                    v
                              MV Base de Datos
                              ├── MySQL :3306
                              └── PostgreSQL :5432
                                    ^
                                    │
                              sg-ingesta
                                    ^
                                    │
                              MV Ingesta
```

Las dos MVs de aplicación comparten el mismo Security Group. Por eso, una sola
regla permite que ambas accedan a la MV de datos.

La MV de ingesta tiene otro Security Group. La MV de datos tiene cuatro reglas
internas:

```text
sg-app     → MySQL       3306
sg-ingesta → MySQL       3306
sg-app     → PostgreSQL  5432
sg-ingesta → PostgreSQL  5432
```

No se autorizan esos puertos desde cualquier IP de Internet.

---

## 2. Requisitos

Necesitas:

- Cuenta de AWS Academy o AWS.
- Archivo `labsuser.pem` descargado desde AWS Academy.
- Docker Hub con el usuario `maxwellcs07`.
- El repositorio del proyecto accesible desde GitHub.
- Los CSV en `Data/csv/`.
- La plantilla `infra/plantilla_cloudshop_completa.yaml`.

La plantilla usa por defecto:

```text
AMI: ami-0b33d2f1547e52c78
KeyName: vockey
Tipo: t2.micro
```

Si tu curso utiliza otra AMI o llave, cambia esos parámetros al crear el
stack.

---

## 3. Parámetros importantes de la plantilla

### `AdminCidr`

Controla quién puede usar SSH y quién puede abrir Adminer.

Para una práctica rápida se puede dejar:

```text
0.0.0.0/0
```

Pero es más seguro usar tu IP pública con `/32`, por ejemplo:

```text
181.50.20.10/32
```

### `AppTestCidr`

Controla quién puede probar directamente los puertos 8000 y 8080 de las MVs
app. Para una prueba de clase se puede usar `0.0.0.0/0`.

Cuando se configure el NLB, lo correcto es cambiar esta regla para aceptar solo
desde el Security Group del NLB.

### `InstanceType`

La plantilla usa `t2.micro` para parecerse a las plantillas del curso. Si Docker
se queda sin memoria durante el `build`, usa `t3.small` o construye en una MV
temporal con más memoria.

---

## 4. Crear las cuatro MVs con CloudFormation

### 4.1 Subir la plantilla a CloudFormation

1. Abre la consola de AWS.
2. Entra a **CloudFormation**.
3. Selecciona **Create stack**.
4. Selecciona **With new resources (standard)**.
5. En **Template source**, selecciona **Upload a template file**.
6. Sube:

```text
infra/plantilla_cloudshop_completa.yaml
```

7. Pulsa **Next**.
8. En **Stack name**, escribe:

```text
cloudshop-completo
```

9. Revisa estos parámetros:

| Parámetro | Valor recomendado para clase |
|---|---|
| `InstanceNamePrefix` | `CloudShop` |
| `AMI` | La AMI entregada por la clase |
| `KeyName` | `vockey` |
| `InstanceType` | `t2.micro` o `t3.small` |
| `AdminCidr` | Tu IP `/32`, si la conoces |
| `AppTestCidr` | Tu IP `/32` o `0.0.0.0/0` para probar |

10. Pulsa **Next → Next → Submit**.
11. Espera el estado `CREATE_COMPLETE`.
12. Abre la pestaña **Outputs**.

Anota estos valores:

App1PublicIP
App2PublicIP
DatabasePublicIP
DatabasePrivateIP
IngestaPublicIP
AppSecurityGroupId
IngestaSecurityGroupId
DatabaseSecurityGroupId
```

La IP más importante para configurar el backend es:

DatabasePrivateIP
```

Ejemplo:

172.31.25.40
```

---

## 5. Qué diferencia hay con las plantillas de clase

Las plantillas de clase sí eran funcionales, pero normalmente creaban una sola
MV y su Security Group permitía pocos puertos.

La nueva plantilla agrega:

- Dos MVs de aplicación, no una.
- Una MV exclusiva para ingesta.
- Un SG común para ambas MVs app.
- Reglas SG-to-SG en la MV de datos.
- Puerto 3306 para MySQL.
- Puerto 5432 para PostgreSQL.
- Outputs con IPs privadas y públicas.

La diferencia más importante es esta:

```text
Antes:  BD permite por CIDR o se configura manualmente.
Ahora:  BD permite solo desde sg-app y sg-ingesta.
```

---

## 6. IP elástica

La conexión entre la aplicación y la base de datos usa la **IP privada** de la
MV de datos.

No se debe poner una IP elástica en la MV de datos solo para que la app se
conecte. La IP elástica es pública y no es necesaria dentro de la VPC.

Puedes asignar una IP elástica a `App1` si quieres una IP fija para:

- SSH.
- Probar `/docs` desde el navegador.
- Probar la API directamente antes de crear el NLB.

La IP elástica no reemplaza el `DatabasePrivateIP`.

El backend usará:

```text
IP privada de la BD:5432
IP privada de la BD:3306
```

---

## 7. Conectarse a las MVs desde la consola de AWS

La forma más fácil es conectarte desde la interfaz web de AWS (sin PowerShell ni
el `.pem`):

1. En la consola de AWS entra a **EC2 → Instances**.
2. Marca la instancia que quieras (App 1, App 2, BD o Ingesta).
3. Pulsa **Connect**.
4. En la pestaña **EC2 Instance Connect** deja el usuario `ubuntu` (ya viene por
   defecto) y pulsa **Connect**.
5. Se abre una terminal en el navegador. Todos los comandos de esta guía se
   ejecutan ahí.

Para salir de una MV:

```bash
exit
```

### Conexión alternativa por SSH desde tu PC (opcional)

Si prefieres conectarte desde PowerShell:

```powershell
cd C:\Users\maxwe\Desktop\RB22\Cloud
ssh -i labsuser.pem ubuntu@APP1_PUBLIC_IP
```

Para la MV de datos:

```powershell
ssh -i labsuser.pem ubuntu@DATABASE_PUBLIC_IP
```

Para la MV de ingesta:

```powershell
ssh -i labsuser.pem ubuntu@INGESTA_PUBLIC_IP
```

Si el archivo `.pem` presenta un error de permisos en Windows:

```powershell
icacls labsuser.pem /inheritance:r
icacls labsuser.pem /grant:r "$($env:USERNAME):(R)"
```

---

## 8. Preparar la MV App 1

### 8.1 Entrar a la MV

En **EC2 → Instances** selecciona la MV **App 1** y pulsa **Connect → Connect**
(EC2 Instance Connect). Se abre la terminal como usuario `ubuntu`.

### 8.2 Verificar Docker

```bash
docker -v
```

La AMI del curso normalmente ya trae Docker. Si no lo trae:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
```

Después sal de la sesión y vuelve a entrar:

```bash
exit
```

Vuelve a entrar con **Connect** (EC2 → Instances → App 1 → Connect).

### 8.3 Crear la carpeta del proyecto

```bash
cd /home/ubuntu
mkdir -p cloudshop
cd cloudshop
```

### 8.4 Descargar el repositorio

```bash
git clone TU_REPO_URL .
```

Comprueba la estructura:

```bash
ls -l
cd Backend
ls -l
```

Debes ver:

```text
docker-compose.yml
users-address/
products/
.env.example
```

### 8.5 Iniciar sesión en Docker Hub

```bash
docker login -u maxwellcs07
```

Introduce el token de Docker Hub. Debe aparecer:

```text
Login Succeeded
```

### 8.6 Construir las imágenes

Desde esta carpeta:

```bash
cd /home/ubuntu/cloudshop/Backend
docker compose build
```

Revisa las imágenes creadas:

```bash
docker images
```

Deben aparecer:

```text
maxwellcs07/cloudshop-usuarios
maxwellcs07/cloudshop-catalogo
```

### 8.7 Publicar las imágenes

```bash
docker compose push
docker logout
```

En este momento Docker Hub contiene las imágenes que usarán App 1 y App 2.

Todavía no ejecutes `docker compose up`. Primero prepara la MV de datos.

---

## 9. Preparar la MV de base de datos

### 9.1 Entrar a la MV BD

En **EC2 → Instances** selecciona la MV **BD** y pulsa **Connect → Connect**.

### 9.2 Verificar Docker

```bash
docker -v
docker compose version
```

### 9.3 Crear volúmenes

```bash
docker volume create mysql_data
docker volume create pg_data
```

Los volúmenes conservan los datos si se elimina el contenedor.

### 9.4 Crear una red Docker

```bash
docker network create red_bd
```

Esta red es interna de la MV BD. La conexión desde las MVs app se realiza por la
VPC de AWS y las IPs privadas.

### 9.5 Ejecutar MySQL

```bash
docker run -d \
  --name mysql_c \
  --network red_bd \
  -e MYSQL_ROOT_PASSWORD=utec \
  -p 3306:3306 \
  -v mysql_data:/var/lib/mysql \
  mysql:8.0
```

### 9.6 Ejecutar PostgreSQL

```bash
docker run -d \
  --name postgres_c \
  --network red_bd \
  -e POSTGRES_PASSWORD=utec \
  -p 5432:5432 \
  -v pg_data:/var/lib/postgresql/data \
  postgres:16
```

### 9.7 Verificar los contenedores

```bash
docker ps
```

Ambos contenedores deben aparecer con estado `Up`.

### 9.8 Crear usuario de MySQL para el catálogo

```bash
docker exec -i mysql_c mysql -uroot -putec -e "
CREATE USER IF NOT EXISTS 'cloud_user'@'%' IDENTIFIED BY 'CLAVE_SEGURA';
GRANT ALL PRIVILEGES ON cloudshop_catalogo.* TO 'cloud_user'@'%';
FLUSH PRIVILEGES;"
```

El Security Group sigue siendo la primera barrera. El usuario de MySQL solo
funciona si la conexión ya pasó el firewall de AWS.

### 9.9 Crear usuario y base de PostgreSQL

```bash
docker exec -i postgres_c psql -U postgres -c "CREATE USER usuarios_app WITH PASSWORD 'CLAVE_SEGURA';"
docker exec -i postgres_c psql -U postgres -c "CREATE DATABASE cloudshop_usuarios OWNER usuarios_app;"
```

---

## 10. Cargar datos en la MV BD

La forma más simple para la práctica es copiar los archivos desde tu PC a la MV
BD. Este paso sí se hace desde tu PC con PowerShell, porque la terminal del
navegador (EC2 Instance Connect) no permite subir archivos grandes:

```powershell
cd C:\Users\maxwe\Desktop\RB22\Cloud\CloudComputing-Project
scp -i C:\Users\maxwe\Desktop\RB22\Cloud\labsuser.pem -r Data\csv ubuntu@DATABASE_PUBLIC_IP:/home/ubuntu/
scp -i C:\Users\maxwe\Desktop\RB22\Cloud\labsuser.pem Backend\products\init.sql ubuntu@DATABASE_PUBLIC_IP:/home/ubuntu/
```

En la MV BD:

```bash
cd /home/ubuntu
```

Crear el esquema MySQL:

```bash
docker cp init.sql mysql_c:/tmp/init.sql
docker cp csv mysql_c:/tmp/csv
docker exec -i mysql_c mysql -uroot -putec < /home/ubuntu/init.sql
```

Cargar las tablas en orden:

```bash
docker exec mysql_c mysql -uroot -putec --local-infile=1 cloudshop_catalogo -e \
"LOAD DATA LOCAL INFILE '/tmp/csv/catalogo/categorias.csv'
 INTO TABLE categorias
 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '\"'
 IGNORE 1 LINES;"

docker exec mysql_c mysql -uroot -putec --local-infile=1 cloudshop_catalogo -e \
"LOAD DATA LOCAL INFILE '/tmp/csv/catalogo/productos.csv'
 INTO TABLE productos
 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '\"'
 IGNORE 1 LINES;"

docker exec mysql_c mysql -uroot -putec --local-infile=1 cloudshop_catalogo -e \
"LOAD DATA LOCAL INFILE '/tmp/csv/catalogo/inventario.csv'
 INTO TABLE inventario
 FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '\"'
 IGNORE 1 LINES;"
```

Generar los 25,000 movimientos:

```bash
docker exec mysql_c mysql -uroot -putec cloudshop_catalogo -e "CALL poblar_movimientos_stock(25000);"
```

Verificar MySQL:

```bash
docker exec mysql_c mysql -uroot -putec cloudshop_catalogo -e \
"SELECT COUNT(*) AS categorias FROM categorias;
 SELECT COUNT(*) AS productos FROM productos;
 SELECT COUNT(*) AS inventario FROM inventario;
 SELECT COUNT(*) AS movimientos FROM movimientos_stock;"
```

Las tablas de PostgreSQL serán creadas por el microservicio de usuarios al
arrancar. Por eso, los CSV de PostgreSQL se cargan después del primer arranque
del backend.

---

## 11. Configurar y levantar la MV App 1

Volver a la MV App 1:

```bash
exit
```

Después entra de nuevo con **EC2 → Instances → App 1 → Connect**.

Entrar al backend:

```bash
cd /home/ubuntu/cloudshop/Backend
```

Crear el archivo real de variables:

```bash
cp .env.example .env
nano .env
```

Usar la **IP privada de la MV BD**, no su IP pública:

```dotenv
DATABASE_URL=postgresql+psycopg2://usuarios_app:CLAVE_SEGURA@DATABASE_PRIVATE_IP:5432/cloudshop_usuarios
JWT_SECRET=un_secreto_largo_y_aleatorio
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
CORS_ORIGINS=http://localhost:5173

MYSQL_HOST=DATABASE_PRIVATE_IP
MYSQL_PORT=3306
MYSQL_USER=cloud_user
MYSQL_PASSWORD=CLAVE_SEGURA
MYSQL_DATABASE=cloudshop_catalogo
```

Reemplaza `DATABASE_PRIVATE_IP` por el output `DatabasePrivateIP` del stack.

Guardar en nano:

```text
Ctrl+O → Enter → Ctrl+X
```

Descargar las imágenes y arrancar sin reconstruir:

```bash
docker compose pull
docker compose up -d --no-build
```

Verificar:

```bash
docker compose ps
```

Probar desde la MV:

```bash
curl http://localhost:8000/health
curl http://localhost:8080/health
```

Resultados esperados:

```json
{"status":"ok"}
```

Y para catálogo:

```json
{"status":"UP","database":"CONNECTED"}
```

---

## 12. Cargar usuarios y direcciones en PostgreSQL

Después de levantar la app, `Base.metadata.create_all` crea las tablas.

Vuelve a la MV BD con **EC2 → Instances → BD → Connect** y copia los CSV al
contenedor:

```bash
docker cp /home/ubuntu/csv/usuarios.csv postgres_c:/tmp/usuarios.csv
docker cp /home/ubuntu/csv/direcciones_envio.csv postgres_c:/tmp/direcciones_envio.csv
```

Carga los datos:

```bash
docker exec -i postgres_c psql -U usuarios_app -d cloudshop_usuarios -c \
"\copy usuarios FROM '/tmp/usuarios.csv' CSV HEADER"

docker exec -i postgres_c psql -U usuarios_app -d cloudshop_usuarios -c \
"\copy direcciones_envio FROM '/tmp/direcciones_envio.csv' CSV HEADER"
```

Verificar:

```bash
docker exec -i postgres_c psql -U usuarios_app -d cloudshop_usuarios -c \
"SELECT COUNT(*) FROM usuarios;"

docker exec -i postgres_c psql -U usuarios_app -d cloudshop_usuarios -c \
"SELECT COUNT(*) FROM direcciones_envio;"
```

---

## 13. Configurar la MV App 2

App 2 ya tiene el mismo `sg-app`, por lo que la MV BD la autoriza
automáticamente.

Entrar:

```bash
exit
```

Entra a **App 2** con **EC2 → Instances → App 2 → Connect**.

Preparar Docker si fuera necesario:

```bash
docker -v
docker compose version
```

Descargar el código:

```bash
cd /home/ubuntu
mkdir -p cloudshop
cd cloudshop
git clone TU_REPO_URL .
cd Backend
```

Crear el mismo `.env` usado en App 1:

```bash
cp .env.example .env
nano .env
```

Descargar las imágenes:

```bash
docker login -u maxwellcs07
docker compose pull
docker compose up -d --no-build
docker logout
```

Probar:

```bash
docker compose ps
curl http://localhost:8000/health
curl http://localhost:8080/health
```

---

## 14. Cómo se verifica la seguridad de la conexión

La conexión de App 1 y App 2 hacia la BD funciona porque ambas tienen:

```text
sg-app
```

La conexión de Ingesta funciona porque tiene:

```text
sg-ingesta
```

La MV BD no acepta 3306 o 5432 basándose en una IP pública. Acepta según el SG
de origen:

```text
SourceSecurityGroupId: sg-app
SourceSecurityGroupId: sg-ingesta
```

Si una cuarta MV no tiene ninguno de esos SG, no debería poder conectarse,
aunque esté dentro de la misma VPC.

La IP privada solamente indica el destino. El Security Group decide si la
conexión puede pasar.

---

## 15. Preparar la MV de ingesta

La MV de ingesta tiene acceso de red a MySQL y PostgreSQL porque comparte reglas
con `sg-ingesta`, pero debe utilizar usuarios de solo lectura.

### 15.1 Entrar a la MV

En **EC2 → Instances** selecciona la MV **Ingesta** y pulsa **Connect → Connect**.

### 15.2 Crear carpeta de trabajo

```bash
cd /home/ubuntu
mkdir -p ingesta
cd ingesta
```

### 15.3 Configuración que usarán los contenedores de ingesta

```dotenv
MYSQL_HOST=DATABASE_PRIVATE_IP
MYSQL_PORT=3306
MYSQL_DATABASE=cloudshop_catalogo
MYSQL_USER=ingesta_mysql
MYSQL_PASSWORD=CLAVE_LECTURA

POSTGRES_HOST=DATABASE_PRIVATE_IP
POSTGRES_PORT=5432
POSTGRES_DB=cloudshop_usuarios
POSTGRES_USER=ingesta_pg
POSTGRES_PASSWORD=CLAVE_LECTURA
```

### 15.4 Crear usuarios de solo lectura

En la MV BD:

```bash
docker exec -i mysql_c mysql -uroot -putec -e "
CREATE USER IF NOT EXISTS 'ingesta_mysql'@'%' IDENTIFIED BY 'CLAVE_LECTURA';
GRANT SELECT ON cloudshop_catalogo.* TO 'ingesta_mysql'@'%';
FLUSH PRIVILEGES;"
```

Para PostgreSQL:

```bash
docker exec -i postgres_c psql -U postgres -d cloudshop_usuarios -c \
"CREATE USER ingesta_pg WITH PASSWORD 'CLAVE_LECTURA';"

docker exec -i postgres_c psql -U postgres -d cloudshop_usuarios -c \
"GRANT CONNECT ON DATABASE cloudshop_usuarios TO ingesta_pg;"

docker exec -i postgres_c psql -U postgres -d cloudshop_usuarios -c \
"GRANT USAGE ON SCHEMA public TO ingesta_pg;"

docker exec -i postgres_c psql -U postgres -d cloudshop_usuarios -c \
"GRANT SELECT ON ALL TABLES IN SCHEMA public TO ingesta_pg;"
```

Aunque la ingesta tiene acceso de red, sus credenciales no tienen permisos de
`INSERT`, `UPDATE` o `DELETE`.

### 15.5 Flujo de ingesta

```text
MV ingesta
   |
   | SELECT con usuario de solo lectura
   v
MV BD: MySQL/PostgreSQL
   |
   | genera CSV/JSON
   v
S3
   |
   v
Glue → Athena
```

La ingesta no debe modificar la información operacional.

---

## 16. Configurar NLB posteriormente

Para usar las dos MVs app en producción:

1. Crear un Security Group para el NLB.
2. Crear un Target Group para puerto 8000.
3. Crear un Target Group para puerto 8080.
4. Registrar App 1 y App 2 en ambos Target Groups.
5. Crear health check `/health`.
6. Crear listeners del NLB.
7. Modificar el `sg-app` para permitir 8000 y 8080 desde el SG del NLB.

Durante las pruebas iniciales, `AppTestCidr` permite acceder directamente desde
tu computador. En la arquitectura final, las peticiones deberían pasar por el
NLB y no directamente por las IPs públicas de las MVs app.

---

## 17. Conectar el frontend cuando esté listo

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

Después, en ambas MVs app:

```bash
cd /home/ubuntu/cloudshop/Backend
```

La conexión del frontend no cambia:

- Las imágenes Docker.
- Las tablas.
- Los volúmenes.
- La conexión app ↔ BD.
- Los usuarios de MySQL/PostgreSQL.

Solo agrega una URL autorizada en CORS y cambia la URL pública que usa React.

---

## 18. Comandos para actualizar una imagen

Cuando cambie el código:

### En App 1

```bash
cd /home/ubuntu/cloudshop
cd Backend
```

### En App 1 y App 2

```bash
cd /home/ubuntu/cloudshop/Backend
```

La base de datos no se vuelve a crear y los volúmenes no se eliminan.

---

## 19. Problemas comunes

### `unauthorized` al hacer push

```bash
docker login -u maxwellcs07
docker compose push
```

Verifica que el nombre sea exactamente:

```text
maxwellcs07/cloudshop-usuarios
maxwellcs07/cloudshop-catalogo
```

### `connection refused` a PostgreSQL o MySQL

Verifica en la MV BD:

```bash
docker ps
docker logs mysql_c
docker logs postgres_c
```

Verifica desde la MV app:

```bash
nc -vz DATABASE_PRIVATE_IP 3306
nc -vz DATABASE_PRIVATE_IP 5432
```

Si falla:

1. Revisa que el contenedor esté activo.
2. Revisa el puerto publicado con `docker ps`.
3. Revisa que la app tenga `sg-app`.
4. Revisa que la BD tenga las reglas desde `sg-app`.
5. Revisa que `DATABASE_PRIVATE_IP` sea correcta.

### `usuarios` se reinicia

```bash
docker compose logs -f usuarios
```

Las causas más comunes son:

- `DATABASE_URL` incorrecta.
- PostgreSQL apagado.
- Contraseña incorrecta.
- Puerto 5432 bloqueado.

### `catalogo` muestra `DISCONNECTED`

```bash
docker compose logs -f catalogo
```

Revisa `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` y el
puerto 3306.

### La MV de ingesta puede conectarse pero no escribir

Eso es lo esperado. El usuario `ingesta_mysql` y `ingesta_pg` deben tener solo
permisos `SELECT`.

---

## 20. Checklist final

- [ ] Se creó el stack `cloudshop-completo`.
- [ ] Existen App 1, App 2, BD e Ingesta.
- [ ] App 1 y App 2 tienen el mismo `sg-app`.
- [ ] BD tiene `sg-bd`.
- [ ] Ingesta tiene `sg-ingesta`.
- [ ] BD permite 3306/5432 solo desde `sg-app` y `sg-ingesta`.
- [ ] MySQL y PostgreSQL tienen volúmenes persistentes.
- [ ] Las imágenes fueron construidas y publicadas desde App 1.
- [ ] App 1 y App 2 descargaron las imágenes desde Docker Hub.
- [ ] `DATABASE_URL` usa la IP privada de la BD.
- [ ] `MYSQL_HOST` usa la IP privada de la BD.
- [ ] `curl localhost:8000/health` responde correctamente.
- [ ] `curl localhost:8080/health` muestra `CONNECTED`.
- [ ] Los datos de catálogo fueron cargados en MySQL.
- [ ] Los usuarios y direcciones fueron cargados en PostgreSQL.
- [ ] Ingesta usa usuarios de solo lectura.
- [ ] NLB y API Gateway se configurarán después.
- [ ] Amplify usará la URL de API Gateway cuando el frontend esté listo.
