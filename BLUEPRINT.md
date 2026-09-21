# CloudShop — Blueprint de Arquitectura (Despliegue Manual)

> Documento guía único para construir toda la infraestructura de CloudShop de forma **manual** (consola AWS / CLI), en reemplazo de `infrastructure/cloudformation.yaml`.
>
> Cada recurso, máquina virtual, puerto, bucket y credencial queda definido aquí. Cualquier cosa que se construya debe ceñirse a este blueprint.

---

## 1. Resumen ejecutivo

CloudShop es un e-commerce con arquitectura de microservicios sobre AWS. Se compone de:

- **5 microservicios** en Docker (3 lenguajes, 2 BD SQL + 1 NoSQL, 1 sin BD, 1 analítico) — **los 5 implementados**.
- **Roles de usuario** (`usuario` / `admin`) vía un claim `rol` en el mismo JWT que emite MS1; MS2/MS3/MS4/MS5 lo verifican sin consultar la base de usuarios (ver §5.7).
- **4 máquinas virtuales EC2**: 2 de producción (app), 1 de datos y 1 de ingesta.
- **1 VPC** con una subred pública y un Internet Gateway (sin NAT).
- **1 ALB** (Application Load Balancer) en el puerto 80 que reparte el tráfico HTTP entre las 2 MV de aplicación.
- **2 buckets S3**: uno privado (data lake para Glue + Athena) y uno público (imágenes del catálogo de productos).
- **Catálogo centralizado de APIs** con `swaggerapi/swagger-ui` (definiciones OpenAPI de MS1–MS5).
- **Frontend React SPA** desplegado en **AWS Amplify**.

> **Aislamiento de datos por Security Groups (sin NAT):** no hay subred privada estricta ni NAT Gateway. La MV de datos se protege exclusivamente mediante su Security Group, que solo acepta los puertos de base de datos (3306/5432/27017) desde los Security Groups de las MV de aplicación e ingesta.

### Diagrama de arquitectura

```text
                        ┌─────────────────────────────────────────────┐
   Usuarios finales ──► │  AWS Amplify (React SPA)                    │
                        └───────────────────┬─────────────────────────┘
                                            │ HTTP
                                  ┌─────────▼─────────┐
                                  │   ALB (:80)        │  Application Load Balancer
                                  │  path-based rules  │  /usuarios/* /api/catalogo/* /ventas/* /ordenes/* /analitica/*
                                  └────┬────────┬──────┘
                                       │        │
                        ┌──────────────▼──┐   ┌──▼──────────────┐
                        │ MV app 1 (EC2)  │   │ MV app 2 (EC2)  │
                        │ Docker Compose  │   │ Docker Compose  │
                        │  5 microservicios│  │  (réplica)      │
                        │  + swagger-ui   │   │                 │
                        │  8000/8080/8001 │   │                 │
                        │  8002/8003/8081 │   │                 │
                        └───────┬─────────┘   └─────────────────┘
                                │ (solo lectura)
                        ┌───────▼──────────────────────────┐
                        │ MV datos (EC2)                   │
                        │  · MySQL 8.4      :3306          │
                        │  · PostgreSQL 16  :5432          │
                        │  · MongoDB        :27017         │
                        │  (aislada por Security Group)    │
                        └───────┬──────────────────────────┘
                                │ (pull, solo lectura)
                        ┌───────▼──────────────────────────┐
                        │ MV ingesta (3 contenedores Python)│
                        └───────┬──────────────────────────┘
                                │ put_object (boto3)
                        ┌───────▼──────┐      ┌─────────┐
                        │ Bucket S3    │ ───► │  Glue   │
                        │ (data lake,  │      └────┬────┘
                        │  privado)    │      ┌────▼─────┐
                        └──────────────┘      │  Athena  │
                                              └────┬─────┘
                                                   │
                                        Microservicio Analítico (MS5)
                        ┌──────────────┐
                        │ Bucket S3    │ ◄── aws s3 sync (mv-ingesta)
                        │ (imágenes,   │
                        │  público)    │
                        └──────┬───────┘
                               │ imagen_url en MySQL → Frontend (<img src>)
```

---

## 2. Red (VPC)

| Recurso | Nombre | Valor |
|---|---|---|
| VPC | `cloudshop-vpc` | `10.0.0.0/16` |
| Subred pública | `cloudshop-subnet-publica` | `10.0.1.0/24` (AZ `a`) |
| Internet Gateway | `cloudshop-igw` | adjunto a la VPC |
| Tabla de ruteo pública | `cloudshop-rt-publica` | `0.0.0.0/0 → IGW` (asociada a la subred pública) |

