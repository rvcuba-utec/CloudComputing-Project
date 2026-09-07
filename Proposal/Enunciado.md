# Enunciado — Proyecto Parcial Cloud Computing

> **Fuente:** Presentación `CS2032 - Cloud Computing (Ciclo 2026-2)`.
> **Documentado a partir de:** Diapositivas 01–04 (Lote 1 de 4).

---

## Lote 1 — Diapositivas 1 a 4

### Diapositiva 1 — Portada

- **Universidad:** UTEC — Universidad de Ingeniería y Tecnología (logotipo institucional).
- **Curso:** CS2032 - Cloud Computing (Ciclo 2026-2).
- **Título del documento:** Proyecto Parcial.
- **Alcance temporal:** Semana 3 a Semana 6 (Exposición en Semana 7).
- **Elaborado por:** Geraldo Colchado y Oscar Mejía.

> Esta presentación constituye el enunciado oficial del Proyecto Parcial del curso.

---

### Diapositiva 2 — Agenda (sección 1 resaltada)

**Agenda — Proyecto Parcial**

1. **Competencias a lograr** *(sección activa/destacada en naranja)*
2. Enunciado y Rúbrica
3. Entregables y Plazo

---

### Diapositiva 3 — Competencias a lograr

**Competencias a lograr**
*Por el alumno al finalizar el proyecto parcial*

> **Competencia:**
>
> *4.1: Crea, selecciona, adapta y aplica técnicas, recursos y herramientas modernas para la práctica de la computación y comprende sus limitaciones. (nivel 3).*

---

### Diapositiva 4 — Agenda (sección 2 resaltada)

**Agenda — Proyecto Parcial**

1. Competencias a lograr
2. **Enunciado y Rúbrica** *(sección activa/destacada en naranja)*
3. Entregables y Plazo

---

## Lote 2 — Diapositivas 5 a 8

### Diapositiva 5 — Enunciado y Rúbrica

**Enunciado y Rúbrica — Proyecto Parcial**

La diapositiva se divide en dos columnas: requisitos de la solución (izquierda) y rúbrica de evaluación (derecha).

**Columna izquierda — Requisitos del proyecto**

- **Equipo de trabajo:** Cada proyecto debe desarrollarse en **grupos de máximo 5 integrantes**.
- **Funcionalidad a implementar:** Los equipos tienen libertad para elegir la solución a desarrollar.
- **Avance obligatorio:** Cada grupo debe presentar un **avance mínimo del 50% en cada parte del proyecto** durante una **asesoría con los ACLs**. El avance esperado corresponde a:
  - **Back-End:** microservicios implementados parcialmente, con al menos una base de datos conectada y funcionando.
  - **Front-End:** página web inicial en AWS Amplify que consuma al menos un microservicio con un par de métodos REST.
  - **Data Science:** máquina virtual de ingesta configurada, bucket S3 creado y al menos un contenedor de ingesta funcionando con datos cargados en S3.

**Columna derecha — Rúbrica**

| Componente | Puntaje |
|---|---|
| **Backend:** Microservicios | 7 puntos |
| **Frontend:** Web | 3 puntos |
| **Data Science** | 5 puntos |
| Diagrama de Arquitectura Solución | 1 punto |
| Exposición presencial | 1 punto |
| Exposición virtual con ACL | 3 puntos |

> **Nota importante:** Si no se presenta a la exposición presencial, su evaluación será **desaprobatoria (sobre nota 10 como máximo)**.

---

### Diapositiva 6 — Ejemplo: Backend y Frontend

**Ejemplo - Backend y Frontend**

> Subtítulo: *Incluye Api Gateway, Balanceador Carga y 2 MV*

**Diagrama de arquitectura (flujo de datos):**

1. **Front-end — UI: User Interface**
   - Servicio **AWS Amplify** que hospeda la **Página Web de Clínica** (React javascript, Single-page application — SPA).
2. La página web se conecta a través de **Api Gateway (https)**.
3. El tráfico pasa por un **Balanceador de carga**.
4. El balanceador distribuye las peticiones hacia **2 Máquinas Virtuales** que contienen 5 microservicios:

| Microservicio | Api Rest | Lenguaje | Base de datos / Backend |
|---|---|---|---|
| Microservicio 1 | Api Rest **Pacientes** | python | **MySQL** |
| Microservicio 2 | Api Rest **Consultas Médicas** | java | **PostgreSQL** |
| Microservicio 3 | Api Rest **Exámenes Laboratorio** | node.js | **MongoDB** |
| Microservicio 4 | Api Rest **Historias Clínicas** | python | (sin BD — consume otros microservicios; enlaces azules hacia MS 1, 2 y 3) |
| Microservicio 5 | Api Rest **Consultas Analíticas** | python | **Consultas SQL (Athena)** — usa **AWS credentials** |

> **Nota del diagrama:** Los microservicios 1, 2 y 3 tienen su propia base de datos (MySQL, PostgreSQL, MongoDB). El microservicio 4 no tiene base de datos y consume los microservicios 1, 2 y 3 (flechas azules). El microservicio 5 consulta datos analíticos vía **Athena** con credenciales AWS. La sección derecha del diagrama se etiqueta como **Back-end**.

---

### Diapositiva 7 — Ejemplo: Data Science

**Ejemplo - Data Science**

> Subtítulo: *Incluye Api Rest Consultas Analíticas*

**Diagrama de flujo (etapas secuenciales de datos):**

| Etapa | Componentes |
|---|---|
| **Fuentes de datos** | **MySQL** (Microservicio 1), **PostgreSQL** (Microservicio 2), **MongoDB** (Microservicio 3) |
| **Ingesta de datos** | **Contenedor ingesta01** (dato naranja), **Contenedor ingesta02** (dato verde), **Contenedor ingesta03** (dato amarillo) — todos dentro de la **Máquina Virtual Ingesta** |
| **Almacenamiento** | **Bucket S3** (recibe los tres contenedores de ingesta) |
| **Analítica de datos** | **Catálogo de Datos (Glue)** y **Consultas SQL (Athena)** |
| **Consumo** | **Api Rest Consultas Analíticas** (python) con **AWS credentials** → **Microservicio 5** |

> **Relaciones del flujo:** Cada base de datos fuente (MySQL, PostgreSQL, MongoDB) alimenta su contenedor de ingesta correspondiente (ingesta01, ingesta02, ingesta03). Los tres contenedores vuelcan sus datos en el **Bucket S3**. El **Catálogo de Datos (Glue)** y las **Consultas SQL (Athena)** operan sobre el bucket S3. Finalmente, el **Api Rest Consultas Analíticas** (Microservicio 5) ejecuta las consultas analíticas usando credenciales AWS.

---

### Diapositiva 8 — Enunciado: Backend - Microservicios

**Enunciado — Backend: Microservicios**

Debe implementar **5 microservicios en docker**:

1. **3 microservicios cada uno con su propia base de datos.** Debe usar **3 lenguajes de programación diferentes** y **3 bases de datos diferentes (2 SQL y 1 No SQL)**. Debe presentar un **diagrama Entidad/Relación** de todas las tablas por cada base de datos SQL y las **estructuras json** de la base de datos No SQL. Cada base de datos SQL debe tener como mínimo **2 tablas relacionadas**. Al menos **1 microservicio debe consumir otro microservicio** (Ejemplo: Api Rest Consultas Médicas).
2. **1 microservicio que no tenga base de datos** y sólo consuma otros microservicios (Ejemplo: Api Rest Historias Clínicas).
3. **1 microservicio analítico** (Ejemplo: Api Rest Consultas Analíticas) que ejecute queries con **Athena**.

**Datos de prueba:** Debe insertar masivamente, por única vez, datos ficticios (**fake data**) en al menos 1 tabla de cada base de datos (**Mínimo 20,000 registros**).

**Despliegue:**
- Debe realizar el despliegue con **docker compose** en **2 Máquinas Virtuales de Producción** con **balanceador de carga (privado, no público)**.
- Deben exponerse las Api **públicamente con https** con el servicio **AWS Api Gateway** (Debe investigarlo).
- Las bases de datos de los microservicios deben estar en una **tercera Máquina Virtual** y deben ser **privadas (no públicas)**.

**Documentación:** Debe documentar las **5 api** para visualizarlas en **swagger-ui**.

**Repositorios:** Debe incluir enlaces a **repositorios públicos de github** con los fuentes.

---

---

## Lote 3 — Diapositivas 9 a 12

### Diapositiva 9 — Enunciado: Frontend - Web

