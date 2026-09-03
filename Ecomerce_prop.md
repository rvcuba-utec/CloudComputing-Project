
---

### Propuesta: "Tech-Store Cloud"
*Un ecosistema completo de comercio electrónico para productos tecnológicos.*

#### 1. Backend: Los 5 Microservicios (en Docker)
Para cumplir con los **3 lenguajes** y **3 bases de datos** (2 SQL, 1 NoSQL):

1.  **Microservicio de Usuarios (Python + PostgreSQL - SQL):**
    *   *Función:* Registro, login y perfiles.
    *   *Tablas (Mín. 2 relacionadas):* `Usuarios` y `Direcciones_Envio`.
2.  **Microservicio de Inventario (Java/Spring Boot + MySQL - SQL):**
    *   *Función:* Catálogo de productos disponibles.
    *   *Tablas (Mín. 2 relacionadas):* `Productos` y `Categorias`.
3.  **Microservicio de Reseñas y Comentarios (Node.js + MongoDB - NoSQL):**
    *   *Función:* Almacena opiniones de clientes sobre los productos. Al ser NoSQL, permite que cada reseña tenga campos diferentes (ej: unas con fotos, otras con solo estrellas).
    *   *Estructura:* Documentos JSON.
4.  **Microservicio de Órdenes (Python - Sin Base de Datos):**
    *   *Función:* Actúa como orquestador.
    *   *Requisito:* **Consume otros microservicios**. Para crear una orden, este servicio llama al de *Inventario* (para ver si hay stock) y al de *Usuarios* (para validar quién compra).
5.  **Microservicio Analítico (Python + AWS Athena):**
    *   *Función:* Consultas de negocio de alto nivel (ej: "¿Cuál es el ticket promedio de venta?"). Ejecuta queries directamente sobre los datos procesados en S3.

---

#### 2. Data Science: El flujo de analítica
Aquí es donde procesas los datos para que el Microservicio 5 funcione:

*   **Ingesta (Estrategia Pull):** Programarás 3 contenedores en Python dentro de tu **MV Ingesta**. Cada uno entrará a las bases de datos de Usuarios, Inventario y Reseñas, extraerá los **20,000 registros** y los subirá como archivos `.csv` a un **Bucket S3**.
*   **AWS Glue:** Creará el catálogo de estos archivos. Debes hacer el **Diagrama Entidad/Relación** que pida la rúbrica uniendo estas tablas.
*   **Consultas en Athena (Evidencia):** Deberás mostrar, por ejemplo:
    1.  Productos más vendidos por categoría.
    2.  Usuarios que más dinero han gastado.
    3.  Relación entre el precio del producto y la calificación en las reseñas.
    4.  Top 5 categorías con mejor reputación.

---

#### 3. Frontend: La cara del E-commerce
Desplegado en **AWS Amplify**, debe mostrar:
*   **Página de Inicio:** Lista de productos (consume Microservicio de Inventario).
*   **Detalle del Producto:** Muestra descripción y comentarios (consume Microservicio de Reseñas).
*   **Carrito/Checkout:** Crea la compra (consume Microservicio de Órdenes).
*   **Panel de Administración:** Gráficos estadísticos (consume Microservicio Analítico/Athena).

---

### ¿Cómo cumplir con los 20,000 registros?
No los escribas a mano. Usa un script de Python con la librería `Faker` para el **Microservicio de Inventario** y el de **Usuarios**:
*   Genera 5,000 usuarios ficticios.
*   Genera 5,000 productos.
*   Genera 10,000 reseñas.
*   *Total:* Tienes tus 20,000 registros listos para la ingesta.

---

### Arquitectura de Infraestructura (Lo que dibujarás en Draw.io)
Para que no te bajen puntos, tu diagrama debe verse así:
1.  **Capa Pública:** AWS Amplify (Frontend) comunicándose con **AWS Api Gateway**.
2.  **Capa de Aplicación (Subred Privada):** 2 Máquinas Virtuales con Docker Compose corriendo los 5 microservicios, detrás de un **Balanceador de Carga**.
3.  **Capa de Datos (Subred Privada):** 1 Máquina Virtual con MySQL, PostgreSQL y MongoDB.
4.  **Capa de Datos Cloud:** Bucket S3, AWS Glue y AWS Athena conectados a la MV de Ingesta.

### ¿Por qué esta propuesta es segura para ganar los 20 puntos?
1.  **Complejidad:** Usar Java, Python y Node.js demuestra dominio técnico.
2.  **Variedad de Datos:** Cumples con SQL y NoSQL.
3.  **Integración:** El microservicio de órdenes que consume a otros cumple el requisito más difícil del backend.
4.  **Escalabilidad:** El uso de Balanceador de Carga y Api Gateway es el estándar profesional que pide la rúbrica.

**Siguiente paso recomendado:** Define con tu grupo quién instalará Docker en las máquinas virtuales de AWS y quién empezará a escribir el script para generar los 20,000 datos falsos. ¡Eso es clave para el primer avance!