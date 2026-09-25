# Validación del frontend integrado

## Integración desde cloudshop-frontend (2026-09-24)

- Origen: `Maxwell-CS/cloudshop-frontend`, commit `b99e5eed87cf2983f62d573d153bd134f5c3dd4f`.
- Los 37 archivos de código, recursos y configuración de la aplicación coinciden con el origen, normalizando únicamente los finales de línea.
- Instalación reproducible con `npm ci`: correcta; la auditoría de esta instalación reportó 0 vulnerabilidades.
- `npm run build` en modo de prueba: correcto.
- `npm run build` con `VITE_USE_MOCKS=false` y la URL HTTPS de API Gateway: correcto. Se genera `dist/assets/index-7DyElWol.js`.
- Los endpoints de órdenes y los seis reportes analíticos se contrastaron con las rutas y campos del backend del monorepositorio.
- La configuración de Amplify en la raíz y su copia en `Frontend/amplify.yml` apuntan a `Frontend/frontend`.
- No se modificaron `backend/`, `Ingesta/` ni `Data/`; no se incorporaron `.env`, dependencias ni artefactos de compilación al control de versiones.

Esta comprobación verifica la integración del código y su compilación. No ejecuta compras reales ni cambia la vinculación de repositorios o las variables de una aplicación existente en Amplify. Para desplegar desde este monorepositorio, consulta `../README.md`.

## Comprobaciones históricas de la primera entrega

- `npm install`: completado; auditoría reportó 0 vulnerabilidades.
- `npm run build`: correcto, salida en `dist`.
- Navegador local: catálogo con 6 productos, filtro Audio con 2 resultados, búsqueda sin resultados y limpieza de filtros.
- Login: rechazo de contraseña incorrecta y acceso con cuenta demo.
- Perfil: cambio de nombre y alta de dirección, con confirmaciones visibles.
- Registro: rechazo de contraseñas distintas; creación correcta y acceso al perfil.
- Cerrar sesión: vuelve al formulario de acceso.
- Revisión visual del catálogo en escritorio y a 390 px; detalle de producto a 390 px.
- Detalle: nombre, precio, 8 unidades y especificaciones correctas para el primer producto.
- Consola del navegador: sin errores registrados durante la revisión.

Límites: pruebas realizadas en modo demo. No se han verificado APIs reales, CORS ni un despliegue remoto de Amplify. Es necesario probarlos al integrar los microservicios. El archivo de reescrituras se debe aplicar en la consola Amplify.
