-- Rama independencia-alegra · 004
-- Productos y categorías propios.
--
-- El precio y el costo van con el nombre de lo que son: en Alegra `price` es
-- SIN IVA y `inventory.unitCost` es CON IVA, y compararlos crudos ya dio
-- márgenes falsos más de una vez. Acá no hay forma de confundirlos.
--
-- La tarifa de impuesto es una referencia a `impuesto`, que guarda el
-- porcentaje como número: nunca se deduce de un id.
--
-- No se borra un producto: se desactiva. Una factura vieja tiene que poder
-- mostrar lo que vendió.

CREATE TABLE IF NOT EXISTS categoria_producto (
  id         SERIAL       PRIMARY KEY,
  nombre     VARCHAR(80)  NOT NULL UNIQUE,
  activo     BOOLEAN      NOT NULL DEFAULT TRUE,
  alegra_id  VARCHAR(20)  UNIQUE,
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS producto (
  id                  SERIAL         PRIMARY KEY,
  nombre              VARCHAR(250)   NOT NULL,
  referencia          VARCHAR(100),
  descripcion         TEXT,
  cabys               CHAR(13)       CHECK (cabys ~ '^[0-9]{13}$'),
  impuesto_id         INTEGER        REFERENCES impuesto(id),
  unidad              VARCHAR(20)    NOT NULL DEFAULT 'Unid',
  categoria_id        INTEGER        REFERENCES categoria_producto(id),
  precio_sin_iva      NUMERIC(16,5)  NOT NULL DEFAULT 0 CHECK (precio_sin_iva >= 0),
  costo_con_iva       NUMERIC(16,5)  NOT NULL DEFAULT 0 CHECK (costo_con_iva >= 0),
  inventariable       BOOLEAN        NOT NULL DEFAULT TRUE,
  es_medicamento      BOOLEAN        NOT NULL DEFAULT FALSE,
  forma_farmaceutica  VARCHAR(10),
  registro_sanitario  VARCHAR(60),
  imagen_url          TEXT,
  activo              BOOLEAN        NOT NULL DEFAULT TRUE,
  oculto              BOOLEAN        NOT NULL DEFAULT FALSE,
  alegra_id           VARCHAR(20)    UNIQUE,
  creado_en           TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_producto_referencia ON producto (referencia);
CREATE INDEX IF NOT EXISTS idx_producto_nombre ON producto (lower(nombre));
CREATE INDEX IF NOT EXISTS idx_producto_categoria ON producto (categoria_id);
CREATE INDEX IF NOT EXISTS idx_producto_activo ON producto (activo, oculto);
