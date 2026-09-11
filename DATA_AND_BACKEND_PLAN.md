# Plan de Datos y Backend — CloudShop

Documento de trabajo que consolida: (1) los ajustes ligeros a los esquemas y endpoints de los microservicios de Catálogo (Go/MySQL) y Usuarios (Python/PostgreSQL), (2) la estrategia para que los CSVs generados calzen 1:1 con las bases de datos y se superen los 20,000 registros operacionales, y (3) la estructura del documento de sustentación final.

**Estado:** plan aprobado. Este documento no modifica código; describe qué se implementará.

---

## 1. Ajustes ligeros a las tablas

Principio rector: solo lo esencial para un e-commerce real — tipos correctos, FKs necesarias, índices en campos de búsqueda frecuente. Nada más.

### 1.1 Catálogo — `Backend/products/` (Go + MySQL)

**Estado actual (init.sql):** `categorias`, `productos`, `inventario` (1:1) y `movimientos_stock` ya tienen FKs, CHECKs, índices en FKs y `sku` UNIQUE. La base es sólida.

**Cambios propuestos a `productos`** (columnas que el scraping de Falabella ya captura + esenciales de e-commerce):

```sql
ALTER TABLE productos
  ADD COLUMN marca         VARCHAR(80)    NULL,   -- brand_name del scraping
  ADD COLUMN imagen_url    VARCHAR(512)   NULL,   -- local_image del scraping
  ADD COLUMN origen_url    VARCHAR(512)   NULL,   -- link del producto en Falabella (trazabilidad)
  ADD COLUMN precio_oferta DECIMAL(12,2)  NULL,   -- normal_price cuando difiere del precio vigente
  ADD COLUMN activo        TINYINT(1)     NOT NULL DEFAULT 1,  -- soft delete / fuera de catálogo
  ADD INDEX idx_productos_precio (precio),        -- filtros por rango de precio
  ADD INDEX idx_productos_activo (activo);        -- listados públicos filtran activo=1
```

`inventario` y `movimientos_stock` no requieren cambios.

**Cambios en la carga de `categorias`:**

- La tabla se poblará **1:1 con las ~49 categorías scrapeadas** (decisión: fidelidad al dato real). El script de transformación generará también `categorias.csv` con `nombre` legible (ej. `sillas-gamer` → `Sillas Gamer`) y descripción breve.
- Los seeds de `init.sql` (5 categorías + 20 productos manuales) se retiran del flujo: el catálogo real viene del CSV. El procedimiento `poblar_movimientos_stock(25000)` **se conserva**, pero su `CALL` debe ejecutarse **después** de cargar productos e inventario (reordenar init.sql o invocarlo en el paso de carga).

### 1.2 Usuarios — `Backend/users-address/` (Python + PostgreSQL)

**Estado actual:** modelos SQLAlchemy ya correctos (email UNIQUE + index, FK con CASCADE, índice en `usuario_id`). Faltan los campos que la propuesta (`01_Sustentacion`) define pero no están implementados.

**Cambios propuestos:**

```python
# Usuario
estado       = Column(String(20), nullable=False, server_default="activo")  # activo | inactivo
actualizado_en = Column(DateTime(timezone=True), onupdate=func.now())

# Direccion
es_principal = Column(Boolean, nullable=False, server_default=text("false"))
```

En el CSV, la dirección de cada usuario se marca `es_principal=TRUE` (hoy la relación es 1 usuario : 1 dirección, así que todas quedan como principal).

### 1.3 Endpoints propuestos

Criterio: elevar el proyecto sin sobrecomplicarlo. Todo lo nuevo es filtrado/paginación/CRUD faltante, no lógica exótica.

**Catálogo (Go — Gin)**

| Endpoint | Estado | Nota |
|---|---|---|
| `GET /health` | Existe | Sin cambios |
| `GET /api/catalogo/productos` | Existe → **mejorar** | Hoy lista TODO (problemático con ~6,500 filas). Agregar paginación `?page=1&limit=20` (default 20, máx 100) y filtros: `?categoria_id`, `?q` (LIKE sobre nombre/marca), `?precio_min`, `?precio_max`, `?solo_activos=true` |
| `GET /api/catalogo/productos/{id}` | Existe | Sin cambios |
| `GET /api/catalogo/categorias` | **Nuevo** | Necesario para poblar el filtro del frontend |
| `GET /api/catalogo/productos/{id}/movimientos?limit=20` | **Nuevo** | Historial de stock del producto (útil para la demo y el panel admin) |
| `POST /api/catalogo/inventario/reservar` | Existe | Ya transaccional con `SELECT FOR UPDATE`; sin cambios |
| `POST /api/catalogo/inventario/liberar` | Existe | Sin cambios |
| `POST /api/catalogo/inventario/confirmar-venta` | Existe | Sin cambios |

**Usuarios (Python — FastAPI)**

