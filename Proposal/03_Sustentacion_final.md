# Sustentación Final CloudShop

Documento que consolida lo **implementado** en los microservicios de Catálogo (Go + MySQL) y Usuarios (Python + PostgreSQL), la estrategia de datos que ya produjo los CSVs definitivos, y el roadmap de lo que sigue.

---

## 1. Resumen ejecutivo

CloudShop es un e-commerce con arquitectura de microservicios sobre AWS. Este documento describe el estado final de los dos microservicios operacionales implementados:

- **Catálogo e Inventario** — Go + Gin + MySQL: 5,699 productos reales (scraping de Falabella), 50 categorías, inventario 1:1, movimientos de stock transaccionales.
- **Usuarios y Direcciones** — Python + FastAPI + PostgreSQL: 20,000 usuarios con JWT, perfiles y direcciones de envío.

Ambos se alimentan de un pipeline de datos local (scraping + Faker) que ya generó **más de 78,000 registros operacionales** listos para carga (ver `Backend/DESPLIEGUE.md`), superando con holgura el requisito de 20,000. La analítica (S3, Glue, Athena) consume estos mismos datos vía la **MV de ingesta** (`Ingesta/`), ya implementada para usuarios y catálogo. Todo el entorno (VPC, seguridad, las 4 MV, S3 e IAM) se despliega como código con **CloudFormation** (`infrastructure/cloudformation.yaml`); el paso a paso está en `DESPLIEGUE_AWS.md`.

---

## 2. Arquitectura general

```text
                        ┌─────────────────────────────────────────────┐
   Usuarios finales ──► │  AWS Amplify (frontend React SPA)           │
                        └───────────────────┬─────────────────────────┘
                                            │ HTTPS
                                  ┌─────────▼─────────┐
                                  │   API Gateway      │
                                  └─────────┬─────────┘
                                            │
                                  ┌─────────▼─────────┐
                                  │  NLB privado       │
                                  └────┬────────┬──────┘
                                       │        │
                        ┌──────────────▼──┐   ┌──▼──────────────┐
                        │ VM app 1 (EC2)  │   │ VM app 2 (EC2)  │
                        │ Docker Compose  │   │ Docker Compose  │
                        │  · catálogo (Go)│   │  (réplica)      │
                        │  · usuarios (Py)│   │                 │
                        └──────────────┬───┘   └─────────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │ VM datos (EC2, subred priv.) │
                        │  · MySQL (catálogo)         │
                        │  · PostgreSQL (usuarios)    │
                        └──────────────┬───────────────┘
                                       │ (pull, periódico)
                        ┌──────────────▼───────────────┐
                        │ MV ingesta (3 contenedores)  │
                        └──────┬────────────────┬──────┘
                               │                │
                     ┌─────────▼───┐      ┌─────▼──────┐
                     │ Bucket S3   │ ───► │ Glue       │
                     │ (CSV/JSON) │      │ (catálogo) │
                     └─────────────┘      └─────┬──────┘
                                               │
                                          ┌────▼─────┐
                                          │ Athena   │
                                          └────┬─────┘
                                               │
                                     Microservicio Analítico
```

Justificación de cada capa:

- **Amplify**: hosting gestionado para la SPA; despliegue continuo desde el repo.
- **API Gateway**: única entrada pública; valida, throttlea y enruta al NLB.
- **NLB privado**: las EC2 de app nunca se exponen a internet; el balanceo reparte carga y da tolerancia a fallos (si una VM cae, la otra sigue sirviendo).
- **VMs de app**: Docker Compose corre los microservicios de forma idéntica y reproducible en ambas VMs.
- **VM de datos separada**: las bases no comparten recursos con la app, pueden respaldarse y restringirse por security groups de forma independiente.
- **MV ingesta**: estrategia pull — la nube analítica nunca toca las BD operacionales.

---

## 3. Microservicio de Catálogo (Go + MySQL)

### 3.1 Por qué Go

- **I/O concurrente barato**: el catálogo es lectura intensiva; las goroutines y el pool de conexiones (`database/sql` con límites configurados) manejan muchos request concurrentes con poco footprint.
- **Binario único y liviano**: imagen Docker mínima, arranque instantáneo — ideal para contenedores en EC2.
- **Tipado estático sin framework pesado**: Gin aporta routing y binding; nada más. El servicio completo es un solo `main.go` transparente, fácil de sustentar.

