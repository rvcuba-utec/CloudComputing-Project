# CloudShop · Frontend

SPA en **React JavaScript + Vite**. Solo microservicios 1 (usuarios) y 2 (catálogo e inventario). No incluye carrito, pagos, órdenes, reseñas, analítica ni backend.

## Ejecutar

Requiere Node.js 22 o superior y npm.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Abre la URL que indique Vite. Para compilar: `npm run build`. Para revisar la compilación: `npm run preview`.

## Páginas

| Ruta | Alcance |
|---|---|
| `/productos` | Catálogo, búsqueda, categorías, orden por precio y filtro de stock |
| `/productos/:id` | Detalle, especificaciones, precio y unidades disponibles |
| `/login` | Inicio de sesión |
| `/registro` | Registro con confirmación de contraseña |
| `/perfil` | Consulta y edición de nombre, listado y alta de direcciones |

El inventario se consulta desde los productos. Reservar/liberar stock corresponde al futuro flujo de órdenes; no se incluye un panel administrativo sin un contrato de roles.

## Modo demo

Activo por defecto (`VITE_USE_MOCKS=true`). Cuenta: **demo@cloudshop.pe**, contraseña: **CloudShop123**.
Permite probar registro, login, edición de nombre y alta de direcciones. Todos los datos son ilustrativos. Las cuentas creadas y sus direcciones viven en memoria y desaparecen al recargar; no se guarda nada en una base de datos. No usar datos personales reales. Las imágenes son ilustraciones SVG locales de productos ficticios. No hay autenticación de producción en la demo.

## Conectar el API Gateway