| Endpoint | Estado | Nota |
|---|---|---|
| `POST /usuarios/auth/register` | Existe | Sin cambios |
| `POST /usuarios/auth/login` | Existe | Sin cambios |
| `GET /usuarios/{id}` | Existe | Sin cambios |
| `PATCH /usuarios/{id}` | Existe | Extender `UsuarioUpdate` con `estado` y reflejar `actualizado_en` |
| `GET /me` | **Nuevo** | Perfil desde el token, sin id en la URL (estándar práctico) |
| `GET /usuarios/{id}/direcciones` | Existe | Sin cambios |
| `POST /usuarios/{id}/direcciones` | Existe | Sin cambios |
| `PATCH /usuarios/{id}/direcciones/{direccion_id}` | **Nuevo** | Marcar `es_principal` (al marcar una, desmarcar las demás del usuario) |
| `DELETE /usuarios/{id}/direcciones/{direccion_id}` | **Nuevo** | Completa el CRUD de direcciones |

---

## 2. Estrategia de datos (20,000 registros)

### 2.1 Hallazgos de la auditoría de scripts

| Script | Estado | Observaciones |
|---|---|---|
| `faker_users.py` | Funcional, idempotente (reanuda por lotes) | Ya genera 20,000 usuarios + 20,000 direcciones con columnas 1:1 al esquema. **Faltan en `pyproject.toml` las deps que importa:** `faker`, `python-dotenv`, `passlib` (+ `bcrypt`). |
| `scrapping_falabella.py` | Ejecutado; `products.csv` con 6,498 filas | Columnas: `category, name, brand_name, cmr_price, internet_price, event_price, normal_price, link, description, image_url, local_image`. **No mapea directo al esquema:** sin SKU, sin `categoria_id`, sin stock, 4 columnas de precio a consolidar. |
| `scrapping_falabella.py` — re-scraping | Opcional | Solo si se quiere refrescar datos: requiere `uv run playwright install chromium` primero. |

### 2.2 Comparativa CSV vs esquema de base de datos

**`usuarios.csv` → tabla `usuarios` (PostgreSQL)**

| Columna CSV | Columna BD | Transformación |
|---|---|---|
| `id` | `id` | Ninguna (serial de carga) |
| `nombre` | `nombre` | Ninguna |
| `email` | `email` | Ninguna (ya UNIQUE) |
| `password_hash` | `password_hash` | Ninguna (bcrypt ya generado) |
| `creado_en` | `creado_en` | Ninguna (formato ISO con offset ya compatible) |
| — | `estado` | Constante `'activo'` en la carga |
| — | `actualizado_en` | NULL / default en la carga |

**`direcciones_envio.csv` → tabla `direcciones_envio` (PostgreSQL)**

| Columna CSV | Columna BD | Transformación |
|---|---|---|
| `id`, `usuario_id`, `direccion`, `distrito`, `ciudad`, `pais` | Homónimas | Ninguna |
| — | `es_principal` | Constante `TRUE` (cada usuario tiene 1 dirección) |

**`products.csv` (scraping) → tablas MySQL — requiere script de transformación `build_catalogo.py`**

| Columna CSV | Destino | Regla de transformación |
|---|---|---|
| `category` | `categorias` | 1:1: slug → nombre legible + descripción; se emite `csv/catalogo/categorias.csv` con ids 1..N |
| `category` | `productos.categoria_id` | Lookup del id asignado a esa categoría |
| — | `productos.sku` | Sintetizado, único: `CAT-000001`, `CAT-000002`, ... |
| `name` | `productos.nombre` | Recorte a 150 chars si excede |
| `brand_name` | `productos.marca` | NULL si falta |
| `description` | `productos.descripcion` | Ya viene limpio del scraping (HTML → texto) |
| `cmr_price` / `internet_price` / `event_price` | `productos.precio` | `COALESCE(cmr, internet, event, normal)` — primer precio vigente disponible; NULL → descartar fila |
| `normal_price` | `productos.precio_oferta` | Solo si difiere del precio elegido (indica descuento) |
| `link` | `productos.origen_url` | Tal cual |
| `local_image` | `productos.imagen_url` | Tal cual (ruta relativa a `csv/imagenes/`) |
| — | `productos.activo` | Constante `1` |
| — | `inventario.stock_disponible` | Sintético: entero aleatorio 0–500, ~5% de filas en 0 (productos "agotados" realistas) |
| — | `inventario.stock_reservado` | Sintético: aleatorio 0–10 si stock > 0, si no 0 |

**Salidas del script:** `csv/catalogo/categorias.csv`, `csv/catalogo/productos.csv`, `csv/catalogo/inventario.csv` — listos para `LOAD DATA INFILE` (MySQL) sin transformación adicional.

**Nota de coherencia:** el `id` de producto en MySQL se asigna por AUTO_INCREMENT al cargar; el CSV no fuerza ids, así el `producto_id` de `inventario` se resuelve en la carga (misma fila de ambos CSVs).

### 2.3 Conteo de registros operacionales

| Fuente | Registros |
|---|---|
| `usuarios.csv` (Faker) | 20,000 |
| `direcciones_envio.csv` (Faker) | 20,000 |
| `productos` (scraping transformado) | ~6,500 |
| `inventario` (sintético) | ~6,500 |
| `movimientos_stock` (procedimiento de init.sql) | 25,000 |
| **Total** | **~78,000** |