### 3.2 Esquema final (MySQL · `cloudshop_catalogo`)

```text
categorias (50 filas reales del scraping)
  id, nombre, descripcion              [UNIQUE(nombre)]

productos (5,699 filas reales)
  id, categoria_id → FK categorias     [INDEX]
  sku                                   [UNIQUE]
  nombre (150), descripcion (TEXT)
  marca (80)                           ← brand_name del scraping
  imagen_url (512), origen_url (512)   ← local_image / link del scraping
  precio DECIMAL(12,2)                 ← [INDEX idx_productos_precio]
  precio_oferta DECIMAL(12,2) NULL     ← normal_price cuando indica descuento
  activo TINYINT(1) DEFAULT 1          ← [INDEX idx_productos_activo]

inventario (1:1 con productos)
  producto_id → FK productos (PK)
  stock_disponible, stock_reservado    [CHECK >= 0]

movimientos_stock (bitácora)
  id BIGINT, producto_id → FK, tipo ENUM(INGRESO|RESERVA|LIBERACION|VENTA_CONFIRMADA),
  cantidad [CHECK > 0], fecha          [INDEX producto_id, INDEX fecha]
```

Decisiones de esquema:

- **`precio` + `precio_oferta`**: el scraping trae 4 precios (CMR, internet, evento, normal). Se consolidan en `precio` = primer precio vigente disponible; `precio_oferta` guarda el "precio tachado" cuando difiere (4,886 productos tienen oferta).
- **`activo`**: permite retirar productos del catálogo sin borrarlos (soft delete) y con índice propio porque el listado público siempre filtra `activo = 1`.
- **`inventario` separado de `productos`**: las escrituras de stock (frecuentes y con `SELECT FOR UPDATE`) no bloquean las lecturas del catálogo.
- **`movimientos_stock`**: bitácora inmutable que audita cada operación y alimenta la ingesta analítica.

### 3.3 Endpoints finales

```http
GET  /health                                   # estado del servicio + ping MySQL

GET  /api/catalogo/categorias                  # 50 categorías (puebla el filtro del frontend)

GET  /api/catalogo/productos                   # paginado y filtrable:
     ?page=1&limit=20                          #   paginación (default 20, máx 100)
     ?categoria_id=3                           #   filtro por categoría
     ?q=logitech                              #   búsqueda en nombre y marca (LIKE)
     ?precio_min=100&precio_max=500            #   rango de precio (usa el índice)
     ?solo_activos=true                        #   oculta desactivados

GET  /api/catalogo/productos/{id}              # detalle
GET  /api/catalogo/productos/{id}/movimientos  # historial de stock (?limit=20)

POST /api/catalogo/inventario/reservar         # { producto_id, cantidad } → transaccional
POST /api/catalogo/inventario/liberar           #   SELECT FOR UPDATE + UPDATE + INSERT
POST /api/catalogo/inventario/confirmar-venta  #   movimiento, todo en una transacción
```

**Argumento de robustez para la sustentación:** las tres operaciones de stock se ejecutan dentro de una transacción con `SELECT ... FOR UPDATE` sobre la fila de inventario. Si dos compras simultáneas compiten por la última unidad, una espera; si el stock no alcanza, responde `409 STOCK_INSUFICIENTE` sin escribir nada. El movimiento queda siempre registrado, así que el stock es auditable y reconstruible.

---

## 4. Microservicio de Usuarios (Python + PostgreSQL)

### 4.1 Por qué Python

- **Velocidad de desarrollo**: FastAPI + SQLAlchemy + Pydantic dan validación, ORM y documentación OpenAPI automática; el CRUD completo del perfil cabe en pocos archivos.
- **Ecosistema de seguridad maduro**: `passlib/bcrypt` para hashes y `python-jose` para JWT son el estándar de la industria.
- **Contraste deliberado con Go**: usar dos lenguajes demuestra dominio — Go donde la concurrencia y el footprint importan (catálogo), Python donde la velocidad de desarrollo importa (usuarios).

### 4.2 Esquema final (PostgreSQL · `cloudshop_usuarios`)