> **Sin NAT Gateway, sin subred privada.** Todas las VMs viven en la subred pública (asignación automática de IP pública = sí), porque todas necesitan salida a internet (p. ej. `docker pull` desde Docker Hub). El aislamiento de las bases de datos es responsabilidad exclusiva de los Security Groups (§4).

### IPs privadas fijas

| Host | IP privada |
|---|---|
| `cloudshop-mv-datos` | `10.0.1.10` |
| `cloudshop-mv-app-1` | `10.0.1.11` |
| `cloudshop-mv-app-2` | `10.0.1.12` |
| `cloudshop-mv-ingesta` | `10.0.1.20` |

---

## 3. Máquinas virtuales (EC2)

Todas: **Ubuntu 22.04 LTS (x86_64)**, tipo **t3.micro**, EBS **gp3 20 GB** (root), key pair **`vockey`** (AWS Academy).

| Nombre | IP privada | IAM Instance Profile | Levanta |
|---|---|---|---|
| `cloudshop-mv-app-1` | 10.0.1.11 | — | `Backend/docker-compose.yml` (5 microservicios + swagger-ui) |
| `cloudshop-mv-app-2` | 10.0.1.12 | — | `Backend/docker-compose.yml` (réplica) |
| `cloudshop-mv-datos` | 10.0.1.10 | — | `Backend/docker-compose.datos.yml` + MongoDB |
| `cloudshop-mv-ingesta` | 10.0.1.20 | `LabInstanceProfile` | `Ingesta/docker-compose.yml` |

### Bootstrapping común (todas las VMs)

```bash
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh && sudo sh /tmp/get-docker.sh
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
git clone --depth 1 https://github.com/rvcuba-utec/CloudComputing-Project.git /home/ubuntu/cloudshop
sudo chown -R ubuntu:ubuntu /home/ubuntu/cloudshop
```

---

## 4. Security Groups y matriz de puertos

| SG | Nombre | Protege |
|---|---|---|
| App | `cloudshop-sg-app` | MV de aplicación |
| BD | `cloudshop-sg-bd` | MV de datos |
| Ingesta | `cloudshop-sg-ingesta` | MV de ingesta |
| ALB | `cloudshop-sg-alb` | Application Load Balancer |

### Reglas de entrada (ingress)

| SG | Puerto(s) | Protocolo | Origen |
|---|---|---|---|
| `sg-app` | 22 | TCP | Tu IP pública (CIDR) |
| `sg-app` | 8080, 8000, 8001, 8002, 8003 | TCP | `sg-alb` |
| `sg-app` | 8081 | TCP | Tu IP pública (CIDR) — swagger-ui |
| `sg-bd` | 22 | TCP | `sg-app` |
| `sg-bd` | 3306, 5432, 27017 | TCP | `sg-app` |
| `sg-bd` | 3306, 5432, 27017 | TCP | `sg-ingesta` |
| `sg-ingesta` | 22 | TCP | Tu IP pública (CIDR) |
| `sg-alb` | 80 | TCP | `0.0.0.0/0` |

> **Regla de oro:** los puertos de base de datos (3306/5432/27017) **nunca** se abren a `0.0.0.0/0`. Solo aceptan tráfico desde `sg-app` y `sg-ingesta`. Este SG es el único mecanismo de aislamiento de la MV de datos (no hay subred privada).

---

## 5. Microservicios

Todos corren en las dos MV de aplicación con el mismo `Backend/docker-compose.yml` (idéntico en ambas). En producción se **descargan las imágenes de Docker Hub** (no se compila en el servidor): ver §5.6.

| # | Servicio | Lenguaje/Framework | Base de datos | Puerto | Carpeta | Estado |
|---|---|---|---|---|---|---|
| 1 | Usuarios y Direcciones | Python / FastAPI | PostgreSQL | **8000** | `Backend/users-address/` | ✅ implementado (+ roles) |
| 2 | Catálogo e Inventario | Go / Gin | MySQL | **8080** | `Backend/products/` | ✅ implementado (+ admin CRUD) |
| 3 | Ventas y Reseñas | **Node.js / Express** (no NestJS — decisión del equipo: mismo lenguaje, menos boilerplate) | MongoDB | **8002** | `Backend/ventas-resenas/` | ✅ implementado |
| 4 | Órdenes (orquestador) | Python / FastAPI | — (sin BD) | **8003** | `Backend/ordenes/` | ✅ implementado |
| 5 | Analítica | Python / FastAPI | Athena | **8001** | `Backend/analitica/` | ✅ implementado (requiere S3+Glue poblados) |

> **MS3 en Express, no NestJS:** el blueprint original pedía NestJS; se optó por Express + Mongoose por ser más liviano y no afectar el despliegue (sigue siendo Node.js, mismas rutas REST). Documentado aquí para que quien lea el blueprint no espere módulos/decoradores de Nest en el código.

