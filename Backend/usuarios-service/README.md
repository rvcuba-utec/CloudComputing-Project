# Microservicio 1 · Usuarios (FastAPI + PostgreSQL)

API REST de usuarios y direcciones de envío para CloudShop. Es parte del monorepo
`cloudshop/` y se despliega junto al `frontend/` (React + Vite). Hoy corre **solo
en local, sin Docker y sin AWS**, pero el código está escrito para que mañana se
despliegue en el esquema de microservicios (API Gateway → Load Balancer → VMs con
Docker Compose → VM de datos PostgreSQL).

## Contrato de rutas

| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/usuarios/auth/register` | `{nombre,email,password}` | `{user:{id,nombre,email}, access_token}` |
| POST | `/usuarios/auth/login` | `{email,password}` | `{user:{id,nombre,email}, access_token}` |
| GET | `/usuarios/{id}` | — | `{id,nombre,email}` |
| PATCH | `/usuarios/{id}` | `{nombre}` | `{id,nombre,email}` |
| GET | `/usuarios/{id}/direcciones` | — | `[{id,usuario_id,direccion,distrito,ciudad,pais}]` |
| POST | `/usuarios/{id}/direcciones` | `{direccion,distrito,ciudad,pais}` | dirección con `id` |
| GET | `/health` | — | `{status:"ok"}` |

- Login en **JSON**, no `OAuth2PasswordRequestForm`.
- Autenticación **JWT Bearer** (`Authorization: Bearer <token>`), HS256, `sub` = id.
- **Autorización por propiedad**: `GET/PATCH /usuarios/{id}` y `/usuarios/{id}/direcciones`
  validan que el `id` del token coincida con el de la ruta (si no, 403).
- Contraseñas con **bcrypt** (vía `passlib`, con `bcrypt==4.0.1` fijado).

## Prerrequisitos

- Python 3.10 o superior.
- PostgreSQL corriendo en `localhost:5432`.

## Puesta en marcha (PowerShell en Windows)

### 1. Crear la base de datos

```powershell
psql -U postgres -c "CREATE DATABASE cloudshop_usuarios;"
```

(Si tu usuario/contraseña difieren, ajústalos en el paso 3.)

### 2. Crear el entorno virtual e instalar dependencias

```powershell
cd backend\usuarios-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configurar el entorno

```powershell
Copy-Item .env.example .env
```

Edita `.env` si tu PostgreSQL usa otras credenciales o si quieres otro secreto
JWT. Nunca versiones `.env` ni coloques secretos AWS aquí.

### 4. Arrancar el servicio

```powershell
uvicorn app.main:app --reload --port 8000
```

### 5. Verificar

- Salud: abrir `http://localhost:8000/health` → `{"status":"ok"}`.
- Documentación interactiva (Swagger): `http://localhost:8000/docs`.

Al arrancar por primera vez se crean automáticamente las tablas `usuarios` y
`direcciones_envio` (solo en local; en producción se usarán migraciones).

## Conectar el frontend

En `frontend/.env` (o en las variables de compilación de Amplify):

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:8000
```

Reinicia Vite (`npm run dev`) y podrás registrar, iniciar sesión, ver el perfil,
editar el nombre y crear direcciones sin errores de CORS ni 404.

## Nota sobre ingesta a S3

Este servicio **no habla con AWS** ni expone endpoints de exportación/analítica.
La ingesta a S3 la hará una VM externa (contenedores Python) que se conecta
directamente a esta misma base PostgreSQL (`cloudshop_usuarios`), hace `SELECT`
sobre `usuarios` y `direcciones_envio`, y sube los CSVs a S3 para Glue/Athena.
Por eso:

- El nombre de la BD es estable y documentado (`cloudshop_usuarios`).
- Los modelos SQLAlchemy son la única fuente de verdad del esquema (sin SQL suelto).
- Los timestamps usan `timezone=True` para evitar problemas de zona horaria.
- `DATABASE_URL` siempre viene de entorno (mañana apunta a la VM de datos en la VPC).

## Estructura

```
usuarios-service/
├── app/
│   ├── main.py          # FastAPI, CORS, routers, create_all (sin lógica de negocio)
│   ├── config.py        # Settings con pydantic-settings
│   ├── database.py      # engine, SessionLocal, Base, get_db
│   ├── models/          # usuario.py, direccion.py
│   ├── schemas/         # usuario.py, direccion.py
│   ├── routers/         # auth.py, usuarios.py, direcciones.py
│   └── core/            # security.py (hash/JWT), deps.py (get_current_user)
├── .env.example
├── .gitignore
└── requirements.txt
```
