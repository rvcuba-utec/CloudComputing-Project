# CloudShop — Guía de pruebas y verificación

> Guía práctica para verificar que el sistema funciona de extremo a extremo.
> Asume que la infraestructura ya está desplegada (ver `DESPLIEGUE_AWS_MANUAL.md` o `DESPLIEGUE_AWS_CONSOLA.md`).
>
> Variables que necesitarás:
> - `ALB` = DNS del Application Load Balancer (ej. `http://cloudshop-alb-1234.us-east-1.elb.amazonaws.com`)
> - `BUCKET` = nombre de tu bucket S3 (ej. `cloudshop-data-lake-2026-utec-mr-cs2032-v2`)

---

## 1. Verificar que los microservicios están vivos

Desde una de las VMs de aplicación (vía SSH o EC2 Instance Connect):

```bash
for p in 8000 8080 8001 8002 8003; do
  echo -n "Puerto $p: "
  curl -s http://localhost:$p/health
  echo
done
```

Todos deben responder `{"status":"ok"}` o similar. Si alguno falla: `docker compose ps` y `docker compose logs <servicio>`.

Desde fuera (usando el ALB):

```bash
curl -s $ALB/usuarios/health
curl -s $ALB/api/catalogo/health
curl -s $ALB/analitica/health
# (ventas y ordenes no tienen ruta /health directa en el ALB por path-routing)
```

---

## 2. Disparar la ingesta manualmente

Conecta a `cloudshop-mv-ingesta` (SSH o EC2 Instance Connect):

```bash
cd /home/ubuntu/cloudshop/Ingesta
docker compose up
```

Los 3 contenedores corren y terminan solos. Verifica los logs:

```bash
docker compose logs
```

Debes ver algo como:
```
OK | tabla=productos          | filas=5699  | destino=s3://BUCKET/productos/productos.csv
OK | tabla=movimientos_stock  | filas=25000 | destino=s3://BUCKET/movimientos_stock/...
OK | coleccion=ventas→ordenes | docs=12000  | destino=s3://BUCKET/ordenes/ordenes.json
OK | coleccion=resenas        | docs=12000  | destino=s3://BUCKET/resenas/resenas.json
```

### Verificar que los archivos llegaron a S3

```bash
aws s3 ls s3://$BUCKET/ --recursive --human-readable
```

Deben aparecer 9 archivos (o más si ya había datos previos):
```
usuarios/usuarios.csv
direcciones_envio/direcciones_envio.csv
categorias/categorias.csv
productos/productos.csv
inventario/inventario.csv
movimientos_stock/movimientos_stock.csv
ordenes/ordenes.json
detalle_ordenes/detalle_ordenes.csv
resenas/resenas.json
```

---

## 3. Probar los endpoints (Postman o curl)

Reemplaza `$ALB` con el DNS del ALB en todos los comandos.

### 3.1 Registro e inicio de sesión

```bash
# Registrar usuario normal
curl -s -X POST $ALB/usuarios/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Test User","email":"test@example.com","password":"password123"}' | jq

# Login → guarda el token
TOKEN=$(curl -s -X POST $ALB/usuarios/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq -r '.access_token')

echo "Token: $TOKEN"
```

### 3.2 Registrar admin (usa un email en ADMIN_EMAILS)

```bash
# Reemplaza admin@ejemplo.com por el email que pusiste en ADMIN_EMAILS del .env
ADMIN_TOKEN=$(curl -s -X POST $ALB/usuarios/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ejemplo.com","password":"tupassword"}' | jq -r '.access_token')
```

### 3.3 Catálogo de productos

```bash
# Listar productos (público)
curl -s "$ALB/api/catalogo/productos?page=1&limit=5" | jq '.data | length'

# Detalle de un producto
curl -s $ALB/api/catalogo/productos/1 | jq '{id,nombre,precio,stock}'

# Crear producto (admin only) — debe dar 201
curl -s -X POST $ALB/api/catalogo/productos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"categoria_id":1,"sku":"TEST-001","nombre":"Producto de prueba","precio":99.99,"imagen_url":"https://ejemplo.com/img.jpg"}' | jq

# Intentar crear producto con usuario normal — debe dar 403
curl -s -X POST $ALB/api/catalogo/productos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"categoria_id":1,"sku":"TEST-002","nombre":"No debería crearse","precio":1.00}' | jq
```

### 3.4 Flujo de compra completo

