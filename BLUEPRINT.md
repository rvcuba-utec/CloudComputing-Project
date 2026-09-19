# CloudShop — Blueprint de Arquitectura (Despliegue Manual)

> Documento guía único para construir toda la infraestructura de CloudShop de forma **manual** (consola AWS / CLI), en reemplazo de `infrastructure/cloudformation.yaml`.
>
> Cada recurso, máquina virtual, puerto, bucket y credencial queda definido aquí. Cualquier cosa que se construya debe ceñirse a este blueprint.

---

## 1. Resumen ejecutivo

CloudShop es un e-commerce con arquitectura de microservicios sobre AWS. Se compone de:

- **5 microservicios** en Docker (3 lenguajes, 2 BD SQL + 1 NoSQL, 1 sin BD, 1 analítico).
- **4 máquinas virtuales EC2**: 2 de producción (app), 1 de datos y 1 de ingesta.
- **1 VPC** con una subred pública y un Internet Gateway (sin NAT).
- **1 ALB** (Application Load Balancer) en el puerto 80 que reparte el tráfico HTTP entre las 2 MV de aplicación.
- **1 bucket S3** (data lake) + **Glue** (catálogo) + **Athena** (consultas) + microservicio analítico.
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
                        │ (CSV/JSON)   │      └────┬────┘
                        └──────────────┘      ┌────▼─────┐
                                              │  Athena  │
                                              └────┬─────┘
                                                   │
                                        Microservicio Analítico (MS5)
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
| 1 | Usuarios y Direcciones | Python / FastAPI | PostgreSQL | **8000** | `Backend/users-address/` | ✅ implementado |
| 2 | Catálogo e Inventario | Go / Gin | MySQL | **8080** | `Backend/products/` | ✅ implementado |
| 3 | Ventas y Reseñas | Node.js / NestJS | MongoDB | **8002** | `Backend/ventas-resenas/` *(nuevo)* | ⏳ pendiente |
| 4 | Órdenes (orquestador) | Python / FastAPI | — (sin BD) | **8003** | `Backend/ordenes/` *(nuevo)* | ⏳ pendiente |
| 5 | Analítica | Python / FastAPI | Athena | **8001** | `Backend/analitica/` *(nuevo)* | ⏳ pendiente |

### 5.1 MS1 Usuarios (Python + PostgreSQL, :8000)

Base `cloudshop_usuarios`. Tablas: `usuarios` (20,000), `direcciones_envio` (20,000). JWT HS256 (60 min).

```http
GET  /health
POST /usuarios/auth/register
POST /usuarios/auth/login
GET  /usuarios/me
GET  /usuarios/{id}
PATCH /usuarios/{id}
GET  /usuarios/{id}/direcciones
POST /usuarios/{id}/direcciones
PATCH /usuarios/{id}/direcciones/{dir_id}
DELETE /usuarios/{id}/direcciones/{dir_id}
```

- Dockerfile: `Backend/users-address/Dockerfile` (uvicorn `:8000`).
- Swagger nativo: `/docs` (además existe el catálogo centralizado de §11).
- Contraseñas Faker: `usuario` + id con 5 dígitos (ej. id 42 → `usuario00042`).

### 5.2 MS2 Catálogo e Inventario (Go + MySQL, :8080)

Base `cloudshop_catalogo`. Tablas: `categorias` (50), `productos` (5,699), `inventario` (5,699), `movimientos_stock` (25,000).

```http
GET  /health
GET  /api/catalogo/categorias
GET  /api/catalogo/productos                  # ?page &limit &categoria_id &q &precio_min &precio_max &solo_activos
GET  /api/catalogo/productos/{id}
GET  /api/catalogo/productos/{id}/movimientos
POST /api/catalogo/inventario/reservar        # { producto_id, cantidad } → SELECT FOR UPDATE
POST /api/catalogo/inventario/liberar
POST /api/catalogo/inventario/confirmar-venta
```

- Dockerfile: `Backend/products/Dockerfile` (multi-stage Go, `PORT`=8080).

### 5.3 MS3 Ventas y Reseñas (Node.js + MongoDB, :8002) — *pendiente*

Colecciones: `ordenes` (o `ventas`) y `resenas` (documentos JSON). Estructuras en `Proposal/01_Sustentacion_Backend_Frontend_CloudShop.md` §4.3.

