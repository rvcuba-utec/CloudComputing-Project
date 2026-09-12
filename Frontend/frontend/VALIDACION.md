# Validación de esta entrega

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
