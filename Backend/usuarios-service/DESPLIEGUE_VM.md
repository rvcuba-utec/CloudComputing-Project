# Despliegue del Microservicio de Usuarios en Máquinas Virtuales

> Guía paso a paso para subir el MS1 (Usuarios) a la VM de aplicación y conectar
> la base de datos en la VM de datos. Aplica al esquema objetivo del proyecto:
> Amplify → API Gateway → Load Balancer → 2 VMs app (Docker Compose) → VM datos
> (PostgreSQL) → VM ingesta → S3/Athena.

---

## 1. Recordatorio de la arquitectura

```
Navegador (Amplify)
      │ HTTPS
      ▼
API Gateway  ──►  Load Balancer privado
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
   VM app 1                    VM app 2
   (Docker Compose             (Docker Compose
    con los 5 MS)               con los 5 MS)
        │                           │
        └─────────────┬─────────────┘
                      │ red interna VPC
                      ▼
              VM de datos
        (PostgreSQL + MySQL + MongoDB)
                      ▲
                      │ SELECT (solo lectura)
                      ▼
              VM de ingesta ──► S3 ──► Glue/Athena
```

- **Hoy**: todo local, sin Docker, sin AWS.
- **Mañana**: el código se empaqueta en contenedores y se despliega en las VMs.

---

## 2. Estructura de carpetas en TU repositorio (ahora, en local)

Así debe quedar tu repo para que Docker Compose lo encuentre todo:

```
cloudshop/                                  (o la carpeta raíz de tu monorepo)
├── Back-end-cloud/                         ← backend
│   ├── docker-compose.yml                  ← vive AQUÍ (una ruta MÁS ARRIBA del servicio)
│   └── usuarios-service/
│       ├── Dockerfile                      ← vive AQUÍ (junto al servicio)
│       ├── app/
│       │   ├── main.py
│       │   ├── config.py
│       │   ├── database.py
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── routers/
│       │   └── core/
│       ├── requirements.txt
│       ├── .env.example                    ← plantilla (sí se versiona)
│       ├── .env                            ← valores reales (NO se versiona)
│       └── README.md
└── Front-end-cloud/
    └── frontend/
        ├── src/
        ├── .env                            ← VITE_USE_MOCKS / VITE_API_BASE_URL
        └── ...
```

**Regla de oro:** el `Dockerfile` va **dentro** de `usuarios-service/`, y el
`docker-compose.yml` va **una carpeta más arriba** (en `Back-end-cloud/`), porque
el compose orquesta a TODOS los microservicios, no solo a este.

---

## 3. Distribución de carpetas DENTRO de la VM de aplicación

Cuando clones/subas el repo a la VM, se verá así (se usa Ubuntu como ejemplo):

```
/home/ubuntu/cloudshop/
├── docker-compose.yml                      ← se ejecuta desde aquí
├── .env                                    ← variables REALES de producción
├── usuarios-service/
│   ├── Dockerfile
│   ├── app/
│   ├── requirements.txt
│   └── ...
└── frontend/                               ← OPCIONAL (ver nota abajo)
    └── dist/                               ← salida de `npm run build`
```

**¿Y el frontend dónde va?** En el esquema oficial, el frontend **NO vive en la
VM**: se publica en **AWS Amplify** (hosting estático). Solo si quieres probarlo
todo dentro de las VMs, puedes compilarlo (`npm run build`) y servirlo con un
contenedor Nginx incluido en el compose. Para este MS1 no es obligatorio.

---

## 4. El `Dockerfile` (dentro de `usuarios-service/`)

Crea un archivo `usuarios-service/Dockerfile` con este contenido:

```dockerfile
# Imagen base con Python 3.12
FROM python:3.12-slim

# Evita que Python genere .pyc y habilita logs sin buffer
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Carpeta de trabajo dentro del contenedor
WORKDIR /app

# Primero copiamos e instalamos dependencias (aprovecha la caché de Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Luego copiamos el código
COPY app ./app

# Expone el puerto 8000 (el que escucha uvicorn)
EXPOSE 8000

# Comando de arranque. NO usamos --reload en producción.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Puntos clave:

- `--host 0.0.0.0` es **obligatorio** en Docker: si no, el contenedor solo
  escucharía en localhost y no recibiría tráfico desde fuera.
- **No** se copia `.env` dentro de la imagen. Las credenciales se inyectan en
  tiempo de ejecución (ver sección 5), para no quemar secretos en la imagen.
- `requirements.txt` está en la misma carpeta que el Dockerfile, por eso se copia
  con ruta relativa.

---

## 5. El `docker-compose.yml` (una ruta más arriba, en `Back-end-cloud/`)

Crea un archivo `Back-end-cloud/docker-compose.yml`:

```yaml
services:
  usuarios:
    build:
      context: ./usuarios-service
    container_name: micro-usuarios
    restart: unless-stopped
    environment:
      # Las credenciales NO van quemadas aquí: se leen del archivo .env
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_ALGORITHM: ${JWT_ALGORITHM:-HS256}
      JWT_EXPIRE_MINUTES: ${JWT_EXPIRE_MINUTES:-60}
      CORS_ORIGINS: ${CORS_ORIGINS}
    ports:
      - "8000:8000"
    # networks: si mañana hay más MS, se ponen todos en la misma red interna
    # networks:
    #   - cloudshop-net

# networks:
#   cloudshop-net:
#     driver: bridge
```

Y un archivo `Back-end-cloud/.env` (en la VM, **no** se versiona) con valores
reales de producción:

```dotenv
# OJO: la IP aquí es la de la VM de DATOS, ya no localhost
DATABASE_URL=postgresql+psycopg2://usuarios_app:CLAVE_SEGURA@10.0.1.10:5432/cloudshop_usuarios
JWT_SECRET=un_string_largo_y_aleatorio_generado
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=60
CORS_ORIGINS=https://TU_AMPLIFY.app,http://localhost:5173
```

Por qué esto es "cloud-ready":

- `DATABASE_URL` apunta a la **VM de datos** por su IP privada (`10.0.1.10`), no
  a `localhost`. El código de la app **no cambia nada**: ya lee esa variable por
  entorno.
- `CORS_ORIGINS` ahora debe incluir la URL pública de Amplify, no solo
  `localhost:5173`.

---

## 6. Cómo subir el código a la VM (paso a paso)

### 6.1 Llevar el código a la VM

Opción A — con Git (recomendado):

```powershell
# en tu máquina local, dentro del monorepo
git add .
git commit -m "Microservicio de usuarios con Docker"
git push origin main
```

```bash
# en la VM
git clone TU_REPO_URL cloudshop
cd cloudshop/Back-end-cloud
```

Opción B — copia directa por SSH (sin Git):

```powershell
scp -r C:\Users\tu\Desktop\...\Back-end-cloud usuario@IP_DE_LA_VM:/home/usuario/cloudshop/
```

### 6.2 Instalar Docker y arrancar en la VM

```bash
# instalar Docker (Ubuntu) — una sola vez
sudo apt update && sudo apt install -y docker.io docker-compose-plugin

# ir a la carpeta donde está el compose
cd /home/usuario/cloudshop/Back-end-cloud

# crear el .env real de producción
nano .env    # pegar los valores de la sección 5

# construir y levantar el servicio en segundo plano
sudo docker compose up -d --build