### 5.1 MS1 Usuarios (Python + PostgreSQL, :8000)

Base `cloudshop_usuarios`. Tablas: `usuarios` (20,000, columna `rol` agregada), `direcciones_envio` (20,000). JWT HS256 (60 min), payload `{sub, rol, exp}`.

```http
GET  /health
POST /usuarios/auth/register                  # rol="admin" si el email está en ADMIN_EMAILS, si no "usuario"
POST /usuarios/auth/login
GET  /usuarios/me
GET  /usuarios                                # admin only — lista paginada de usuarios
GET  /usuarios/{id}                           # dueño o admin
PATCH /usuarios/{id}                          # dueño o admin (nombre/estado)
PATCH /usuarios/{id}/rol                      # admin only — promueve/degrada a otro usuario
GET  /usuarios/{id}/direcciones
POST /usuarios/{id}/direcciones
PATCH /usuarios/{id}/direcciones/{dir_id}
DELETE /usuarios/{id}/direcciones/{dir_id}
```

- Dockerfile: `Backend/users-address/Dockerfile` (uvicorn `:8000`).
- Swagger nativo: `/docs` (además existe el catálogo centralizado de §11).
- Contraseñas Faker: `usuario` + id con 5 dígitos (ej. id 42 → `usuario00042`).
- Bootstrap de administradores: variable `ADMIN_EMAILS` (coma-separado); cualquier registro con ese email nace con `rol=admin`.

### 5.2 MS2 Catálogo e Inventario (Go + MySQL, :8080)

Base `cloudshop_catalogo`. Tablas: `categorias` (50), `productos` (5,699), `inventario` (5,699), `movimientos_stock` (25,000).

```http
GET  /health
GET  /api/catalogo/categorias
GET  /api/catalogo/productos                  # ?page &limit &categoria_id &q &precio_min &precio_max &solo_activos
GET  /api/catalogo/productos/{id}
GET  /api/catalogo/productos/{id}/movimientos
POST /api/catalogo/inventario/reservar        # requiere sesión — { producto_id, cantidad } → SELECT FOR UPDATE
POST /api/catalogo/inventario/liberar         # requiere sesión
POST /api/catalogo/inventario/confirmar-venta # requiere sesión
POST /api/catalogo/productos                  # admin only
PATCH /api/catalogo/productos/{id}            # admin only
DELETE /api/catalogo/productos/{id}           # admin only — borrado lógico (activo=0)
POST /api/catalogo/categorias                 # admin only
PATCH /api/catalogo/categorias/{id}           # admin only
DELETE /api/catalogo/categorias/{id}          # admin only — 409 si hay productos asignados
```

- Dockerfile: `Backend/products/Dockerfile` (multi-stage Go, `PORT`=8080).
- Verifica el JWT HS256 **a mano** con la librería estándar (`crypto/hmac`, sin dependencias nuevas en `go.mod`); ver `Backend/products/auth.go`. Requiere `JWT_SECRET` (mismo valor que MS1).

### 5.3 MS3 Ventas y Reseñas (Node.js + Express + Mongoose, :8002)

Base `cloudshop_ventas`. Colecciones: `ventas` (documento con `items[]` embebidos) y `resenas` (única por `producto_id`+`usuario_id`).

```http
GET   /health
POST  /ventas                                 # crea una venta; si no es admin, ignora usuario_id del body y usa el del token
GET   /ventas                                 # admin only — todas las ventas, paginado
GET   /ventas/{id}                            # dueño o admin
PATCH /ventas/{id}/estado                     # dueño o admin — usado por MS4 para mover pendiente→confirmada/fallida/cancelada
GET   /usuarios/{usuarioId}/ventas            # dueño o admin — historial de compras
GET   /productos/{productoId}/resenas         # público — lista + promedio de calificación
POST  /productos/{productoId}/resenas         # requiere sesión — una reseña por usuario y producto
```

- Verifica el mismo JWT HS256 de MS1 con la librería `jsonwebtoken` (`Backend/ventas-resenas/src/middleware/auth.js`). Requiere `JWT_SECRET` y `MONGO_URI`.
- Rutas alineadas 1:1 con las reglas de path del ALB (§10).

### 5.4 MS4 Órdenes (Python + FastAPI, sin BD propia, :8003)

Orquestador puro: la "orden" persistida es el documento `venta` que crea MS3; MS4 no guarda nada por su cuenta.

```http
GET  /health
POST /ordenes/previsualizar   # valida stock/precio contra MS2, sin reservar nada
POST /ordenes/confirmar       # reserva stock (MS2) → crea venta "pendiente" (MS3) → confirma stock (MS2) → marca "confirmada"
GET  /ordenes/{id}/estado     # proxy a GET MS3 /ventas/{id}
POST /ordenes/{id}/cancelar   # solo si la venta sigue "pendiente"; libera el stock reservado
```