Configura en `.env` local o en las variables de compilación de Amplify:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://TU_GATEWAY.execute-api.REGION.amazonaws.com
```

La URL debe incluir el stage cuando tu API Gateway lo use (p. ej. `.../amazonaws.com/prod`). El frontend agrega los prefijos reales de cada microservicio: el catálogo vive bajo `/api/catalogo/...` y los usuarios bajo `/usuarios/...`. Cambiar variables requiere recompilar. Las variables `VITE_*` son públicas: nunca colocar secretos AWS. El navegador solo accede al API Gateway HTTPS; no accede al balanceador, EC2 ni bases privadas. No se usa Amplify Auth/Cognito: la identidad pertenece al microservicio FastAPI.

**Contrato (final, ver `Proposal/03_Sustentacion_final.md`):** las rutas y respuestas ya coinciden con el backend implementado. La normalización vive en `src/services/authService.js` y `productService.js`; la UI permanece separada.

| Método | Ruta relativa a base URL | Entrada / respuesta |
|---|---|---|
| POST | `/usuarios/auth/login` | `{email,password}` → `{user,access_token}` |
| POST | `/usuarios/auth/register` | `{nombre,email,password}` → `{user,access_token}` (201) |
| GET | `/usuarios/me` | Perfil desde el token `{id,nombre,email,estado}` |
| GET | `/usuarios/{id}` | Perfil propio (403 si no es el dueño) |
| PATCH | `/usuarios/{id}` | `{nombre?}` → perfil actualizado |
| GET | `/usuarios/{id}/direcciones` | Array de direcciones |
| POST | `/usuarios/{id}/direcciones` | `{direccion,distrito,ciudad,pais}` → dirección con `id` (201) |
| PATCH | `/usuarios/{id}/direcciones/{dir_id}` | `{es_principal:true}` → marca principal |
| DELETE | `/usuarios/{id}/direcciones/{dir_id}` | Elimina (204) |
| GET | `/api/catalogo/categorias` | `{data:[{id,nombre,descripcion}],total}` |
| GET | `/api/catalogo/productos` | `{data,total,page,limit,pages}`; query `page`,`limit`,`categoria_id`,`q`,`precio_min`,`precio_max`,`solo_activos` |
| GET | `/api/catalogo/productos/{id}` | `{data:{producto}}`; 404 si no existe |

Producto normalizado por `productService.js`: `{id,nombre,marca,categoria,categoria_id,sku,precio,precio_oferta,stock,descripcion,imagen_url,origen_url}`. `categoria` viene de `categoria_nombre`; `stock` de `stock_disponible`; `precio_oferta` es `null` cuando no hay oferta. Las propiedades `tipo` y `color` solo apoyan las ilustraciones de la demo y no llegan de la API real.

El login es JSON (no OAuth2 form-urlencoded). El frontend envía el token como `Authorization: Bearer`; lo conserva solo en memoria y solicita iniciar sesión nuevamente al recargar. El backend valida la propiedad del perfil/direcciones en cada operación. Habilitar CORS (en el API Gateway o en los servicios) para el origen Amplify y local, los métodos GET/POST/PATCH/DELETE/OPTIONS y los headers Content-Type/Authorization. Los errores muestran el texto de `detail` (FastAPI) o `error.message` (Go) según el servicio; no hay fallback silencioso a demo si la API falla.

## Desplegar en AWS Amplify Hosting

### Desde Git (recomendado)

1. Sube este repositorio a tu proveedor Git.
2. En Amplify Hosting crea una app, conecta repositorio y rama. Selecciona monorepo y carpeta raíz **frontend**; la variable `AMPLIFY_MONOREPO_APP_ROOT` debe ser `frontend`.
3. Usa el `amplify.yml` de la raíz: `npm ci`, `npm run build`, artefactos `dist` dentro de frontend. Usa Node.js 22 o superior.
4. Para demo configura `VITE_USE_MOCKS=true`. Para APIs reales, configura las variables del apartado anterior.
5. Compila y despliega. En **Hosting → Rewrites and redirects**, importa el contenido de `frontend/amplify-rewrites.json`. Es una reescritura HTTP **200** a `/index.html` para navegación SPA. Este JSON es una referencia para la consola, **Amplify no lo aplica automáticamente**.
6. Comprueba la URL pública y recarga directamente `/productos/1`, `/login` y `/perfil`. Esta última redirigirá al login si no hay sesión en memoria.

### Carga manual

Ejecuta `npm run build` dentro de frontend. Comprime **el contenido** de `frontend/dist` (index.html debe estar en la raíz del ZIP) y cárgalo mediante la opción de despliegue sin proveedor Git de Amplify. Aplica también la reescritura SPA anterior. La carpeta `artifacts` puede contener un ZIP ya preparado para la demo.

Fuentes oficiales: [Vite en Amplify](https://docs.amplify.aws/gen1/javascript/deploy-and-host/frameworks/deploy-vite-site/), [reescrituras SPA](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html), [carga manual](https://docs.aws.amazon.com/amplify/latest/userguide/manual-deploys.html).

## Estructura

`frontend/src/` contiene `components/`, `pages/`, `hooks/`, `services/`, `contexts/`, `utils/`, `assets/`, `App.jsx` y `main.jsx`; `frontend/public/` admite archivos estáticos. Se usa JSX/JS para seguir React JavaScript de la arquitectura; la captura TSX se tomó como guía de carpetas.

## Diseño y alcance pendiente

Dirección: sencilla, sobria y cercana. Catálogo de densidad equilibrada, navegación superior, tipografía DM Sans con respaldo Arial, fondo cálido, acento verde, bordes discretos y cuadrícula de productos. Se priorizan precio, disponibilidad y búsqueda. La alternativa de una portada promocional se descartó porque esta entrega necesita catálogo y cuenta. No se agregan métricas, promociones, testimonios ni promesas comerciales inventadas.

Auditoría visual: sin gradientes, sombras decorativas, tarjetas de indicadores o panel genérico. Los productos tienen ilustraciones técnicas y las pantallas de formularios tienen su propia distribución. Los datos de ejemplo se documentan aquí; la interfaz pública no muestra avisos de demostración ni credenciales. Próxima iteración: acordar OpenAPI de ambos servicios y reemplazar el catálogo ficticio con productos reales. No se ha desplegado una app en una cuenta AWS desde este repositorio.
