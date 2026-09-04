# Sustentación detallada de la arquitectura Data Science de CloudShop

![Arquitectura Data Science](CloudShop_Data_Science.png)

> **Documento base:** Proyecto Parcial de CS2032 – Cloud Computing, especialmente el requisito de Data Science de la página 10 y el diagrama integral solicitado en la página 11.

---

## 1. Objetivo de la plataforma analítica

La plataforma Data Science de CloudShop tiene como objetivo consolidar información que se encuentra distribuida en PostgreSQL, MySQL y MongoDB para responder preguntas de negocio mediante consultas SQL en AWS Athena.

La arquitectura no reemplaza a las bases operacionales. Cada base sigue atendiendo las operaciones diarias de su microservicio. La plataforma analítica recibe una copia de los datos para realizar cruces y agregaciones sin cargar el backend transaccional.

Ejemplos de preguntas que puede responder:

- ¿Cuál es el ticket promedio por ciudad?
- ¿Qué productos generan más ingresos?
- ¿Qué categorías venden más cada mes?
- ¿Qué clientes realizan más compras?
- ¿Existe relación entre la calificación de un producto y sus ventas?
- ¿Qué productos tienen alta demanda y poco stock?

---

## 2. Cómo se lee el diagrama

La imagen se interpreta de izquierda a derecha:

```text
Fuentes operacionales
        ↓
MV de ingesta con tres contenedores Python
        ↓
Archivos CSV y JSON en Amazon S3
        ↓
Catálogo de datos en AWS Glue
        ↓
Consultas SQL y vistas en AWS Athena
        ↓
Microservicio 5 de Consultas Analíticas
        ↓
Frontend de CloudShop
```

El diseño cumple la separación solicitada por el proyecto: tres fuentes, tres contenedores de ingesta, un bucket S3, un catálogo de datos, consultas en Athena y una API REST analítica.

---

# 3. Fuentes de datos

## 3.1 PostgreSQL: Usuarios

Contiene información como:

```text
usuarios
- id
- nombre
- email
- fecha_registro
- estado

direcciones_envio
- id
- usuario_id
- distrito
- ciudad
- pais
```

Estos datos permiten segmentar las ventas por usuario, ciudad o fecha de registro.

---

## 3.2 MySQL: Catálogo e Inventario

Contiene:

```text
categorias
productos
inventario
movimientos_stock
```

Estos datos permiten enriquecer las ventas con nombre de producto, categoría, precio de referencia y disponibilidad.

---

## 3.3 MongoDB: Ventas y Reseñas

Contiene documentos de:

```text
ordenes o ventas
resenas
```

Una venta puede contener un arreglo de ítems. Para que Athena pueda unir cada producto vendido con el catálogo, el contenedor de ingesta debe generar también una tabla plana de detalle de órdenes.

Ejemplo de transformación:

```json
{
  "orden_id": "ORD-10001",
  "usuario_id": 1520,
  "items": [
    {"producto_id": 320, "cantidad": 2, "subtotal": 379.80},
    {"producto_id": 150, "cantidad": 1, "subtotal": 89.90}
  ]
}
```

Se transforma en:

```text
orden_id,producto_id,cantidad,subtotal
ORD-10001,320,2,379.80
ORD-10001,150,1,89.90
```

Esta decisión hace viable la analítica porque evita trabajar directamente con arreglos anidados en todas las consultas.

---

# 4. Máquina virtual de ingesta

La arquitectura utiliza una EC2 llamada **MV ingesta**. En ella se ejecutan tres contenedores Docker desarrollados en Python.

```text
MV Ingesta
├── ingesta-usuarios
├── ingesta-catalogo
└── ingesta-ventas
```

Cada contenedor extrae el 100 % de los registros de una fuente, genera archivos y los carga en S3.

## 4.1 Contenedor `ingesta-usuarios`

**Fuente:** PostgreSQL  
**Archivos:**

```text
usuarios.csv
direcciones_envio.csv
```

## 4.2 Contenedor `ingesta-catalogo`

**Fuente:** MySQL  
**Archivos:**