- Reenvía siempre el header `Authorization` del usuario original a MS2/MS3 (sin "service account" separado).
- Compensación real: si falla una reserva a mitad de camino, libera las que sí se reservaron antes de responder 409.
- **Limitación reconocida:** MS2 no expone un endpoint de reingreso de stock, así que una venta ya `confirmada` no se puede cancelar (409 explicando el motivo) — solo se puede cancelar mientras sigue `pendiente`.
- Requiere `JWT_SECRET`, `CATALOGO_URL`, `VENTAS_URL`.

### 5.5 MS5 Analítica (Python + FastAPI + Athena, :8001)

Ejecuta consultas Athena y devuelve JSON. Usa `boto3` con las credenciales del IAM Role de la instancia (nunca claves en el código). Todas las rutas son **admin only**.

```http
GET /health                       # no depende de Athena (para no tumbar el healthcheck del ALB)
GET /health/athena                # opcional — valida credenciales AWS con sts:GetCallerIdentity
GET /analitica/ticket-promedio
GET /analitica/productos-mas-vendidos
GET /analitica/ventas-por-categoria
GET /analitica/ventas-por-ciudad
GET /analitica/calificacion-vs-ventas
GET /analitica/clientes-frecuentes
```

- SQL de cada endpoint: `Backend/analitica/app/routers/analitica.py`.
- Requiere `JWT_SECRET`, `AWS_REGION`, `ATHENA_DATABASE`, `ATHENA_WORKGROUP`, `ATHENA_OUTPUT_S3`. Sin `ATHENA_OUTPUT_S3` responde `503` (no inventa datos).
- **Dependencia real:** solo devuelve filas si S3 + Glue (§9) ya están poblados con `ordenes/ordenes.json`, `detalle_ordenes/detalle_ordenes.csv` y `resenas/resenas.json` — hoy esos 3 archivos se generan con `Data/scripts/src/scripts/faker_ventas_resenas.py` mas **deben subirse a S3 a mano** (`ingesta-ventas` sigue pendiente, ver §8).

### 5.6 Imágenes Docker (build → push → pull)

No se compila código en las MV de producción. Flujo recomendado por el taller:

```bash
# En la máquina de desarrollo (o en la MV de ingesta/desarrollo):
cd Backend
docker compose build                       # construye las 5 imágenes localmente
docker compose push                        # las sube a repositorios de Docker Hub
                                           # (requiere `image:` con tu usuario en el compose)

# En cada MV de producción (app-1 y app-2):
docker compose pull                        # descarga las imágenes
docker compose up -d                       # levanta los contenedores
```

- Las imágenes se alojan en Docker Hub con tags como `usuario/cloudshop-catalogo:latest`, `usuario/cloudshop-usuarios:latest`, etc. — `Backend/docker-compose.yml` ya declara `image: ${DOCKERHUB_USER}/cloudshop-<servicio>:latest` en cada servicio (junto a su `build:`), así que `docker compose build && docker compose push` en un solo comando arma y sube las 5 imágenes.
- El compose es el mismo archivo en dev y producción: en dev se usa `docker compose up -d --build`; en producción, `docker compose pull && docker compose up -d` (sin `--build`, así nunca compila en la VM de app).

### 5.7 Roles de usuario (`usuario` / `admin`)

No es un microservicio aparte: es un claim `rol` dentro del mismo JWT HS256 que ya emite MS1, verificado de forma independiente por cada lenguaje (Python, Go, Node) sin que MS2/MS3/MS4/MS5 necesiten consultar la base de usuarios.

| Servicio | Cómo verifica el rol |
|---|---|
| MS1 (Python) | `python-jose` decodifica el JWT; dependencia `require_admin` en FastAPI |
| MS2 (Go) | Verificación manual HS256 con la librería estándar (`Backend/products/auth.go`), sin dependencias nuevas |
| MS3 (Node) | `jsonwebtoken` (`Backend/ventas-resenas/src/middleware/auth.js`) |
| MS4/MS5 (Python) | Igual que MS1 pero sin consulta a base de datos (no tienen una) |

**Bootstrap de administradores:** variable de entorno `ADMIN_EMAILS` en MS1 (coma-separado). No hace falta tocar la base de datos a mano: cualquier registro con un email de esa lista nace con `rol=admin`. Un admin ya existente puede promover a otros con `PATCH /usuarios/{id}/rol`.