```text
usuarios (20,000 filas Faker)
  id, nombre (120)
  email (180)                          [UNIQUE + INDEX]
  password_hash (255)                  ← bcrypt
  estado ('activo'|'inactivo')         ← soft delete / suspensión de cuenta
  creado_en TIMESTAMPTZ                ← zona horaria segura para la ingesta
  actualizado_en TIMESTAMPTZ NULL      ← onupdate automático

direcciones_envio (20,000 filas Faker)
  id
  usuario_id → FK usuarios             [INDEX, ON DELETE CASCADE]
  direccion (255), distrito (120), ciudad (120), pais (80)
  es_principal BOOLEAN DEFAULT FALSE   ← destino de envío por defecto
```

Relación: `usuarios 1 ──── N direcciones_envio` con borrado en cascada (eliminar un usuario elimina sus direcciones).

### 4.3 Endpoints finales

```http
GET  /health                                     # estado del servicio

POST /usuarios/auth/register                      # alta + hash bcrypt + JWT
POST /usuarios/auth/login                         # verificación + JWT

GET  /usuarios/me                                 # perfil desde el token (sin id en URL)
GET  /usuarios/{id}                               # perfil (solo el propio dueño, 403 si no)
PATCH /usuarios/{id}                              # { nombre?, estado? } → actualizado_en

GET   /usuarios/{id}/direcciones                  # lista sus direcciones
POST  /usuarios/{id}/direcciones                  # crea (la primera es es_principal=true)
PATCH /usuarios/{id}/direcciones/{dir_id}         # marca es_principal (desmarca las demás)
DELETE /usuarios/{id}/direcciones/{dir_id}        # elimina (204)
```

**Argumento de robustez:** todos los endpoints de perfil y direcciones validan que el `id` de la URL coincida con el usuario del token (`403` si no) — un usuario jamás ve o edita datos ajenos. Al marcar una dirección como principal, las demás del usuario se desmarcan en la misma transacción, garantizando una sola dirección principal.

---

## 5. Pipeline de datos e ingesta

### 5.1 Generación (ya ejecutada, CSVs en `Data/csv/`)

Dos fuentes con naturalezas distintas — realismo y coherencia:

```text
┌─────────────────────────┐      ┌──────────────────────────┐
│ scrapping_falabella.py   │      │ faker_users.py            │
│ (Playwright + requests)  │      │ (Faker + bcrypt)          │
│ ~6,500 productos reales  │      │ 20,000 usuarios + 20,000  │
│ con imagen y descripción │      │ direcciones sintéticas     │
└───────────┬─────────────┘      └────────────┬─────────────┘
            ▼                                 ▼
   Data/csv/products.csv            Data/csv/usuarios.csv
           │                        Data/csv/direcciones_envio.csv
           ▼
  build_catalogo.py (transformación determinista, seed=42)
           │
           ▼
  Data/csv/catalogo/categorias.csv   (50 filas)
  Data/csv/catalogo/productos.csv    (5,699 filas)
  Data/csv/catalogo/inventario.csv   (5,699 filas)
```

Reglas de transformación de `build_catalogo.py`:

- **Categorías 1:1** con las presentes en el scraping (7 reales): Tecnología, Electrohogar, Muebles, Deportes, Belleza/Higiene/Salud, Hombre, Automotriz.
- **Precio consolidado**: `COALESCE(cmr, internet, event, normal)` con parseo robusto (separadores de miles "1,449" y precios múltiples "69.90,99.90" tomando el menor); los 5,699 productos quedan con precio válido. `precio_oferta` cuando el precio normal difiere (indica descuento).
- **SKU sintético** único (`CAT-000001`+) porque Falabella no expone SKU.
- **Stock sintético** (no viene en el scraping): 1–500 unidades, ~5% de productos agotados (324), reservas 0–10. Determinista (seed fija) para resultados reproducibles.
- Los CSVs de usuarios/direcciones llevan `estado='activo'` implícito y `es_principal=true` (relación 1:1 actual), listos para `COPY` en PostgreSQL.

Conteo operacional resultante:

| Tabla | Registros |
|---|---|
| usuarios | 20,000 |
| direcciones_envio | 20,000 |
| categorias | 50 |
| productos | 5,699 |
| inventario | 5,699 |
| movimientos_stock (procedimiento post-carga) | 25,000 |
| **Total** | **78,001** |

### 5.2 Carga a las bases de datos (VM de datos)

La carga se realiza con `Data/scripts/src/scripts/load_csv_bd.py`, que reusa las variables del despliegue (`Backend/.env.example`) y limpia las tablas antes de insertar:

```text
1. MySQL:   categorias.csv + productos.csv + inventario.csv (inserts por lotes)
2. MySQL:   CALL poblar_movimientos_stock(25000)
3. PostgreSQL: usuarios.csv + direcciones_envio.csv (COPY rápido) +
              reajuste de secuencias SERIAL para que la API inserte sin colisiones
```

El esquema se crea automáticamente al levantar la VM de datos: MySQL monta `products/init.sql` y PostgreSQL monta `postgres-init/01_esquema.sql` (espejo de los modelos SQLAlchemy). Ver `Backend/DESPLIEGUE.md` para el paso a paso completo.

### 5.3 Ingesta a la nube analítica (implementada en `Ingesta/`)

La MV de ingesta ejecuta contenedores Python (estrategia pull del 100 %): extraen de MySQL y PostgreSQL, generan CSVs y los suben a S3; Glue cataloga y Athena consulta. En este entregable están implementados dos de los tres contenedores, uno por cada backend:

- `ingesta-usuarios` → PostgreSQL: `usuarios`, `direcciones_envio`.
- `ingesta-catalogo` → MySQL: `categorias`, `productos`, `inventario`, `movimientos_stock`.
- `ingesta-ventas` (MongoDB) llega con el microservicio de Ventas/Reseñas.

Cada contenedor se conecta con credenciales de **solo lectura** (`ingesta_pg` / `ingesta_my`, creadas en el primer arranque de las bases) y usa las credenciales de AWS del IAM Role de la EC2 (sin claves en el código). El contrato de datos (`usuario_id`, `producto_id`, `categoria_id` consistentes entre bases) ya está garantizado por este pipeline: los ids de los CSVs se cargan tal cual en las BDs, así que los cruces en Athena funcionan sin traducción.

### 5.4 Comandos de regeneración y carga (`Data/scripts/`)

```bash
uv add faker python-dotenv "passlib[bcrypt]" && uv sync   # dependencias
uv run python -m scripts.faker_users        # 20k usuarios + direcciones (idempotente)
uv run python -m scripts.build_catalogo     # products.csv → csv/catalogo/*.csv

# Carga a las BDs (con Data/scripts/.env apuntando a la VM de datos):
uv run python -m scripts.load_csv_bd --dry-run   # valida CSVs sin conectar
uv run python -m scripts.load_csv_bd             # carga completa

# Solo para re-scraping (horas de runtime):
# uv run playwright install chromium
# uv run python -m scripts.scrapping_falabella
```

### 5.5 Despliegue en las VMs de desarrollo

El despliegue completo (VM de datos + VM app + carga de CSVs + verificación) está documentado paso a paso en **`Backend/DESPLIEGUE.md`**. Resumen de piezas:

| Pieza | Archivo |
|---|---|
| VM de datos (MySQL + PostgreSQL con esquema inicial) | `Backend/docker-compose.datos.yml` + `Backend/postgres-init/01_esquema.sql` |
| VM app/dev (los 2 microservicios con healthchecks) | `Backend/docker-compose.yml` |
| Imágenes Docker | `Backend/products/Dockerfile` (Go multi-stage) · `Backend/users-address/Dockerfile` (Python) |
| Variables reales (IP privada VM datos, JWT, CORS de Amplify) | `Backend/.env.example` → `.env` (no se versiona) |
| Carga de datos CSV → BDs | `Data/scripts/src/scripts/load_csv_bd.py` |

### 5.6 Infraestructura como código (CloudFormation)

El primer entregable se despliega con **AWS CloudFormation** desde un único template
(`infrastructure/cloudformation.yaml`) que crea todo el entorno en una operación:

| Pieza | Detalle |
|---|---|
| VPC + subredes | Subred pública (MV app + MV ingesta) y subred **privada** (MV de datos) con NAT Gateway |
| Security Groups | `sg-app`, `sg-ingesta` y `sg-bd`; la base solo acepta 3306/5432 desde `sg-app` y `sg-ingesta` (nunca `0.0.0.0/0`) |
| 2 MV de aplicación (App 1 y App 2) | EC2 públicas que instalan Docker, clonan el repo y levantan `docker-compose.yml` (catálogo + usuarios), compartiendo `sg-app` |
| MV de base de datos | EC2 **privada** (sin IP pública) con MySQL + PostgreSQL (`docker-compose.datos.yml`) |
| MV de ingesta | EC2 con IAM Role que prepara los contenedores Python y escribe en S3 |
| S3 | Bucket del data lake |
| IAM | Rol de ingesta con permisos de escritura solo en el bucket |

La elección de un **único template** (en lugar de varios anidados) se justifica en este
entregable por simplicidad: un solo `create-stack` despliega VPC, seguridad, las 4 MV
(2 de aplicación + datos + ingesta), S3 e IAM de forma atómica y reproducible; al crecer a producción puede partirse en
stacks anidados (red, datos, aplicación, analítica). El paso a paso completo está en
**`DESPLIEGUE_AWS.md`**.

---

## 6. Catálogo consolidado de endpoints del proyecto

| # | Método y ruta | Servicio | Propósito |
|---|---|---|---|
| 1 | `GET /health` | Catálogo / Usuarios | Health check de cada servicio |
| 2 | `GET /api/catalogo/categorias` | Catálogo | Lista categorías para filtros |
| 3 | `GET /api/catalogo/productos` | Catálogo | Listado paginado + filtros |
| 4 | `GET /api/catalogo/productos/{id}` | Catálogo | Detalle de producto |
| 5 | `GET /api/catalogo/productos/{id}/movimientos` | Catálogo | Historial de stock |
| 6 | `POST /api/catalogo/inventario/reservar` | Catálogo | Reservar stock (transaccional) |
| 7 | `POST /api/catalogo/inventario/liberar` | Catálogo | Liberar reserva |
| 8 | `POST /api/catalogo/inventario/confirmar-venta` | Catálogo | Confirmar venta y descontar |
| 9 | `POST /usuarios/auth/register` | Usuarios | Registro con bcrypt + JWT |
| 10 | `POST /usuarios/auth/login` | Usuarios | Login y emisión de JWT |
| 11 | `GET /usuarios/me` | Usuarios | Perfil desde token |
| 12 | `GET /usuarios/{id}` | Usuarios | Perfil propio |
| 13 | `PATCH /usuarios/{id}` | Usuarios | Editar nombre / estado |
| 14 | `GET /usuarios/{id}/direcciones` | Usuarios | Listar direcciones |
| 15 | `POST /usuarios/{id}/direcciones` | Usuarios | Crear dirección |
| 16 | `PATCH /usuarios/{id}/direcciones/{dir_id}` | Usuarios | Marcar dirección principal |
| 17 | `DELETE /usuarios/{id}/direcciones/{dir_id}` | Usuarios | Eliminar dirección |

---

## 7. Flujo de demostración end-to-end

1. **Login**: `POST /usuarios/auth/login` con un usuario de los 20k → JWT.
2. **Explorar catálogo**: `GET /api/catalogo/productos?categoria_id=1&precio_max=500&q=mouse` → página de resultados paginada usando índices.
3. **Detalle**: `GET /api/catalogo/productos/{id}` → descripción real de Falabella, marca, imagen, precio y oferta.
4. **Reservar**: `POST /api/catalogo/inventario/reservar` → transacción con `FOR UPDATE`; ver `409` pidiendo más stock del disponible.
5. **Confirmar venta**: `POST /api/catalogo/inventario/confirmar-venta` → el stock reservado se descuenta.
6. **Auditoría**: `GET /api/catalogo/productos/{id}/movimientos` → la bitácora muestra RESERVA y VENTA_CONFIRMADA.
7. **Perfil**: `GET /usuarios/me` con el token → datos del usuario; `PATCH` cambia su nombre y se refleja `actualizado_en`.
8. **Direcciones**: crear una segunda dirección, marcarla principal (`PATCH`) y verificar que la anterior quedó desmarcada; borrar una (`DELETE` → 204).