El requisito de 20,000 registros se supera con holgura y con datos de dos naturalezas distintas (sintéticos coherentes + reales de scraping).

### 2.4 Comandos de ejecución (`uv run` dentro de `Data/scripts/`)

```bash
cd Data/scripts

# 1. Declarar dependencias que faker_users.py ya importa pero no están en pyproject.toml
uv add faker python-dotenv "passlib[bcrypt]"
uv sync

# 2. Generar 20,000 usuarios + direcciones (idempotente: reanuda si se corta)
uv run python -m scripts.faker_users

# 3. Transformar products.csv (6,498 filas) a los CSVs del catálogo
#    (nuevo script: src/scripts/build_catalogo.py)
uv run python -m scripts.build_catalogo

# --- Solo si se decide re-scrapear Falabella (opcional, horas de runtime) ---
# uv run playwright install chromium
# uv run python -m scripts.scrapping_falabella
```

**Orden de carga a las bases de datos (posterior, en la MV de datos):**

1. `categorias.csv` → `categorias`
2. `productos.csv` → `productos`
3. `inventario.csv` → `inventario`
4. `CALL poblar_movimientos_stock(25000)` (reacomodar este paso fuera del init.sql inicial)
5. `usuarios.csv` y `direcciones_envio.csv` → PostgreSQL (`COPY`)

### 2.5 Nuevos scripts a implementar (backlog, no en este plan)

| Script | Responsabilidad |
|---|---|
| `build_catalogo.py` | Transformación `products.csv` → `csv/catalogo/*.csv` según la tabla de la sección 2.2. Determinista (seed fija) para poder regenerar. |
| Ajuste en `faker_users.py` | Agregar `es_principal` a `DIRECCIONES_COLS` con valor `TRUE` (única dirección por usuario). |

---

## 3. Estructura propuesta para `Proposal/03_Sustentacion_final.md`

Documento único que une backend + datos para la sustentación. Estructura:

```markdown
# 03 · Sustentación Final CloudShop

## 1. Resumen ejecutivo
   - Qué es CloudShop, qué se construyó y qué demuestra el proyecto.

## 2. Arquitectura general (diagrama Draw.io)
   - Amplify (frontend) → API Gateway → NLB → VMs app (Docker Compose)
     → VM datos (MySQL + PostgreSQL) → VM ingesta → S3 / Glue / Athena.

## 3. Microservicio de Catálogo (Go + MySQL)
   - Por qué Go (concurrencia, footprint, ideal para I/O de inventario).
   - Esquema final: categorias (49 reales), productos (+marca/imagen/activo),
     inventario, movimientos_stock.
   - Endpoints: listado paginado y filtrable, detalle, categorías,
     movimientos, y las 3 operaciones transaccionales de stock
     (SELECT FOR UPDATE como argumento de robustez).

## 4. Microservicio de Usuarios (Python/FastAPI + PostgreSQL)
   - Por qué Python (velocidad de desarrollo, ecosistema cripto/JWT).
   - Esquema final: usuarios (+estado), direcciones_envio (+es_principal).
   - Endpoints: auth JWT, perfil, CRUD de direcciones.

## 5. Pipeline de datos
   - Generación: scraping real (Falabella) + sintético coherente (Faker).
   - Transformación: build_catalogo y reglas de precio/stock.
   - Ingesta (pull) → S3 → Glue → Athena: misma historia de 01 y 02,
     ahora con los esquemas reales implementados.

## 6. Catálogo consolidado de endpoints del proyecto
   - Una tabla única (método, ruta, servicio, propósito) para la demo.

## 7. Flujo de demostración end-to-end
   - Login → listar productos con filtros → reservar stock → confirmar venta
     → verificar movimiento de stock.

## 8. Roadmap futuro
   - Microservicio de Reseñas (Node.js + MongoDB, ~10k documentos).
   - Microservicio de Órdenes (orquestador, consume Usuarios + Catálogo).
   - Autenticación entre servicios (JWT propagado / mTLS interno).
   - Migraciones (Alembic / golang-migrate) en vez de create_all.
   - CI/CD y pruebas de carga.

## 9. Preguntas probables del profesor
   - Reutilizar la sección de 01 y 02, actualizada a lo implementado.
```

---

## 4. Resumen de decisiones tomadas

| Decisión | Elección |
|---|---|
| Mapeo de categorías scrapeadas | **1:1** con la tabla `categorias` (~49 filas reales) |
| `es_principal` en CSV | Dirección única por usuario → `TRUE` |
| Reseñas (MongoDB) | Fuera del alcance actual; solo roadmap en la sustentación |
| Seeds de `init.sql` | Se retiran (el dato real viene de CSVs); el procedimiento de movimientos se conserva y se ejecuta post-carga |
| Dependencias de `Data/scripts` | Agregar `faker`, `python-dotenv`, `passlib[bcrypt]` a `pyproject.toml` |