**Enunciado — Frontend: Web**

**Aplicación Web**

- Desarrollar una **página web (UI)** que consuma **los 5 microservicios** incluyendo el **Api Rest Consultas Analíticas** (Por ejemplo: **Estadística de Exámenes de Laboratorio por Especialidad de Consultas Médicas y Rango de Edades de Pacientes**).
- De cada Microservicio consultado se deben invocar **al menos 2 métodos REST**.
- La aplicación debe desplegarse en **AWS Amplify**.

**Tecnología**

- Se puede utilizar **cualquier lenguaje o framework web moderno** que permita integrar APIs y construir interfaces interactivas.

**Entregables**

- Incluir enlaces a los **repositorios públicos de GitHub** con el código fuente.

---

### Diapositiva 10 — Enunciado: Data Science - Analytics

**Enunciado — Data Science: Analytics**

- Debe crear una máquina virtual **"MV ingesta"**.
- Debe crear un **bucket S3** para almacenar los archivos de la ingesta de datos.
- Debe implementar **3 contenedores docker** en **python** para la ingesta de datos con **estrategia pull del 100%** de los registros de las tablas. Cada contenedor ingerirá la data de **1 microservicio** y generará archivos **csv o json** que cargue en el **bucket S3**.
- Debe implementar un **catálogo de datos** en **AWS Glue** por cada archivo que cargue al bucket S3. Debe crear un **diagrama Entidad / Relación** que relacione **todas las tablas** del catálogo de datos.
- Debe mostrar evidencia de como mínimo **4 consultas SQL** que unan varias tablas con **AWS Athena** y crear como mínimo **2 vistas**.
- Debe incluir enlaces a **repositorios públicos de github** con los fuentes.

---

### Diapositiva 11 — Enunciado: Diagrama de Arquitectura de Solución

**Enunciado — Diagrama de Arquitectura de Solución**

- Debe elaborar un **Diagrama de Arquitectura de Solución** en **draw.io** que incluya todos los servicios de **AWS** utilizados de:
  - **Backend**
  - **Frontend**
  - **Data Science**

---

### Diapositiva 12 — Agenda (sección 3 resaltada)

**Agenda — Proyecto Parcial**

1. Competencias a lograr
2. Enunciado
3. **Entregables y Plazo** *(sección activa/destacada en naranja)*

---

## Lote 4 — Diapositiva 13

### Diapositiva 13 — Entregables y Plazo

**Entregables y Plazo**

> Subtítulo: *Grupos de máximo 5 personas*

La diapositiva presenta una tabla de dos columnas que cruza los **entregables** con su **plazo** (fechas límite resaltadas en cian):

| Entregables | Plazo (Fin de Semana 6) |
|---|---|
| • **Hito 1:** Exposición virtual revisada por el ACL (3 puntos de la nota final). | **Hito 1:** Máximo hasta **Sáb 12-Set 23:59h** *(ACL coordinará fecha de exposición virtual)* |
| • **Hito 2:** Exposición presencial y demo revisada por el profesor (17 puntos de la nota final) - Semana 7 | **Hito 2:** **Dom 20-Set 23:59h** *(Subir en Canvas)* |
| • Informe en word o pdf con evidencia de todo lo solicitado. | **Exposición presencial:** Semana 7 *(Docente publicará horario para cada grupo)* |
| • Resumen en power point con todo lo solicitado. | |

> **Notas de la diapositiva:**
> - Los plazos de los **Hitos 1 y 2** (Sáb 12-Set 23:59h y Dom 20-Set 23:59h, respectivamente) aparecen **resaltados en cian** como fechas límite destacadas.
> - **Hito 1 (Exposición virtual con ACL):** vale **3 puntos** de la nota final y la fecha de la exposición la coordina el ACL.
> - **Hito 2 (Exposición presencial y demo):** vale **17 puntos** de la nota final, se realiza en la **Semana 7** y se sube a **Canvas**.
> - **Entregables documentales:** el informe puede entregarse en **Word o PDF** con la evidencia de todo lo solicitado, y se requiere además un **resumen en PowerPoint** con todo lo solicitado.
> - La **exposición presencial** ocurre en la **Semana 7**; el docente publicará el horario asignado a cada grupo.

---

*Fin de la documentación del enunciado (Diapositivas 01–13).*