# ver logs y estado
sudo docker compose logs -f usuarios
sudo docker compose ps
```

### 6.3 Verificar

```bash
curl http://localhost:8000/health
# debe responder {"status":"ok"}
```

En producción, el API Gateway reenvía las peticiones al Load Balancer, que las
reparte entre las dos VMs app. Ambas corren el mismo contenedor y apuntan a la
misma base de datos.

---

## 7. LA BASE DE DATOS EN LA VM DE DATOS (lo que preguntaste)

Aquí está la clave: **no tienes un "script que crea la base de datos" separado.
Tienes DOS cosas distintas** que se confunden fácil:

### 7.1 Qué crea cada cosa

| ¿Qué se crea? | ¿Quién lo hace? | ¿Cuándo? |
|---|---|---|
| La base de datos **vacía** (`cloudshop_usuarios`) | Un comando manual `CREATE DATABASE` (o un init script) | **Una sola vez**, al preparar la VM de datos |
| Las **tablas** (`usuarios`, `direcciones_envio`) | Tu propia app, con `Base.metadata.create_all(bind=engine)` en `app/main.py` | **Automáticamente**, cada vez que arranca el contenedor |

### 7.2 Paso 1: crear la base vacía (una sola vez, en la VM de datos)

Conéctate a la VM de datos e instala PostgreSQL. Luego:

```bash
sudo -u postgres psql
```

```sql
-- 1) crear el usuario que usará la app (NO usar el superusuario postgres)
CREATE USER usuarios_app WITH PASSWORD 'CLAVE_SEGURA';

-- 2) crear la base de datos vacía
CREATE DATABASE cloudshop_usuarios OWNER usuarios_app;

-- 3) salir
\q
```

Eso **solo** crea la base vacía. Todavía no hay tablas. En local hiciste lo mismo
con `CREATE DATABASE cloudshop_usuarios;` desde pgAdmin/psql.

### 7.3 Paso 2: las tablas las crea la app sola

Cuando arranque el contenedor `usuarios`, su `app/main.py` ejecuta:

```python
Base.metadata.create_all(bind=engine)
```

Eso se conecta a `DATABASE_URL` (que apunta a la VM de datos) y **crea las tablas
si no existen**. No borra nada si ya existen. Por eso, la primera vez que
`docker compose up` termine, en la VM de datos ya tendrás `usuarios` y
`direcciones_envio` listas, sin que hayas escrito SQL a mano.

### 7.4 Lo que hay que configurar en la VM de datos (importante)

Para que la VM de aplicación pueda conectarse desde otro servidor, PostgreSQL por
defecto **solo escucha en localhost**. Hay que permitir conexiones remotas:

1. Editar `postgresql.conf` y poner:
   ```
   listen_addresses = '*'
   ```
2. Editar `pg_hba.conf` y agregar una línea que permita a la red interna de la
   VPC (ajusta a tu subred):
   ```
   host    all    all    10.0.0.0/16    scram-sha-256
   ```
3. Reiniciar PostgreSQL: `sudo systemctl restart postgresql`.

### 7.5 El flujo completo al desplegar

```
1. VM datos:  instalas Postgres → CREATE DATABASE (una vez) + abres red
2. VM app:    docker compose up → el contenedor arranca
3. app:       create_all → crea tablas en cloudshop_usuarios (auto)
4. frontend:  apunta al API Gateway → registra usuarios → se guardan en la VM datos
5. VM ingesta: SELECT * FROM usuarios/direcciones → sube CSVs a S3 (futuro)
```

### 7.6 Nota sobre producción

`create_all` es aceptable para esta fase (local y VM). En producción real se
reemplazaría por **migraciones con Alembic**, que permiten cambiar el esquema sin
borrar datos. Eso se hará en una iteración futura; hoy `create_all` basta.

---

## 8. Resumen rápido de archivos que debes crear

| Archivo | Ubicación | ¿Qué hace? |
|---|---|---|
| `Dockerfile` | `usuarios-service/` | Empaqueta la app Python |
| `docker-compose.yml` | `Back-end-cloud/` (una carpeta arriba) | Orquesta los contenedores |
| `.env` (producción) | `Back-end-cloud/` (en la VM) | Variables reales: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS` |

El código de la app **no cambia** al pasar de local a VM: solo cambian las
variables de entorno (sobre todo `DATABASE_URL`, que pasa de `localhost` a la IP
privada de la VM de datos).
