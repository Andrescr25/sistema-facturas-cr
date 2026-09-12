-- Rama independencia-alegra — 010: notas de crédito
--
-- Hoy las 27 notas de crédito se hacen A MANO en Alegra. Son el único modo de
-- corregir una factura ya emitida como electrónica: no se edita, se acredita.
--
-- DECISIONES
--
-- 1. UNA NOTA PUEDE CORREGIR VARIAS FACTURAS, con un monto por cada una (de
--    ahí `nota_credito_factura`, igual que un cobro repartido). En esta cuenta
--    todas van contra una sola, pero el formato lo permite y partirlo después
--    obligaría a migrar datos.
--
-- 2. EL MOTIVO SE GUARDA DOS VECES: normalizado, para poder contar y filtrar,
--    y tal como venía escrito. En Alegra es texto libre y ya hay uno guardado
--    como "error " con un espacio de más.
--
-- 3. SERIE PROPIA. La nota electrónica lleva su propia serie (0010000103),
--    distinta de la de facturas: son documentos distintos ante Hacienda.
--
-- 4. LAS LÍNEAS SON IGUALES A LAS DE LA FACTURA: lo que se devuelve es lo que
--    se vendió, con su tarifa y su monto de impuesto. Cuando el inventario sea
--    propio, cada línea de nota de crédito devuelve existencias.
--
-- El saldo de la factura acreditada, mientras la copia venga de Alegra, es el
-- que Alegra ya calculó. Cuando la operación sea propia, saldrá de restar
-- pagos y notas al total.

CREATE TABLE IF NOT EXISTS nota_credito (
  id                     SERIAL         PRIMARY KEY,
  serie                  VARCHAR(20),
  consecutivo            BIGINT,
  numero                 VARCHAR(40),
  electronica            BOOLEAN        NOT NULL DEFAULT FALSE,
  clave_hacienda         VARCHAR(60),
  estado                 VARCHAR(10)    NOT NULL DEFAULT 'emitida'
                                        CHECK (estado IN ('borrador', 'emitida', 'anulada')),
  fecha                  DATE           NOT NULL,

  cliente_id             INTEGER        REFERENCES cliente(id),
  cliente_nombre         VARCHAR(200)   NOT NULL,
  cliente_identificacion VARCHAR(20),

  motivo                 VARCHAR(20)    CHECK (motivo IN ('error', 'devolucion', 'anulacion', 'descuento', 'otro')),
  motivo_texto           VARCHAR(120),

  subtotal               NUMERIC(14,2)  NOT NULL DEFAULT 0,
  descuento              NUMERIC(14,2)  NOT NULL DEFAULT 0,
  impuesto               NUMERIC(14,2)  NOT NULL DEFAULT 0,
  total                  NUMERIC(14,2)  NOT NULL DEFAULT 0,
  total_aplicado         NUMERIC(14,2)  NOT NULL DEFAULT 0,
  saldo                  NUMERIC(14,2)  NOT NULL DEFAULT 0,

  observaciones          TEXT,
  alegra_id              VARCHAR(20)    UNIQUE,
  creado_por             INTEGER        REFERENCES usuario(id),
  creado_en              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nota_credito_fecha ON nota_credito (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_nota_credito_cliente ON nota_credito (cliente_id, fecha DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nota_credito_serie_consecutivo
  ON nota_credito (serie, consecutivo)
  WHERE serie IS NOT NULL AND consecutivo IS NOT NULL;

CREATE TABLE IF NOT EXISTS nota_credito_linea (
  id                   SERIAL         PRIMARY KEY,
  nota_credito_id      INTEGER        NOT NULL REFERENCES nota_credito(id) ON DELETE CASCADE,
  numero_linea         INTEGER        NOT NULL,

  producto_id          INTEGER        REFERENCES producto(id),
  nombre               VARCHAR(250)   NOT NULL,
  referencia           VARCHAR(100),
  descripcion          TEXT,
  cabys                CHAR(13),
  unidad               VARCHAR(20),

  cantidad             NUMERIC(14,4)  NOT NULL,
  precio_unitario      NUMERIC(14,5)  NOT NULL,
  descuento_porcentaje NUMERIC(6,3)   NOT NULL DEFAULT 0,
  descuento_monto      NUMERIC(14,2)  NOT NULL DEFAULT 0,
  impuesto_id          INTEGER        REFERENCES impuesto(id),
  tarifa               NUMERIC(6,3)   NOT NULL DEFAULT 0,
  impuesto_monto       NUMERIC(14,2)  NOT NULL DEFAULT 0,
  total                NUMERIC(14,2)  NOT NULL,

  alegra_item_id       VARCHAR(20),
  CONSTRAINT nota_credito_linea_unica UNIQUE (nota_credito_id, numero_linea)
);

CREATE INDEX IF NOT EXISTS idx_nota_credito_linea_nota ON nota_credito_linea (nota_credito_id);
CREATE INDEX IF NOT EXISTS idx_nota_credito_linea_producto ON nota_credito_linea (producto_id);

CREATE TABLE IF NOT EXISTS nota_credito_factura (
  id              SERIAL         PRIMARY KEY,
  nota_credito_id INTEGER        NOT NULL REFERENCES nota_credito(id) ON DELETE CASCADE,
  factura_id      INTEGER        REFERENCES factura(id),
  factura_numero  VARCHAR(40),
  monto           NUMERIC(14,2)  NOT NULL CHECK (monto > 0),
  CONSTRAINT nota_credito_factura_unica UNIQUE (nota_credito_id, factura_id)
);

CREATE INDEX IF NOT EXISTS idx_nota_credito_factura_factura ON nota_credito_factura (factura_id);