```text
categorias.csv
productos.csv
inventario.csv
movimientos_stock.csv
```

## 4.3 Contenedor `ingesta-ventas`

**Fuente:** MongoDB  
**Archivos:**

```text
ordenes.json
detalle_ordenes.csv
resenas.json
```

### ¿Por qué tres contenedores y no uno?

- El proyecto exige tres contenedores Python.
- Cada origen utiliza una conexión y un formato diferente.
- Los errores de una fuente no obligan a detener las otras.
- Cada contenedor puede desarrollarse y probarse por separado.
- La responsabilidad queda alineada con un microservicio operacional.

### Estrategia pull del 100 %

Para la entrega, cada ejecución puede realizar:

```text
1. Conectarse a la base con credenciales de solo lectura.
2. Consultar todos los registros.
3. Validar columnas y tipos.
4. Generar CSV o JSON.
5. Cargar el archivo en S3.
6. Registrar un log con cantidad de filas y fecha de ejecución.
```

El requisito pide extraer el 100 % de los registros. Por eso esta primera versión no necesita implementar captura incremental de cambios.

---

# 5. Organización del bucket S3

Una estructura clara del bucket sería:

```text
s3://cloudshop-data-lake/
│
├── usuarios/
│   ├── usuarios.csv
│   └── direcciones_envio.csv
│
├── catalogo/
│   ├── categorias.csv
│   ├── productos.csv
│   ├── inventario.csv
│   └── movimientos_stock.csv
│
└── ventas/
    ├── ordenes.json
    ├── detalle_ordenes.csv
    └── resenas.json
```

También puede utilizarse una carpeta por fecha de ingesta:

```text
ventas/fecha_ingesta=2026-09-04/detalle_ordenes.csv
```

Para la entrega académica, la estructura simple es suficiente, siempre que los archivos estén separados y Glue pueda catalogarlos correctamente.

---

# 6. Catálogo de datos en AWS Glue

Glue registra el esquema de cada archivo y permite que Athena lo consulte como si fuera una tabla.

## Tablas esperadas

```text
usuarios
direcciones_envio
categorias
productos
inventario
movimientos_stock
ordenes
detalle_ordenes
resenas
```

El proyecto solicita un catálogo por cada archivo cargado. Por tanto, cada archivo debe quedar representado mediante una tabla del catálogo.

## Relaciones lógicas del catálogo

Aunque los datos provienen de motores diferentes, se pueden relacionar mediante identificadores compartidos:

```text
usuarios.id
   ├── direcciones_envio.usuario_id
   ├── ordenes.usuario_id
   └── resenas.usuario_id

ordenes.orden_id
   └── detalle_ordenes.orden_id

productos.id
   ├── detalle_ordenes.producto_id
   ├── inventario.producto_id
   ├── movimientos_stock.producto_id
   └── resenas.producto_id

categorias.id
   └── productos.categoria_id
```

Estas relaciones deben aparecer en el diagrama Entidad/Relación del catálogo de datos.

---

# 7. Contrato de datos necesario

Para que los cruces funcionen, el equipo debe acordar el formato de las claves antes de generar fake data.

| Campo | Tipo recomendado | Regla |
|---|---|---|
| `usuario_id` | `BIGINT` | Mismo valor en PostgreSQL y MongoDB |
| `producto_id` | `BIGINT` | Mismo valor en MySQL y MongoDB |
| `categoria_id` | `BIGINT` | Debe existir en `categorias` |
| `orden_id` | `VARCHAR` | Debe coincidir entre orden y detalle |
| `fecha_creacion` | `TIMESTAMP` o ISO 8601 | Un único formato |
| `cantidad` | `INTEGER` | Mayor que cero |
| `precio_unitario` | `DOUBLE` o `DECIMAL` | Mismo separador decimal |
| `subtotal` | `DOUBLE` o `DECIMAL` | Cantidad por precio |

Sin este contrato, los archivos pueden cargar correctamente en S3, pero las uniones de Athena fallarán o devolverán resultados incompletos.

---

# 8. Consultas SQL propuestas en Athena