**Qué puede hacer un admin que un usuario normal no puede:**
- Crear/editar/desactivar productos y categorías (MS2).
- Ver y cambiar el rol/estado de cualquier usuario (MS1).
- Ver todas las ventas del sistema, no solo las propias (MS3).
- Consultar los 6 endpoints de analítica (MS5, admin-only en su totalidad).

---

## 6. Bases de datos (MV de datos)

Se montan con **contenedores Docker**, una **red Docker propia `red_bd`** y **volúmenes nombrados** para persistencia.

| Motor | Contenedor | Puerto | Base | Usuario app | Usuario solo lectura (ingesta) |
|---|---|---|---|---|---|
| MySQL 8.4 | `cloudshop-mysql` | 3306 | `cloudshop_catalogo` | `cloud_user` | `ingesta_my` |
| PostgreSQL 16 | `cloudshop-postgres` | 5432 | `cloudshop_usuarios` | `cloud_user` | `ingesta_pg` |
| MongoDB | `cloudshop-mongo` | 27017 | `cloudshop_ventas` | sin auth (aislado por SG) | `ingesta_mongo` *(pendiente)* |

- Esquema SQL inicial: `Backend/products/init.sql` (MySQL) y `Backend/postgres-init/01_esquema.sql` (PostgreSQL, incluye la columna `rol`), montados en `docker-compose.datos.yml`. MongoDB no necesita esquema previo (Mongoose lo crea al primer insert).
- Volúmenes: `mysql_data`, `pg_data`, `mongo_data`.
- MongoDB corre en la misma MV de datos, ya agregada a `docker-compose.datos.yml`.
- Carga de datos: `Data/scripts/src/scripts/load_csv_bd.py` (CSVs → MySQL/PostgreSQL, JSON+CSV → MongoDB). El generador de ventas/reseñas es `Data/scripts/src/scripts/faker_ventas_resenas.py` (ver `Data/scripts/README.md`); garantiza `orden_id` único globalmente (compatible con `ObjectId` de Mongo) y reseñas únicas por `(producto_id, usuario_id)`.

> La MV de datos tiene IP pública solo para salida a internet (`docker pull`); su protección de entrada depende 100 % de `cloudshop-sg-bd`.

---

## 7. Buckets S3

### 7a. Bucket de datos (data lake, privado)

- **Nombre:** `cloudshop-data-lake-2026-utec-mr-cs2032-v2`
- **Acceso:** solo vía IAM Role de la MV de ingesta (`LabInstanceProfile`); no público.

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
├── resenas/resenas.json
└── athena-results/   (resultados de Athena)
```

> **Un prefijo por tabla, sin excepción.** Athena/Glue definen una tabla a partir de todos los objetos bajo un mismo prefijo; si dos archivos con columnas distintas compartieran carpeta, Athena mezclaría sus columnas en una sola tabla. Por eso cada archivo tiene su propia carpeta al mismo nivel (no agrupadas por microservicio de origen como en una versión anterior de este documento).

### 7b. Bucket de imágenes (assets estáticos, público)

- **Nombre:** `cloudshop-imagenes-TU-USUARIO-2026` (único globalmente — usa tu usuario).
- **Acceso:** público de lectura (`s3:GetObject` para `Principal: "*"`). El frontend carga las imágenes directamente desde S3 sin pasar por el backend.
- **Carga:** desde `cloudshop-mv-ingesta` (tiene `LabInstanceProfile`) con `aws s3 sync`.

```text
s3://cloudshop-imagenes-TU-USUARIO-2026/
└── imagenes/
    ├── 00191_CELULAR_A5_4RAM_128GB.jpg
    ├── 00115_CELULAR_A7_3RAM_Y_64GB.jpg
    └── ...  (5.134 JPGs del scraping de Falabella)
```

**Bucket policy** (permite lectura pública de solo los objetos, no el listado):

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

**Cómo se integra con el catálogo:**

`Data/scripts/src/scripts/build_catalogo.py` lee la variable de entorno `IMAGES_S3_BASE_URL` y genera `imagen_url` como URL absoluta de S3:

```bash
IMAGES_S3_BASE_URL=https://cloudshop-imagenes-TU-USUARIO-2026.s3.amazonaws.com \
  uv run python -m scripts.build_catalogo