```http
POST /ventas
GET  /usuarios/{usuarioId}/ventas
GET  /productos/{productoId}/resenas
POST /productos/{productoId}/resenas
```

- Valida producto/usuario llamando a MS2/MS1 por HTTP (consume otros microservicios).
- ~10,000 documentos Faker para cumplir el requisito NoSQL.

### 5.4 MS4 Órdenes (Python, sin BD, :8003) — *pendiente*

Orquestador: valida usuario (MS1), consulta/reserva stock (MS2) y registra venta (MS3). Compensación: libera stock si falla el registro.

```http
POST /ordenes/previsualizar
POST /ordenes/confirmar
GET  /ordenes/{id}/estado
POST /ordenes/{id}/cancelar
```

### 5.5 MS5 Analítica (Python + Athena, :8001) — *pendiente*

Ejecuta consultas Athena y devuelve JSON. Usa credenciales del IAM Role (sin claves en código).

```http
GET /analitica/ticket-promedio
GET /analitica/productos-mas-vendidos
GET /analitica/ventas-por-categoria
GET /analitica/ventas-por-ciudad
GET /analitica/calificacion-vs-ventas
GET /analitica/clientes-frecuentes
```

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

- Las imágenes se alojan en Docker Hub con tags como `usuario/cloudshop-catalogo:latest`, `usuario/cloudshop-usuarios:latest`, etc.
- El compose de producción usa `image:` (referencia a Docker Hub); el `build:` se usa solo en desarrollo.

---

## 6. Bases de datos (MV de datos)

Se montan con **contenedores Docker**, una **red Docker propia `red_bd`** y **volúmenes nombrados** para persistencia.

| Motor | Contenedor | Puerto | Base | Usuario app | Usuario solo lectura (ingesta) |
|---|---|---|---|---|---|
| MySQL 8.4 | `cloudshop-mysql` | 3306 | `cloudshop_catalogo` | `cloud_user` | `ingesta_my` |
| PostgreSQL 16 | `cloudshop-postgres` | 5432 | `cloudshop_usuarios` | `cloud_user` | `ingesta_pg` |
| MongoDB | `cloudshop-mongo` | 27017 | `cloudshop_ventas` | — *(pendiente)* | `ingesta_mongo` *(pendiente)* |

- Esquema SQL inicial: `Backend/products/init.sql` (MySQL) y `Backend/postgres-init/01_esquema.sql` (PostgreSQL), montados en `docker-compose.datos.yml`.
- Volúmenes: `mysql_data`, `pg_data` (y `mongo_data` para MongoDB).
- MongoDB se agrega a la misma MV de datos (tercera MV del enunciado).
- Carga de datos: `Data/scripts/src/scripts/load_csv_bd.py` (CSVs → MySQL/PostgreSQL).

> La MV de datos tiene IP pública solo para salida a internet (`docker pull`); su protección de entrada depende 100 % de `cloudshop-sg-bd`.

---

## 7. Bucket S3 (data lake)

- **Nombre:** `cloudshop-data-lake-2026-utec-mr-cs2032-v2`
- **Acceso:** solo vía IAM Role de la MV de ingesta (`LabInstanceProfile`); no público.

```text
s3://cloudshop-data-lake-2026-utec-mr-cs2032-v2/
├── usuarios/
│   ├── usuarios.csv
│   └── direcciones_envio.csv
├── catalogo/
│   ├── categorias.csv
│   ├── productos.csv
│   ├── inventario.csv
│   └── movimientos_stock.csv
└── ventas/
    ├── ordenes.json
    ├── detalle_ordenes.csv
    └── resenas.json
```

---

## 8. Ingesta (MV de ingesta)

Tres contenedores Python con `boto3`, estrategia **pull del 100 %**, credenciales de solo lectura, sin claves AWS en el código (usa el IAM Role).

| Contenedor | Fuente | Tablas/colecciones | Archivos en S3 |
|---|---|---|---|
| `ingesta-usuarios` | PostgreSQL | `usuarios`, `direcciones_envio` | `usuarios/*.csv` |
| `ingesta-catalogo` | MySQL | `categorias`, `productos`, `inventario`, `movimientos_stock` | `catalogo/*.csv` |
| `ingesta-ventas` *(pendiente)* | MongoDB | `ordenes`, `resenas` | `ventas/ordenes.json`, `ventas/detalle_ordenes.csv`, `ventas/resenas.json` |

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
| `direcciones_envio` | `usuarios/direcciones_envio.csv` |
| `categorias` | `catalogo/categorias.csv` |
| `productos` | `catalogo/productos.csv` |
| `inventario` | `catalogo/inventario.csv` |
| `movimientos_stock` | `catalogo/movimientos_stock.csv` |
| `ordenes` | `ventas/ordenes.json` |
| `detalle_ordenes` | `ventas/detalle_ordenes.csv` |
| `resenas` | `ventas/resenas.json` |