Los nombres y tipos exactos deben adaptarse a las tablas creadas en Glue. Las siguientes consultas sirven como guía de implementación.

## Consulta 1: ticket promedio por ciudad

Une órdenes, usuarios y direcciones.

```sql
SELECT
    d.ciudad,
    COUNT(DISTINCT o.orden_id) AS cantidad_ordenes,
    ROUND(AVG(CAST(o.total AS DOUBLE)), 2) AS ticket_promedio
FROM cloudshop_analytics.ordenes o
JOIN cloudshop_analytics.usuarios u
    ON CAST(o.usuario_id AS BIGINT) = u.id
JOIN cloudshop_analytics.direcciones_envio d
    ON CAST(o.direccion_id AS BIGINT) = d.id
WHERE o.estado IN ('CONFIRMADA', 'ENVIADA', 'ENTREGADA')
GROUP BY d.ciudad
ORDER BY ticket_promedio DESC;
```

### Pregunta respondida

¿Qué ciudades tienen mayor ticket promedio?

---

## Consulta 2: productos y categorías con mayores ingresos

Une detalle de órdenes, órdenes, productos y categorías.

```sql
SELECT
    p.id AS producto_id,
    p.nombre AS producto,
    c.nombre AS categoria,
    SUM(d.cantidad) AS unidades_vendidas,
    ROUND(SUM(CAST(d.subtotal AS DOUBLE)), 2) AS ingresos
FROM cloudshop_analytics.detalle_ordenes d
JOIN cloudshop_analytics.ordenes o
    ON d.orden_id = o.orden_id
JOIN cloudshop_analytics.productos p
    ON CAST(d.producto_id AS BIGINT) = p.id
JOIN cloudshop_analytics.categorias c
    ON p.categoria_id = c.id
WHERE o.estado IN ('CONFIRMADA', 'ENVIADA', 'ENTREGADA')
GROUP BY p.id, p.nombre, c.nombre
ORDER BY ingresos DESC;
```

### Pregunta respondida

¿Qué productos y categorías generan mayores ingresos?

---

## Consulta 3: ventas por categoría y mes

Une órdenes, detalle de órdenes, productos y categorías.

```sql
SELECT
    DATE_TRUNC('month', o.fecha_creacion) AS mes,
    c.nombre AS categoria,
    SUM(d.cantidad) AS unidades_vendidas,
    ROUND(SUM(CAST(d.subtotal AS DOUBLE)), 2) AS ventas
FROM cloudshop_analytics.ordenes o
JOIN cloudshop_analytics.detalle_ordenes d
    ON o.orden_id = d.orden_id
JOIN cloudshop_analytics.productos p
    ON CAST(d.producto_id AS BIGINT) = p.id
JOIN cloudshop_analytics.categorias c
    ON p.categoria_id = c.id
GROUP BY DATE_TRUNC('month', o.fecha_creacion), c.nombre
ORDER BY mes, ventas DESC;
```

### Pregunta respondida

¿Cómo se comportan las categorías a lo largo del tiempo?

> Si Glue registra `fecha_creacion` como texto, deberá convertirse primero al tipo `TIMESTAMP`.

---

## Consulta 4: relación entre calificación y unidades vendidas

Une reseñas, productos y detalle de órdenes.

```sql
WITH ventas_por_producto AS (
    SELECT
        CAST(producto_id AS BIGINT) AS producto_id,
        SUM(cantidad) AS unidades_vendidas
    FROM cloudshop_analytics.detalle_ordenes
    GROUP BY CAST(producto_id AS BIGINT)
),
calificaciones AS (
    SELECT
        CAST(producto_id AS BIGINT) AS producto_id,
        ROUND(AVG(CAST(puntaje AS DOUBLE)), 2) AS calificacion_promedio,
        COUNT(*) AS cantidad_resenas
    FROM cloudshop_analytics.resenas
    GROUP BY CAST(producto_id AS BIGINT)
)
SELECT
    p.nombre AS producto,
    v.unidades_vendidas,
    c.calificacion_promedio,
    c.cantidad_resenas
FROM ventas_por_producto v
JOIN calificaciones c
    ON v.producto_id = c.producto_id
JOIN cloudshop_analytics.productos p
    ON v.producto_id = p.id
ORDER BY v.unidades_vendidas DESC;
```

