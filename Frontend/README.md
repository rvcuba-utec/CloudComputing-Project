# CloudShop · Frontend

Aplicación React + Vite integrada en `Frontend/frontend`. El código de la interfaz corresponde a [cloudshop-frontend, commit b99e5ee](https://github.com/Maxwell-CS/cloudshop-frontend/commit/b99e5eed87cf2983f62d573d153bd134f5c3dd4f). Consume los microservicios de este repositorio a través de una URL pública HTTPS.

## Ejecutar localmente

Requiere Node.js 22 o superior y npm. Desde la raíz de CloudComputing-Project:

```powershell
cd Frontend/frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

Crea `.env` únicamente si no existe; conserva tus variables locales. Vite muestra la dirección local disponible, normalmente `http://127.0.0.1:5173`.

Para compilar: `npm run build`. Los archivos publicados se generan en `dist/`. Para revisar esa compilación: `npm run preview`.

## Funciones disponibles

| Ruta | Funciones |
|---|---|
| `/productos` | Búsqueda, selector de categorías, paginación, orden por precio y filtro de disponibilidad |
| `/productos/:id` | Detalle, precio, stock, reseñas y selección de cantidades para el carrito |
| `/carrito` | Acumulación de productos, cambio de cantidades, eliminación, previsualización y confirmación |
| `/login`, `/registro` | Inicio de sesión y creación de cuenta |
| `/perfil` | Nombre, direcciones, historial de compras y cierre de sesión |
| `/admin` | Productos, categorías, usuarios y analítica; requiere rol `admin` |

El carrito persiste en `localStorage` y no reserva inventario. Al comprar, el frontend envía identificadores y cantidades al servicio de órdenes para validar precios y disponibilidad. Tras la confirmación, vacía el carrito e invalida la caché del catálogo y las ventas.

La sesión guarda el usuario público y el token de acceso en `localStorage`; las solicitudes usan `Authorization: Bearer`. El backend comprueba autenticación y permisos. La identidad pertenece al microservicio de usuarios, no a Amplify Auth/Cognito.

## Datos locales y conexión real

Con `VITE_USE_MOCKS=true` se utilizan datos de prueba. Las cuentas locales incluidas son:

- Usuario: `demo@cloudshop.pe` / `CloudShop123`.
- Administrador: `admin@cloudshop.pe` / `AdminPass123`.

Las direcciones, compras y cambios del catálogo de prueba viven en memoria. El carrito y la sesión persisten en el navegador. La analítica muestra una vista con datos ilustrativos únicamente en el servidor de desarrollo cuando el modo de prueba está activo. Una compilación de producción en modo de prueba muestra el aviso de conexión a AWS.

Para utilizar las APIs reales, configura:

```dotenv
VITE_USE_MOCKS=false
VITE_API_BASE_URL=https://TU_GATEWAY.execute-api.REGION.amazonaws.com
```

Incluye el stage si tu API lo requiere. El frontend agrega los prefijos de cada servicio; no añadas `/api` a la URL base. Las variables `VITE_*` se incluyen en los archivos públicos de la compilación. Las credenciales de AWS permanecen en el servidor.

| Servicio | Rutas consumidas |
|---|---|
| Usuarios | `/usuarios/auth/login`, `/usuarios/auth/register`, perfil, direcciones, listado y roles |
| Catálogo | `/api/catalogo/productos`, `/api/catalogo/categorias` y operaciones administrativas |
| Órdenes | `POST /ordenes/previsualizar`, `POST /ordenes/confirmar` |
| Ventas y reseñas | `GET /usuarios/{id}/ventas`, `GET/POST /productos/{id}/resenas` |
| Analítica | `GET /analitica/{consulta}`, con token de administrador |

Los seis reportes son ticket promedio, productos más vendidos, ventas por categoría, ventas por ciudad, calificación y ventas, y clientes frecuentes. La interfaz usa rankings compactos, agrupaciones por calificación, tendencias mensuales, resúmenes derivados de la respuesta y tablas desplegables. La caché del cliente mantiene resultados analíticos durante cinco minutos.

Los errores de conexión o del backend se muestran con opciones de reintento; no activan datos de prueba automáticamente.

## Amplify desde este repositorio

El archivo `amplify.yml` de la raíz contiene la configuración para este monorepositorio. `Frontend/amplify.yml` conserva una copia equivalente.

Al conectar **rvcuba-utec/CloudComputing-Project** en Amplify:

1. Selecciona la carpeta de la aplicación `Frontend/frontend`.
2. Comprueba `AMPLIFY_MONOREPO_APP_ROOT=Frontend/frontend`.
3. Usa `npm ci` y `npm run build`; los artefactos son `dist` dentro de esa carpeta.
4. Configura `VITE_USE_MOCKS=false` y la URL HTTPS real en `VITE_API_BASE_URL`.
5. Aplica las reescrituras SPA de `Frontend/frontend/amplify-rewrites.json` en la consola de Amplify. Ese archivo no se importa automáticamente.
6. Verifica CORS para el dominio publicado y los encabezados `Content-Type` y `Authorization`.

La ruta `Frontend/frontend` distingue mayúsculas y minúsculas en la compilación de Linux. Debe coincidir con la configuración de la consola, tal como indica la [documentación de monorepositorios de Amplify](https://docs.aws.amazon.com/amplify/latest/userguide/monorepo-configuration.html).

Esta integración actualiza el código en CloudComputing-Project. No cambia la vinculación de una aplicación de Amplify que siga conectada al repositorio independiente cloudshop-frontend.

## Estructura

- `src/pages/`: catálogo, detalle, carrito, cuenta y administración.
- `src/components/`: navegación, formularios, tarjetas y paginación.
- `src/contexts/`: sesión y carrito compartidos.
- `src/services/`: cliente HTTP, caché y acceso a los microservicios.
- `src/hooks/`: acceso a contextos y estados de consulta.
- `src/styles.css`: estilos de la aplicación.

Las comprobaciones de esta integración se documentan en `frontend/VALIDACION.md`.