```bash
# 1. Ver stock del producto 1
curl -s $ALB/api/catalogo/productos/1 | jq '{id,nombre,stock}'

# 2. Previsualizar orden
curl -s -X POST $ALB/ordenes/previsualizar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"producto_id":1,"cantidad":1}]}' | jq

# 3. Confirmar compra
VENTA_ID=$(curl -s -X POST $ALB/ordenes/confirmar \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"producto_id":1,"cantidad":1}]}' | jq -r '.data._id')

echo "Venta creada: $VENTA_ID"

# 4. Ver estado de la orden
curl -s $ALB/ordenes/$VENTA_ID/estado -H "Authorization: Bearer $TOKEN" | jq

# 5. Ver historial de compras del usuario
curl -s "$ALB/usuarios/$(curl -s $ALB/usuarios/me -H "Authorization: Bearer $TOKEN" | jq -r '.id')/ventas" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length'
```

### 3.5 Reseñas

```bash
# Ver reseñas de un producto (público)
curl -s $ALB/productos/1/resenas | jq '{total,promedio}'

# Dejar una reseña (usuario autenticado)
curl -s -X POST $ALB/productos/1/resenas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"calificacion":5,"comentario":"Excelente producto"}' | jq

# Intentar reseñar el mismo producto dos veces — debe dar 409
curl -s -X POST $ALB/productos/1/resenas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"calificacion":3,"comentario":"Segundo intento"}' | jq '.error.code'
# Esperado: "RESENA_DUPLICADA"
```

### 3.6 Analítica (solo admin)

```bash
curl -s $ALB/analitica/ticket-promedio        -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'
curl -s $ALB/analitica/productos-mas-vendidos  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'
curl -s $ALB/analitica/ventas-por-categoria    -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'
curl -s $ALB/analitica/ventas-por-ciudad       -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'
curl -s $ALB/analitica/calificacion-vs-ventas  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'
curl -s $ALB/analitica/clientes-frecuentes     -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.data | length'

# Con usuario normal debe dar 403
curl -s $ALB/analitica/ticket-promedio -H "Authorization: Bearer $TOKEN" | jq '.detail'
```

---

## 4. Verificar Athena

En la consola AWS → Athena → Query editor → base `cloudshop_analytics`:

```sql
-- Conteos de cada tabla
SELECT COUNT(*) FROM cloudshop_analytics.usuarios;           -- ~20000
SELECT COUNT(*) FROM cloudshop_analytics.productos;          -- ~5699
SELECT COUNT(*) FROM cloudshop_analytics.ordenes;            -- variable
SELECT COUNT(*) FROM cloudshop_analytics.resenas;            -- variable
```

Si devuelven 0 filas: la ingesta no corrió o los archivos no llegaron a S3. Vuelve al paso 2.

---

## 5. Verificar Security Groups (bases de datos privadas)

Desde **tu laptop** (no desde una VM):

```bash
# Estos comandos deben FALLAR o quedarse colgados (timeout):
nc -z -w5 <IP-PUBLICA-MV-DATOS> 3306   && echo "ABIERTO (MAL)" || echo "CERRADO (bien)"
nc -z -w5 <IP-PUBLICA-MV-DATOS> 5432   && echo "ABIERTO (MAL)" || echo "CERRADO (bien)"
nc -z -w5 <IP-PUBLICA-MV-DATOS> 27017  && echo "ABIERTO (MAL)" || echo "CERRADO (bien)"
```

---

## 6. Flujo completo en el frontend (Amplify)

1. Abrir la URL de Amplify en el navegador.
2. Registrar un usuario nuevo → verificar que el login funciona.
3. Navegar al catálogo → abrir el detalle de un producto.
4. Hacer una compra (botón "Comprar").
5. Ir al perfil → "Mis compras" → verificar que aparece la orden.
6. Volver al producto → dejar una reseña.
7. Cerrar sesión → iniciar sesión con el usuario admin → abrir `/admin`.
8. En el panel admin: crear un producto, editarlo, desactivarlo.
9. Ir a la pestaña "Analítica" del panel admin → verificar que las 6 gráficas/tablas cargan.

---

## 7. Después de crear datos nuevos via Postman/Frontend → refrescar S3

Si creaste productos, hiciste compras o dejaste reseñas y quieres que esos datos aparezcan en Athena/Analítica:

```bash
# En cloudshop-mv-ingesta:
cd /home/ubuntu/cloudshop/Ingesta
docker compose up
```

Espera a que terminen los 3 contenedores y luego las consultas de Athena ya devuelven los datos actualizados.