### Pregunta respondida

¿Los productos mejor calificados son también los más vendidos?

---

# 9. Vistas propuestas en Athena

El proyecto exige al menos dos vistas.

## 9.1 Vista `vw_detalle_ventas`

Consolida cada ítem vendido con su producto y categoría.

```sql
CREATE VIEW cloudshop_analytics.vw_detalle_ventas AS
SELECT
    o.orden_id,
    o.usuario_id,
    o.fecha_creacion,
    o.estado,
    d.producto_id,
    p.nombre AS producto,
    c.nombre AS categoria,
    d.cantidad,
    d.precio_unitario,
    d.subtotal
FROM cloudshop_analytics.ordenes o
JOIN cloudshop_analytics.detalle_ordenes d
    ON o.orden_id = d.orden_id
JOIN cloudshop_analytics.productos p
    ON CAST(d.producto_id AS BIGINT) = p.id
JOIN cloudshop_analytics.categorias c
    ON p.categoria_id = c.id;
```

## 9.2 Vista `vw_valor_cliente`

Resume el comportamiento de compra por usuario.

```sql
CREATE VIEW cloudshop_analytics.vw_valor_cliente AS
SELECT
    u.id AS usuario_id,
    u.nombre,
    COUNT(DISTINCT o.orden_id) AS cantidad_ordenes,
    ROUND(SUM(CAST(o.total AS DOUBLE)), 2) AS gasto_total,
    ROUND(AVG(CAST(o.total AS DOUBLE)), 2) AS ticket_promedio,
    MAX(o.fecha_creacion) AS ultima_compra
FROM cloudshop_analytics.usuarios u
JOIN cloudshop_analytics.ordenes o
    ON u.id = CAST(o.usuario_id AS BIGINT)
GROUP BY u.id, u.nombre;
```

Estas vistas simplifican las consultas de la API analítica y constituyen evidencia directa del requisito.

---

# 10. Microservicio 5: Consultas Analíticas

El Microservicio 5 es una API REST desarrollada con Python y FastAPI. Su responsabilidad es ejecutar consultas en Athena y devolver resultados al frontend.

## Flujo

```text
React solicita /analitica/ticket-promedio
               ↓
API Gateway y balanceador
               ↓
Microservicio 5
               ↓
Athena ejecuta SQL
               ↓
Athena lee tablas catalogadas por Glue
               ↓
Glue apunta a archivos de S3
               ↓
Microservicio 5 devuelve JSON
               ↓
React dibuja tarjeta, tabla o gráfico
```

## Métodos REST sugeridos

```http
GET /analitica/ticket-promedio
GET /analitica/productos-mas-vendidos
GET /analitica/ventas-por-categoria
GET /analitica/ventas-por-ciudad
GET /analitica/calificacion-vs-ventas
GET /analitica/clientes-frecuentes
```

## Ejemplo de respuesta

```json
{
  "metrica": "ticket_promedio",
  "valor": 245.80,
  "moneda": "PEN",
  "fecha_datos": "2026-09-04T18:00:00Z"
}
```

El acceso a Athena debe otorgarse mediante un rol de IAM con permisos limitados. Las claves permanentes no deben incluirse en GitHub.

---

# 11. Por qué la arquitectura Data Science es viable

## 11.1 Viabilidad técnica

- Python dispone de conectores para PostgreSQL, MySQL, MongoDB y S3.
- Cada contenedor se ocupa de una fuente y puede probarse de forma aislada.
- CSV y JSON son formatos aceptados por el enunciado.
- Glue permite registrar el esquema de los archivos.
- Athena permite realizar las cuatro uniones SQL solicitadas.
- FastAPI puede entregar el resultado al frontend como JSON.

## 11.2 Viabilidad por volumen

El requisito mínimo de 20 000 registros por motor es manejable para una ingesta completa en un proyecto académico. No es necesario diseñar una plataforma de procesamiento masivo en tiempo real.

