# Despliegue en las VMs de desarrollo — CloudShop

Guía operativa para subir los dos microservicios (Catálogo en Go, Usuarios en Python) y sus bases de datos a las VMs de AWS, siguiendo el esquema del proyecto: VM de datos (privada) + VM de aplicación/desarrollo. Reemplaza a la guía parcial de `users-address/DESPLIEGUE_VM.md`, que queda como referencia del MS de Usuarios.

---

## 1. Qué archivo va en cada VM

```text
                        VM de datos (subred privada)
                        ┌──────────────────────────────────────────┐
                        │ docker-compose.datos.yml                 │
                        │   · MySQL 8.4      (cloudshop_catalogo)  │
                        │     monta products/init.sql (esquema +   │
                        │     procedimiento poblar_movimientos_stock)│
                        │   · PostgreSQL 16 (cloudshop_usuarios)    │
                        │     monta postgres-init/01_esquema.sql   │
                        │ .env (credenciales reales)               │
                        └──────────────────────────────────────────┘
                              ▲ 3306 / 5432 (solo desde la VM app)
                              │ IP privada
                        ┌─────┴────────────────────────────────────┐
                        │ VM de desarrollo/app                     │
                        │ docker-compose.yml                       │
                        │   · catalogo (Go, :8080)                 │
                        │   · usuarios (FastAPI, :8000)            │
                        │ .env (apunta a la IP privada de datos)   │
                        └──────────────────────────────────────────┘

   Data/scripts/ (en la VM app o en local) carga los CSVs → BDs de la VM datos
   con load_csv_bd.py (reusa las mismas variables del .env).
```

Archivos creados para el despliegue:

| Archivo | VM | Función |
|---|---|---|
| `Backend/docker-compose.yml` | app/dev | Orquesta los 2 microservicios con healthchecks |
| `Backend/docker-compose.datos.yml` | datos | MySQL + PostgreSQL inicializados con esquema |
| `Backend/postgres-init/01_esquema.sql` | datos | Tablas `usuarios` y `direcciones_envio` (espejo de los modelos SQLAlchemy) |
| `Backend/.env.example` | ambas | Plantilla de variables: IP privada de la VM de datos, credenciales, `JWT_SECRET`, `CORS_ORIGINS` de Amplify |
| `Backend/users-address/Dockerfile` | app/dev | Imagen del servicio Python (uvicorn :8000) |
| `Backend/products/Dockerfile` | app/dev | Imagen del servicio Go (multi-stage, ya existía) |
| `Data/scripts/src/scripts/load_csv_bd.py` | — | Carga CSVs → MySQL/PostgreSQL |

---

## 2. VM de datos (una sola vez + cada reinicio)

```bash
# 1. Llevar el repo a la VM (git clone o scp) e instalar Docker
sudo apt update && sudo apt install -y docker.io docker-compose-plugin

cd CloudComputing-Project/Backend

# 2. Crear el .env real a partir de la plantilla
cp .env.example .env
nano .env    # MYSQL_PASSWORD, MYSQL_ROOT_PASSWORD, PG_PASSWORD: claves reales

# 3. Levantar MySQL + PostgreSQL (el init corre automáticamente la primera vez)
sudo docker compose -f docker-compose.datos.yml up -d
sudo docker compose -f docker-compose.datos.yml ps   # esperar healthy

# 4. Verificar que los esquemas quedaron creados
sudo docker exec cloudshop-mysql mysql -ucloud_user -p -e "USE cloudshop_catalogo; SHOW TABLES;"
sudo docker exec cloudshop-postgres psql -U cloud_user -d cloudshop_usuarios -c "\dt"
```

**Security groups (obligatorio):** 3306 y 5432 solo hacia la subred/IP de la VM app — nunca `0.0.0.0/0`. La VM de datos no tiene IP pública ni SSH abierto a internet.

---

## 3. Carga de datos (CSV → BDs)

El loader reusa las variables del despliegue. Solo hay que darle un `.env` con la IP de la VM de datos:

```bash
cd CloudComputing-Project/Data/scripts

cp ../Backend/.env.example .env
nano .env    # MYSQL_HOST y DATABASE_URL con la IP PRIVADA de la VM de datos

uv sync      # instala pymysql, psycopg y el resto de dependencias

# Validación previa sin tocar las BDs:
uv run python -m scripts.load_csv_bd --dry-run

# Carga completa (limpia y recarga):
uv run python -m scripts.load_csv_bd

# Variantes:
uv run python -m scripts.load_csv_bd --solo-mysql --movimientos 25000
uv run python -m scripts.load_csv_bd --solo-postgres
```

