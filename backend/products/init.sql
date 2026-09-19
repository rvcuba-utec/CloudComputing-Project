CREATE DATABASE IF NOT EXISTS cloudshop_catalogo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cloudshop_catalogo;

CREATE TABLE categorias (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nombre      VARCHAR(100)  NOT NULL,
  descripcion VARCHAR(255)  NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categorias_nombre (nombre)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE productos (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  categoria_id  INT UNSIGNED  NOT NULL,
  sku           VARCHAR(50)   NOT NULL,
  nombre        VARCHAR(150)  NOT NULL,
  descripcion   TEXT          NULL,
  marca         VARCHAR(80)   NULL,
  imagen_url    VARCHAR(512)  NULL,
  origen_url    VARCHAR(512)  NULL,
  precio        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  precio_oferta DECIMAL(12,2) NULL,
  activo        TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_productos_sku (sku),
  INDEX idx_productos_categoria (categoria_id),
  INDEX idx_productos_precio (precio),
  INDEX idx_productos_activo (activo),
  CONSTRAINT fk_productos_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE inventario (
  producto_id      INT UNSIGNED NOT NULL,
  stock_disponible INT          NOT NULL DEFAULT 0,
  stock_reservado  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (producto_id),
  CONSTRAINT fk_inventario_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_inventario_no_negativo
    CHECK (stock_disponible >= 0 AND stock_reservado >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE movimientos_stock (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id INT UNSIGNED    NOT NULL,
  tipo        ENUM('INGRESO', 'RESERVA', 'LIBERACION', 'VENTA_CONFIRMADA') NOT NULL,
  cantidad    INT             NOT NULL,
  fecha       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_movimientos_producto (producto_id),
  INDEX idx_movimientos_fecha (fecha),
  CONSTRAINT fk_movimientos_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT chk_movimientos_cantidad_positiva CHECK (cantidad > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- El catálogo real se carga desde Data/csv/catalogo/ (categorias, productos,
-- inventario). Poblar movimientos DESPUÉS de esa carga:
-- CALL poblar_movimientos_stock(25000);

DELIMITER $$

DROP PROCEDURE IF EXISTS poblar_movimientos_stock $$

CREATE PROCEDURE poblar_movimientos_stock (IN p_total INT)
BEGIN
  DECLARE i             INT DEFAULT 0;
  DECLARE v_producto_id INT UNSIGNED;
  DECLARE v_tipo        VARCHAR(20);
  DECLARE v_cantidad     INT;
  DECLARE v_fecha       TIMESTAMP;

  START TRANSACTION;

  bucle: WHILE i < p_total DO
    SET v_producto_id = (SELECT id FROM productos ORDER BY RAND() LIMIT 1);
    SET v_tipo = ELT(FLOOR(1 + RAND() * 4), 'INGRESO', 'RESERVA', 'LIBERACION', 'VENTA_CONFIRMADA');
    SET v_cantidad = FLOOR(1 + RAND() * 20);
    SET v_fecha = (NOW() - INTERVAL FLOOR(RAND() * 365) DAY)
                 + INTERVAL FLOOR(RAND() * 86400) SECOND;

    INSERT INTO movimientos_stock (producto_id, tipo, cantidad, fecha)
    VALUES (v_producto_id, v_tipo, v_cantidad, v_fecha);

    SET i = i + 1;
  END WHILE bucle;

  COMMIT;
END $$

DELIMITER ;

-- Usuario de SOLO LECTURA para la MV de ingesta.
-- La contraseña es un valor de ejemplo; si se cambia, mantener sincronizada con
-- Ingesta/ingesta-catalogo/.env (MYSQL_USER / MYSQL_PASSWORD).
CREATE USER IF NOT EXISTS 'ingesta_my'@'%' IDENTIFIED BY 'ingesta_my_readonly';
GRANT SELECT ON cloudshop_catalogo.* TO 'ingesta_my'@'%';
FLUSH PRIVILEGES;