## 11.3 Viabilidad funcional

Los cruces generan métricas útiles para un e-commerce y no son consultas artificiales. Usuarios, direcciones, productos, categorías, órdenes y reseñas tienen claves naturales para relacionarse.

## 11.4 Viabilidad por alcance

La primera versión puede ejecutar la ingesta manualmente antes de la demostración. El proyecto no exige orquestación automática, streaming ni modelos de machine learning.

## 11.5 Viabilidad para la exposición

El recorrido es visible y verificable:

1. Mostrar filas en las tres bases.
2. Ejecutar los tres contenedores.
3. Mostrar los archivos en S3.
4. Mostrar las tablas de Glue.
5. Ejecutar cuatro consultas en Athena.
6. Mostrar dos vistas.
7. Consumir dos endpoints analíticos desde React.

---

# 12. Calidad y validación de datos

Cada contenedor debe generar un resumen de ejecución similar a:

```text
Fuente: MySQL
Tabla: productos
Registros extraídos: 1 000
Registros escritos: 1 000
Archivo: s3://cloudshop-data-lake/catalogo/productos.csv
Estado: OK
```

## Validaciones mínimas

- Cantidad extraída igual a cantidad escrita.
- IDs obligatorios no nulos.
- Productos de `detalle_ordenes` existentes en `productos`.
- Usuarios de `ordenes` existentes en `usuarios`.
- Subtotal igual a cantidad por precio, con tolerancia de redondeo.
- Fechas en formato consistente.
- Archivos UTF-8.
- Encabezados estables en CSV.
- Sin claves secretas en el código.

---

# 13. Riesgos y mitigaciones

| Riesgo | Consecuencia | Mitigación |
|---|---|---|
| IDs incompatibles entre motores | Joins vacíos | Contrato de datos y generador de fake data coordinado |
| MongoDB conserva ítems anidados | Consultas complejas | Generar `detalle_ordenes.csv` plano |
| Glue infiere tipos incorrectos | Errores en Athena | Revisar esquema y definir tipos explícitos |
| CSV con comas dentro del texto | Columnas desplazadas | Usar librería CSV y comillas correctas |
| Fechas como texto inconsistente | No se agrupa por mes | ISO 8601 y conversión en Glue/Athena |
| Duplicación al ejecutar la ingesta | Métricas infladas | Sobrescribir ruta o usar una carpeta de ejecución controlada |
| Athena no encuentra archivos | Consulta sin datos | Verificar ubicación S3 y permisos del rol |
| Datos operacionales cambian después de ingesta | Indicadores desactualizados | Indicar fecha de corte y ejecutar ingesta antes de la demo |
| API espera demasiado | Mala experiencia | Consultas simples, límite de resultados y timeout controlado |

---

# 14. Limitaciones reconocidas

- La estrategia pull del 100 % no es eficiente para volúmenes empresariales muy grandes.
- La información analítica no es necesariamente en tiempo real.
- CSV no ofrece las mismas optimizaciones que formatos columnares.
- La calidad de las métricas depende de mantener identificadores consistentes.
- La plataforma no incluye un modelo predictivo; el proyecto solicita analítica SQL.

Estas limitaciones no invalidan la propuesta. El diseño está ajustado al alcance y a los entregables solicitados.

---

# 15. Evidencias que deben mostrarse

## MV de ingesta

- EC2 creada.
- Tres contenedores en ejecución.
- Código Python en repositorio público.
- Logs de extracción y carga.

## S3

- Bucket creado.
- Archivos CSV y JSON visibles.
- Archivos correspondientes a las tres fuentes.
- Cantidad de registros verificable.

## Glue

- Una tabla por cada archivo.
- Columnas y tipos revisados.
- Ubicación S3 correcta.
- Diagrama de relaciones del catálogo.

## Athena

- Cuatro consultas que unan varias tablas.
- Resultados visibles.
- Dos vistas creadas.
- Historial o capturas de ejecución.

## API y frontend

- Swagger del Microservicio 5.
- Dos endpoints analíticos funcionando.
- Resultados JSON.
- Tarjetas, tabla o gráfico visible en React.