Base de datos Glue: `cloudshop_analytics`.

**Contrato de datos:** `usuario_id`/`producto_id`/`categoria_id` (`BIGINT`) consistentes entre motores; `orden_id` (`VARCHAR`); fechas ISO 8601.

### Athena (4 consultas + 2 vistas)

Consultas: ticket promedio por ciudad, productos/categorías con más ingresos, ventas por categoría y mes, calificación vs unidades vendidas.
Vistas: `vw_detalle_ventas` y `vw_valor_cliente`.

> SQL de referencia completo en `Proposal/02_Sustentacion_Data_Science_CloudShop.md` §8 y §9.

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

El frontend debe consumir los 5 microservicios (≥2 métodos REST de cada uno).

---

## 13. Variables de entorno y despliegue manual

### 13.1 Credenciales (no versionar)

| Variable | Dónde se usa | Nota |
|---|---|---|
| `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | MV datos + MV app + loader | MySQL |
| `PG_PASSWORD` | MV datos + MV app + loader | PostgreSQL |
| `JWT_SECRET` | MV app (MS1) | string largo y aleatorio |
| `CORS_ORIGINS` | MV app (MS1) | Amplify + `localhost:5173` |
| `ingesta_my` / `ingesta_pg` | MV datos (init) + MV ingesta | solo lectura |

### 13.2 Orden de construcción

1. **Red**: VPC + subred pública + IGW + tabla de ruteo.
2. **Security Groups**: `sg-app`, `sg-bd`, `sg-ingesta`, `sg-alb` (según §4).
3. **MV datos**: instalar Docker, clonar repo, crear `.env`, `docker compose -f docker-compose.datos.yml up -d`, levantar MongoDB.
4. **Carga de datos**: `load_csv_bd.py` (CSVs → MySQL/PostgreSQL).
5. **MV ingesta**: clonar repo, configurar `.env` de ingesta, `docker compose up --build`.
6. **Imágenes**: `docker compose build` + `docker compose push` (Docker Hub).
7. **MV app-1 y app-2**: clonar repo, `.env` apuntando a `10.0.1.10`, `docker compose pull` + `docker compose up -d`.
8. **ALB**: crear ALB + 5 target groups (registrar app-1 y app-2) + listener :80 con reglas por path.
9. **S3 + Glue + Athena**: catálogo, 4 queries, 2 vistas.
10. **Swagger UI**: subir `docs/openapi/*.yaml` y levantar el contenedor (§11).
11. **Amplify** (frontend) apuntando al DNS del ALB.

> Verificación por servicio: `curl http://localhost:<puerto>/health` en cada VM (8080, 8000, 8001, 8002, 8003).

---

## 14. Checklist de evidencias (rúbrica)

- [ ] `docker ps` en app-1 y app-2 mostrando los 5 microservicios (mismo `docker-compose.yml`).
- [ ] Health checks del ALB en verde (target groups `healthy`).
- [ ] URL pública del ALB (`http://...elb.amazonaws.com`) respondiendo por path.
- [ ] Catálogo centralizado `swagger-ui` mostrando MS1–MS5 (definiciones OpenAPI en YAML).
- [ ] ≥20,000 registros por motor: `usuarios` (20k), `movimientos_stock` (25k), `resenas`/`ordenes` (≥10k).
- [ ] Security Groups prueban que las bases son privadas (puertos 3306/5432/27017 solo desde `sg-app`/`sg-ingesta`).
- [ ] URL pública de Amplify consumiendo las 5 APIs (≥2 métodos REST por servicio).
- [ ] Flujo de compra completo: login → catálogo → detalle → reservar → confirmar → auditar.
- [ ] MV ingesta: 3 contenedores, archivos en S3, logs con conteo de filas.
- [ ] Glue: 1 tabla por archivo; Athena: 4 consultas con joins + 2 vistas.
- [ ] Diagrama de arquitectura en draw.io (Backend + Frontend + Data Science).