# imagen_url resultante: https://cloudshop-imagenes-TU-USUARIO-2026.s3.amazonaws.com/imagenes/00191_....jpg
```

Sin esa variable, `imagen_url` queda como ruta relativa local (`imagenes/...`), lo que no funciona en producción. **Siempre define `IMAGES_S3_BASE_URL` antes de regenerar el catálogo y recargar MySQL.**

---

## 8. Ingesta (MV de ingesta)

Tres contenedores Python con `boto3`, estrategia **pull del 100 %**, credenciales de solo lectura, sin claves AWS en el código (usa el IAM Role).

| Contenedor | Fuente | Tablas/colecciones | Archivos en S3 |
|---|---|---|---|
| `ingesta-usuarios` | PostgreSQL | `usuarios`, `direcciones_envio` | `usuarios/*.csv` |
| `ingesta-catalogo` | MySQL | `categorias`, `productos`, `inventario`, `movimientos_stock` | `categorias/`, `productos/`, `inventario/`, `movimientos_stock/` |
| `ingesta-ventas` *(pendiente)* | MongoDB | `ordenes`, `resenas` | `ordenes/ordenes.json`, `detalle_ordenes/detalle_ordenes.csv`, `resenas/resenas.json` |

```bash
cd /home/ubuntu/cloudshop/Ingesta
cp ingesta-usuarios/.env.example ingesta-usuarios/.env
cp ingesta-catalogo/.env.example ingesta-catalogo/.env
nano ingesta-usuarios/.env   # POSTGRES_HOST=10.0.1.10
nano ingesta-catalogo/.env   # MYSQL_HOST=10.0.1.10
docker compose up --build
```

---

## 9. Glue, Athena y MS5

### Catálogo Glue (1 tabla por archivo)

| Tabla | Archivo S3 |
|---|---|
| `usuarios` | `usuarios/usuarios.csv` |
| `direcciones_envio` | `direcciones_envio/direcciones_envio.csv` |
| `categorias` | `categorias/categorias.csv` |
| `productos` | `productos/productos.csv` |
| `inventario` | `inventario/inventario.csv` |
| `movimientos_stock` | `movimientos_stock/movimientos_stock.csv` |
| `ordenes` | `ordenes/ordenes.json` |
| `detalle_ordenes` | `detalle_ordenes/detalle_ordenes.csv` |
| `resenas` | `resenas/resenas.json` |

Base de datos Glue: `cloudshop_analytics`.

**Contrato de datos:** `usuario_id`/`producto_id`/`categoria_id` (`BIGINT`) consistentes entre motores; `orden_id` (`VARCHAR`); fechas ISO 8601.

### Athena (6 consultas + 2 vistas)

Las 6 consultas que expone MS5 (§5.5) + 2 vistas (`vw_detalle_ventas`, `vw_valor_cliente`) que las simplifican. SQL de referencia completo, ya adaptado a los nombres de columna reales (no al documento de sustentación original, que asumía un esquema ligeramente distinto): `DESPLIEGUE_AWS_MANUAL.md` §9, y las consultas ejecutables en `Backend/analitica/app/routers/analitica.py`.

> Las tablas se registran en Glue **creándolas desde el editor de consultas de Athena** (`CREATE EXTERNAL TABLE`), no con un Crawler — es más determinístico para CSV con comillas/comas embebidas (usa `OpenCSVSerde`) y para el NDJSON de ventas/reseñas (usa `JsonSerDe`). DDL exacto en `DESPLIEGUE_AWS_MANUAL.md` §8.

---

## 10. Application Load Balancer (ALB)

- **ALB** (`cloudshop-alb`, SG `cloudshop-sg-alb`): un único listener **HTTP en el puerto 80**, con **reglas de enrutamiento por path** hacia 5 target groups (uno por microservicio).

### Target Groups

| Target Group | Puerto en la instancia | Health check |
|---|---|---|
| `cloudshop-tg-usuarios` | 8000 | `/health` |
| `cloudshop-tg-catalogo` | 8080 | `/health` |
| `cloudshop-tg-analitica` | 8001 | `/health` |
| `cloudshop-tg-ventas` | 8002 | `/health` |
| `cloudshop-tg-ordenes` | 8003 | `/health` |

Cada target group registra **ambas** MV de aplicación (`cloudshop-mv-app-1` y `cloudshop-mv-app-2`).

### Reglas de enrutamiento (listener :80)

| Prioridad | Path pattern | Target Group |
|---|---|---|
| 1 | `/usuarios/*/ventas` | `tg-ventas` (MS3) |
| 2 | `/productos/*/resenas` | `tg-ventas` (MS3) |
| 3 | `/usuarios/*` | `tg-usuarios` (MS1) |
| 4 | `/api/catalogo/*` | `tg-catalogo` (MS2) |
| 5 | `/ventas/*` | `tg-ventas` (MS3) |
| 6 | `/ordenes/*` | `tg-ordenes` (MS4) |
| 7 | `/analitica/*` | `tg-analitica` (MS5) |

> Las reglas se evalúan por prioridad: las más específicas (que terminan en `/ventas` o `/resenas`) van antes que las genéricas (`/usuarios/*`) para no capturar rutas de MS3 dentro de MS1.

El frontend consume el **DNS del ALB** como única base URL (ej. `http://cloudshop-alb-1234.region.elb.amazonaws.com`). CORS habilitado en cada servicio para el origen de Amplify (`https://*.amplifyapp.com`) y `http://localhost:5173`.

---

## 11. Catálogo centralizado de APIs (Swagger UI)

> ⏳ **Pendiente:** los 5 archivos `docs/openapi/*.yaml` todavía no existen en el repo. Esta sección describe el diseño; el contenedor `swagger-ui` no se puede levantar hasta escribirlos (o se levanta vacío/con error de `SWAGGER_JSON_URL`). Cada servicio sí expone su propio Swagger nativo ya funcional donde aplica (FastAPI en `/docs` para MS1/MS4/MS5).

Contenedor `swaggerapi/swagger-ui` que monta, en modo solo lectura, un volumen con las definiciones **OpenAPI (YAML)** de los 5 microservicios, para que todo el equipo consulte los contratos en un solo lugar.

```text
docs/openapi/
├── ms1-usuarios.yaml
├── ms2-catalogo.yaml
├── ms3-ventas.yaml
├── ms4-ordenes.yaml
└── ms5-analitica.yaml
```

Servicio en el compose de aplicación (puerto **8081**):

```yaml
services:
  swagger-ui:
    image: swaggerapi/swagger-ui
    container_name: cloudshop-swagger-ui
    ports:
      - "8081:8080"
    environment:
      URLS: >-
        [
          {"name": "MS1 Usuarios",   "url": "/specs/ms1-usuarios.yaml"},
          {"name": "MS2 Catálogo",   "url": "/specs/ms2-catalogo.yaml"},
          {"name": "MS3 Ventas",     "url": "/specs/ms3-ventas.yaml"},
          {"name": "MS4 Órdenes",    "url": "/specs/ms4-ordenes.yaml"},
          {"name": "MS5 Analítica",  "url": "/specs/ms5-analitica.yaml"}
        ]
      SWAGGER_JSON_URL: /specs/ms1-usuarios.yaml
    volumes:
      - ./docs/openapi:/usr/share/nginx/html/specs:ro
```

- Acceso: `http://<IP-de-la-VM-app>:8081` (o vía ALB si se agrega una regla `/swagger/*`).
- Cada servicio mantiene además su Swagger nativo (FastAPI en `/docs`).

---

## 12. Frontend (AWS Amplify)

- SPA **React + Vite** (`Frontend/frontend/`). Despliegue con `Frontend/amplify.yml` (appRoot `frontend`, `npm ci` + `npm run build`, artefactos `dist`).
- Reescritura SPA: `Frontend/frontend/amplify-rewrites.json` (200 → `/index.html`).

Variables de build en Amplify:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://cloudshop-alb-1234.region.elb.amazonaws.com
```

El frontend consume los 5 microservicios (≥2 métodos REST de cada uno):
- Panel `/admin` (solo visible/accesible con `rol=admin`): pestañas Productos, Categorías, Usuarios, Órdenes — CRUD contra MS1/MS2, lectura contra MS3.
- Flujo de compra real en la ficha de producto: cantidad → `POST /ordenes/confirmar` (MS4) → stock actualizado.
- Reseñas: lectura pública + publicación para usuarios autenticados (MS3).
- "Mis compras" en el perfil: `GET /usuarios/{id}/ventas` (MS3).
- Modo demo (`VITE_USE_MOCKS=true`, valor por defecto) simula los 5 servicios en memoria del navegador, sin backend — útil para Amplify si el ALB aún no está listo.

---

## 13. Variables de entorno y despliegue manual

### 13.1 Credenciales (no versionar)

| Variable | Dónde se usa | Nota |
|---|---|---|
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | MV datos + MV app + loader | MySQL |
| `PG_PASSWORD` | MV datos + MV app + loader | PostgreSQL |
| `MONGO_URI` | MV app (MS3) + loader | incluye el nombre de la BD al final (`.../cloudshop_ventas`) |
| `JWT_SECRET` | MV app (MS1 lo emite; MS2/MS3/MS4/MS5 lo verifican) | mismo valor en los 5 servicios |
| `ADMIN_EMAILS` | MV app (MS1) | coma-separado; bootstrap de administradores |
| `CORS_ORIGINS` | MV app (los 5 servicios) | Amplify + `localhost:5173` |
| `DOCKERHUB_USER` | máquina de build (`docker compose build/push`) + MV app-1/app-2 (`docker compose pull`) | tu usuario de Docker Hub |
| `AWS_REGION`, `ATHENA_DATABASE`, `ATHENA_WORKGROUP`, `ATHENA_OUTPUT_S3` | MV app (MS5) | ver §9 |
| `IMAGES_S3_BASE_URL` | scripts de datos (`build_catalogo.py`) | URL base del bucket de imágenes, ej. `https://cloudshop-imagenes-TU-USUARIO-2026.s3.amazonaws.com`; sin este valor `imagen_url` queda como ruta local (no funciona en prod) |
| `ingesta_my` / `ingesta_pg` | MV datos (init) + MV ingesta | solo lectura |

### 13.2 Orden de construcción

1. **Red**: VPC + subred pública + IGW + tabla de ruteo.
2. **Security Groups**: `sg-app`, `sg-bd`, `sg-ingesta`, `sg-alb` (según §4).
3. **MV datos**: instalar Docker, clonar repo, crear `.env`, `docker compose -f docker-compose.datos.yml up -d` (MySQL + PostgreSQL + MongoDB).
4. **Bucket de imágenes (§7b)**: crear bucket público en S3, subir los 5.134 JPGs desde `cloudshop-mv-ingesta` con `aws s3 sync`, anotar la URL base (`IMAGES_S3_BASE_URL`).
5. **Carga de datos**: en `Data/scripts` — exportar `IMAGES_S3_BASE_URL`, regenerar `productos.csv` con `build_catalogo.py`, luego `faker_ventas_resenas.py` y `load_csv_bd.py` (CSVs/JSON → MySQL + PostgreSQL + MongoDB).
6. **MV ingesta**: configurar `.env` de `ingesta-usuarios`/`ingesta-catalogo`, `docker compose up --build` (`ingesta-ventas` sigue pendiente: subir los 3 archivos de ventas/reseñas a S3 a mano por ahora).
7. **Imágenes Docker**: `docker compose build` + `docker login` + `docker compose push` (Docker Hub) con `DOCKERHUB_USER` definido.
8. **MV app-1 y app-2**: clonar repo, `.env` apuntando a `10.0.1.10` (incluye `JWT_SECRET`, `ADMIN_EMAILS`, `MONGO_URI`, `ATHENA_*`), `docker compose pull` + `docker compose up -d`.
9. **ALB**: crear ALB + 5 target groups (registrar app-1 y app-2) + listener :80 con reglas por path.
10. **S3 data lake + Glue + Athena**: bucket privado, tablas vía `CREATE EXTERNAL TABLE` en Athena, 6 queries, 2 vistas.
11. **Swagger UI**: pendiente hasta escribir `docs/openapi/*.yaml` (§11).
12. **Amplify** (frontend) apuntando al DNS del ALB.

> Guía **paso a paso, 100% consola de AWS Academy** (sin AWS CLI/PowerShell) para los pasos 1–9 y 11: `DESPLIEGUE_AWS_MANUAL.md`.
>
> Verificación por servicio: `curl http://localhost:<puerto>/health` en cada VM (8080, 8000, 8001, 8002, 8003).

---

## 14. Checklist de evidencias (rúbrica)

- [ ] `docker ps` en app-1 y app-2 mostrando los 5 microservicios (mismo `docker-compose.yml`).
- [ ] Health checks del ALB en verde (target groups `healthy`).
- [ ] URL pública del ALB (`http://...elb.amazonaws.com`) respondiendo por path.
- [ ] Roles funcionando: un usuario normal recibe 403 en `POST /api/catalogo/productos`; un admin (vía `ADMIN_EMAILS`) puede crear/editar/desactivar productos y categorías, y promover a otro usuario con `PATCH /usuarios/{id}/rol`.
- [ ] Catálogo centralizado `swagger-ui` mostrando MS1–MS5 (definiciones OpenAPI en YAML) — **pendiente**, ver §11.
- [ ] ≥20,000 registros por motor: `usuarios` (20k), `movimientos_stock` (25k), `ordenes`/`resenas` (≥12k cada uno, ver `Data/scripts/README.md`).
- [ ] Security Groups prueban que las bases son privadas (puertos 3306/5432/27017 solo desde `sg-app`/`sg-ingesta`).
- [ ] URL pública de Amplify consumiendo las 5 APIs (≥2 métodos REST por servicio), incluyendo el panel `/admin`.
- [ ] Flujo de compra completo: login → catálogo → detalle → reservar/confirmar (MS4) → venta visible en "Mis compras" (MS3) → reseña (MS3).
- [ ] MV ingesta: `ingesta-usuarios` e `ingesta-catalogo` corriendo, archivos en S3, logs con conteo de filas (`ingesta-ventas` es un gap conocido — archivos subidos a mano mientras tanto).
- [ ] Glue: 1 tabla por archivo (9 tablas); Athena: 6 consultas (las de MS5) + 2 vistas.
- [ ] Diagrama de arquitectura en draw.io (Backend + Frontend + Data Science).