---

# 16. Guion de sustentación oral

> La arquitectura de Data Science consolida la información de los tres microservicios que poseen base de datos. PostgreSQL contiene usuarios y direcciones; MySQL contiene categorías, productos e inventario; y MongoDB contiene ventas y reseñas.
>
> Creamos una máquina virtual de ingesta con tres contenedores Python. Cada contenedor se conecta a una sola fuente, extrae el cien por ciento de sus registros, genera archivos CSV o JSON y los carga en un bucket S3. Para MongoDB generamos adicionalmente `detalle_ordenes.csv`, porque las órdenes contienen arreglos de productos y necesitamos una fila por ítem para facilitar las uniones en Athena.
>
> Luego registramos cada archivo como una tabla en AWS Glue. Aunque las tablas provienen de motores diferentes, se relacionan mediante `usuario_id`, `producto_id`, `categoria_id` y `orden_id`. Estas relaciones se documentan en un diagrama del catálogo de datos.
>
> Athena utiliza las tablas de Glue para ejecutar las consultas SQL. Mostraremos, como mínimo, ticket promedio por ciudad, productos con mayores ingresos, ventas por categoría y mes, y relación entre calificación y unidades vendidas. También crearemos dos vistas: una de detalle de ventas y otra de valor del cliente.
>
> Finalmente, el Microservicio 5 ejecuta estas consultas y devuelve los resultados como JSON. La aplicación React consume por lo menos dos de sus métodos y presenta los resultados mediante indicadores o gráficos.
>
> Esta propuesta es viable porque trabaja con un volumen controlado, utiliza una ingesta por lotes acorde con el enunciado y no requiere construir infraestructura de streaming o modelos predictivos. El punto crítico es mantener IDs y tipos consistentes entre los tres orígenes, por eso definimos un contrato de datos antes de generar los registros ficticios.

---

# 17. Preguntas probables del profesor

### ¿Por qué se copian los datos a S3 y no se consulta directamente las bases?

Porque el objetivo es consolidar información de tres motores y ejecutar analítica sin cargar los servicios transaccionales. Además, el enunciado exige S3, Glue y Athena.

### ¿Por qué generar `detalle_ordenes.csv`?

Porque cada documento de MongoDB puede contener varios productos. El archivo plano crea una fila por producto vendido y facilita los joins con `productos` y `categorias`.

### ¿Cómo se relacionan tablas de bases diferentes?

Mediante IDs compartidos. Por ejemplo, `ordenes.usuario_id` corresponde a `usuarios.id` y `detalle_ordenes.producto_id` corresponde a `productos.id`.

### ¿La ingesta es incremental?

No en esta entrega. El requisito indica una estrategia pull del 100 % de los registros. La ingesta incremental sería una mejora futura.

### ¿Las métricas están en tiempo real?

No necesariamente. Representan la última ejecución de la ingesta. La API debe devolver o mostrar la fecha de corte.

### ¿Qué ocurre si Glue interpreta mal una columna?

El equipo debe revisar el esquema, corregir el tipo y volver a ejecutar la consulta. No se debe confiar únicamente en la inferencia automática.

### ¿Por qué utilizar CSV y JSON?

Porque son los formatos solicitados o aceptados por el proyecto y permiten evidenciar claramente la extracción desde las tres fuentes.

### ¿Dónde se ejecutan las consultas?

En Athena. El Microservicio 5 envía la consulta, espera su finalización y devuelve al frontend el resultado procesado.

---

# 18. Conclusión

La arquitectura Data Science de CloudShop cumple el flujo solicitado: una MV de ingesta, tres contenedores Python, extracción completa, archivos en S3, catálogo Glue, cuatro consultas con uniones, dos vistas en Athena y una API analítica consumida por el frontend.

Su viabilidad depende principalmente de tres decisiones: generar datos coherentes entre motores, aplanar el detalle de las órdenes y demostrar con evidencia cada etapa del recorrido. Con esas condiciones, la plataforma es realizable dentro del alcance del proyecto y fácil de sustentar durante la demostración.