---

## 8. Roadmap futuro

| # | Línea | Detalle |
|---|---|---|
| 1 | **Microservicio de Reseñas** (Node.js + MongoDB) | Documentos JSON flexibles (estrellas, texto, fotos opcionales); ~10,000 documentos Faker; cumple el requisito NoSQL de la propuesta original. |
| 2 | **Microservicio de Órdenes** (orquestador) | Sin BD propia: consume Catálogo (reserva/confirmación de stock) y Usuarios (validación del comprador) por HTTP; el endpoint de mayor valor de la rúbrica. |
| 3 | **Autenticación entre servicios** | Hoy cada servicio valida su propio JWT; extender a propagación de token o mTLS interno para que Órdenes llame a los demás con identidad verificable. |
| 4 | **Migraciones versionadas** | Reemplazar `Base.metadata.create_all` y el `init.sql` manual por Alembic (Python) y golang-migrate (Go): evolución del esquema sin reprovisionar la VM. |
| 5 | **Frontend en Amplify** | SPA React: catálogo con filtros/paginación, detalle con imagen real, checkout consumiendo el flujo reservar→confirmar. |
| 6 | **CI/CD y observabilidad** | Pipeline de build de imágenes, métricas de p99 y error rate por endpoint, alertas sobre el health check. |
| 7 | **Catálogo Glue + Athena + Microservicio analítico** | Registrar cada CSV de S3 en Glue, crear las 4 consultas y 2 vistas en Athena y exponer el MS5 (FastAPI) que el frontend consume. |
| 8 | **`ingesta-ventas` (MongoDB)** | Tercer contenedor de ingesta: `ordenes`, `resenas` y `detalle_ordenes.csv`; llega junto al microservicio de Ventas/Reseñas. |
| 9 | **API Gateway + NLB privado** | Reemplazar el acceso directo por HTTPS público vía API Gateway → NLB privado → las 2 MV de aplicación idénticas. |

---

## 9. Preguntas probables del profesor

**¿Por qué Go para catálogo y Python para usuarios, y no uno solo?**
Go ofrece concurrencia y footprint óptimos para el endpoint de mayor tráfico (listado de productos) con transacciones de stock sensibles a latencia; Python/FastAPI acelera el desarrollo del CRUD con validación y JWT listos. El contraste demuestra criterio de selección, no preferencia de confort.

**¿Por qué separar inventario de productos?**
Lectura vs. escritura. El catálogo se lee constantemente; el stock se escribe con bloqueos pesimistas (`FOR UPDATE`). Separarlos evita que las operaciones de compra degraden el listado público.

**¿Qué garantiza que el stock no se corrompa con compras simultáneas?**
Una transacción por operación: bloqueo de fila (`SELECT ... FOR UPDATE`), verificación de stock, actualización e inserción del movimiento — commit atómico o rollback completo.

**¿Los 20,000 registros son reales o inventados?**
Ambos: 5,699 productos reales (scraping de Falabella con precios, descripciones e imágenes) y 40,000 registros sintéticos coherentes (usuarios/direcciones Faker con distritos reales de Lima y hashes bcrypt). La mezcla hace la demo creíble y la analítica significativa.

**¿Por qué las categorías son 50?**
Son las categorías presentes en los datos scrapeados; se mapearon 1:1 para no inventar taxonomías que no existen en el dato real. El scraper consulta 49 términos de búsqueda en Falabella, y los resultados se agrupan en 50 categorías distintas según los datos obtenidos.

**¿Qué pasa si un usuario pierde su token?**
El token JWT expira en 60 minutos (configurable); el usuario re-autentica con login. No hay sesión en servidor que invalidar.

**¿Por qué `es_principal` en direcciones si cada usuario tiene una sola dirección?**
El esquema soporta N direcciones desde el diseño; el dato actual tiene 1 por usuario pero la API ya maneja el caso N (crear, marcar principal desmarcando las demás, eliminar). Es evolutivo sin sobre-diseño.

**¿La analítica ve los datos en tiempo real?**
No, y es deliberado: la ingesta pull corre de forma periódica hacia S3, desacoplando la carga analítica de las BD operacionales. Es el patrón lakehouse estándar descrito en el documento 02.
