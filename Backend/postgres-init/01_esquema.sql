-- Esquema de cloudshop_usuarios (PostgreSQL).
-- Espejo de los modelos SQLAlchemy de Backend/users-address/app/models,
-- para poder cargar datos con load_csv_bd.py ANTES de levantar la app.
-- El servicio también ejecuta create_all al arrancar (no-op si ya existen).

CREATE TABLE IF NOT EXISTS usuarios (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(120)  NOT NULL,
    email          VARCHAR(180)  NOT NULL,
    password_hash  VARCHAR(255)  NOT NULL,
    estado         VARCHAR(20)   NOT NULL DEFAULT 'activo',
    creado_en      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_usuarios_email ON usuarios (email);

CREATE TABLE IF NOT EXISTS direcciones_envio (
    id           SERIAL PRIMARY KEY,
    usuario_id   INTEGER       NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    direccion    VARCHAR(255)  NOT NULL,
    distrito     VARCHAR(120)  NOT NULL,
    ciudad       VARCHAR(120)  NOT NULL,
    pais         VARCHAR(80)   NOT NULL,
    es_principal BOOLEAN       NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS ix_direcciones_envio_usuario_id ON direcciones_envio (usuario_id);