Qué hace la carga:

- **MySQL** → `categorias` (50), `productos` (5,699), `inventario` (5,699) y `CALL poblar_movimientos_stock(25000)` (bitácora de stock).
- **PostgreSQL** → `usuarios` (20,000) y `direcciones_envio` (20,000) vía `COPY`; reajusta las secuencias `SERIAL` para que la API pueda insertar sin colisiones.

Verificación:

```bash
sudo docker exec cloudshop-mysql mysql -ucloud_user -p -e "
  USE cloudshop_catalogo;
  SELECT (SELECT COUNT(*) FROM categorias) AS categorias,
         (SELECT COUNT(*) FROM productos)  AS productos,
         (SELECT COUNT(*) FROM inventario) AS inventario,
         (SELECT COUNT(*) FROM movimientos_stock) AS movimientos;"

sudo docker exec cloudshop-postgres psql -U cloud_user -d cloudshop_usuarios -c \
  "SELECT (SELECT COUNT(*) FROM usuarios) AS usuarios,
          (SELECT COUNT(*) FROM direcciones_envio) AS direcciones;"
```

---

## 4. VM de desarrollo / aplicación

```bash
cd CloudComputing-Project/Backend

cp .env.example .env
nano .env
#   MYSQL_HOST=IP_PRIVADA_VM_DATOS
#   MYSQL_PASSWORD=... (la misma clave de la VM de datos)
#   DATABASE_URL=postgresql+psycopg2://cloud_user:CLAVE@IP_PRIVADA_VM_DATOS:5432/cloudshop_usuarios
#   JWT_SECRET=string largo y aleatorio
#   CORS_ORIGINS=https://TU-APP.amplifyapp.com,http://localhost:5173

sudo docker compose up -d --build
sudo docker compose ps          # ambos servicios en healthy
sudo docker compose logs -f     # revisar conexión a MySQL/PostgreSQL
```

**Nota:** `CORS_ORIGINS` debe incluir el dominio público de AWS Amplify (visible en la consola de Amplify tras el primer deploy), además de `localhost:5173` para desarrollo local. El compose valida al arrancar que ninguna variable quede sin definir (`:?` falla el contenedor con mensaje claro).

---

## 5. Verificación end-to-end

```bash
# Catálogo (Go)
curl http://localhost:8080/health
curl "http://localhost:8080/api/catalogo/categorias"
curl "http://localhost:8080/api/catalogo/productos?limit=3&categoria_id=1&precio_max=500"
curl "http://localhost:8080/api/catalogo/productos/1"

# Usuarios (FastAPI)
curl http://localhost:8000/health
curl -X POST http://localhost:8000/usuarios/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"EMAIL_DE_UN_USUARIO_FAKER","password":"usuarioXXXXX"}'
# Contraseñas de los 20k usuarios Faker: prefijo "usuario" + id con 5 dígitos
# (ej. id 42 -> "usuario00042"). Toma el email de Data/csv/usuarios.csv.
```

Smoke test completo con el flujo de compra (reservar → confirmar → auditar):

```bash
curl -X POST http://localhost:8080/api/catalogo/inventario/reservar \
  -H "Content-Type: application/json" -d '{"producto_id":1,"cantidad":2}'
curl -X POST http://localhost:8080/api/catalogo/inventario/confirmar-venta \
  -H "Content-Type: application/json" -d '{"producto_id":1,"cantidad":2}'
curl http://localhost:8080/api/catalogo/productos/1/movimientos
```

---

## 6. Pendiente para producción (roadmap)

- **API Gateway + NLB**: hoy el tráfico entra directo por `:8080/:8000`; el esquema final añade API Gateway → NLB → las VMs app.
- **Seguridad de la VM app**: en dev se abren 8080/8000 al mundo; en producción solo el NLB debe alcanzarlas.
- **Secretos**: migrar `.env` a AWS Secrets Manager / SSM Parameter Store.
- **Migraciones**: reemplazar `postgres-init/01_esquema.sql` y `create_all` por Alembic (Python) y golang-migrate (Go).
- **Alta disponibilidad**: replicar la VM app (mismo compose) detrás del NLB.
