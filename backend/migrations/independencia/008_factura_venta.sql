-- Rama independencia-alegra — 008: facturas de venta propias
--
-- Las 5.398 facturas viven hoy en Alegra. Lo que se copia acá no es un espejo
-- de su API: es el documento como lo necesita el negocio y como lo pide
-- Hacienda el día que se emita electrónico.
--
-- DECISIONES QUE NO SE VEN EN LAS COLUMNAS
--
-- 1. COPIA FIJA del cliente y del producto. Una factura de hace dos años tiene
--    que seguir diciendo el nombre, la cédula y el precio con los que se
--    emitió. Si solo guardara `cliente_id`, corregir hoy la cédula de un
--    cliente cambiaría lo que dice un documento fiscal ya entregado.
--
-- 2. ESTADOS PROPIOS, no los de Alegra. Medido sobre las 5.398: 5.161 closed,
--    71 open, 24 draft y 132 void. "Closed" y "open" son lo mismo para el
--    documento —está emitido— y solo se diferencian en si ya se pagó, que es
--    el saldo. Así que: borrador, emitida o anulada, y el saldo aparte.
--
-- 3. TIQUETE es otro tipo de documento, no una factura rara: hay 12
--    (`saleTicket` en Alegra). Hacienda los trata distinto.
--
-- 4. EL PLAZO viene como TEXTO en las facturas de Alegra ("De contado"), no
--    como el objeto con id que mandan los contactos. Se guarda el id propio
--    cuando se logra calzar, y el texto siempre, para no perder lo que decía
--    el documento.
--
-- 5. EL IMPUESTO SE GUARDA POR LÍNEA, con su tarifa y su monto. Es la lección
--    del IVA 13 % escrito a mano: la tarifa es del producto y del momento, no
--    una constante del sistema.

CREATE TABLE IF NOT EXISTS factura (
  id                          SERIAL         PRIMARY KEY,
  tipo_documento              VARCHAR(12)    NOT NULL DEFAULT 'factura'
                                             CHECK (tipo_documento IN ('factura', 'tiquete')),
  serie                       VARCHAR(20),
  consecutivo                 BIGINT,
  numero                      VARCHAR(40),
  electronica                 BOOLEAN        NOT NULL DEFAULT FALSE,
  clave_hacienda              VARCHAR(60),
  estado                      VARCHAR(10)    NOT NULL DEFAULT 'borrador'
                                             CHECK (estado IN ('borrador', 'emitida', 'anulada')),
  fecha                       DATE           NOT NULL,
  fecha_vencimiento           DATE,
  emitida_en                  TIMESTAMP,

  cliente_id                  INTEGER        REFERENCES cliente(id),
  cliente_nombre              VARCHAR(200)   NOT NULL,
  cliente_tipo_identificacion VARCHAR(20),
  cliente_identificacion      VARCHAR(20),
  cliente_correo              VARCHAR(160),

  condicion_venta             VARCHAR(10)    CHECK (condicion_venta IN ('contado', 'credito')),
  plazo_credito_id            INTEGER        REFERENCES plazo_credito(id),
  plazo_texto                 VARCHAR(60),
  metodo_pago_id              INTEGER        REFERENCES metodo_pago(id),
  metodo_pago_texto           VARCHAR(40),

  moneda                      CHAR(3)        NOT NULL DEFAULT 'CRC',
  subtotal                    NUMERIC(14,2)  NOT NULL DEFAULT 0,
  descuento                   NUMERIC(14,2)  NOT NULL DEFAULT 0,
  impuesto                    NUMERIC(14,2)  NOT NULL DEFAULT 0,
  total                       NUMERIC(14,2)  NOT NULL DEFAULT 0,
  total_pagado                NUMERIC(14,2)  NOT NULL DEFAULT 0,
  saldo                       NUMERIC(14,2)  NOT NULL DEFAULT 0,

  observaciones               TEXT,
  anotaciones                 TEXT,
  vendedor                    VARCHAR(120),
  actividad_economica         VARCHAR(10),
  anulada_por_nota            BOOLEAN        NOT NULL DEFAULT FALSE,
  motivo_anulacion            TEXT,

  alegra_id                   VARCHAR(20)    UNIQUE,
  creado_por                  INTEGER        REFERENCES usuario(id),
  creado_en                   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en              TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_factura_fecha ON factura (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_factura_cliente ON factura (cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_factura_numero ON factura (numero);
CREATE INDEX IF NOT EXISTS idx_factura_estado ON factura (estado);
-- Las cuentas por cobrar preguntan siempre lo mismo: quién debe.
CREATE INDEX IF NOT EXISTS idx_factura_saldo ON factura (cliente_id) WHERE saldo > 0 AND estado = 'emitida';
-- Dos facturas no pueden compartir número dentro de la misma serie.
CREATE UNIQUE INDEX IF NOT EXISTS idx_factura_serie_consecutivo
  ON factura (tipo_documento, serie, consecutivo)
  WHERE serie IS NOT NULL AND consecutivo IS NOT NULL;

CREATE TABLE IF NOT EXISTS factura_linea (
  id                   SERIAL         PRIMARY KEY,
  factura_id           INTEGER        NOT NULL REFERENCES factura(id) ON DELETE CASCADE,
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
  CONSTRAINT factura_linea_unica UNIQUE (factura_id, numero_linea)
);

CREATE INDEX IF NOT EXISTS idx_factura_linea_factura ON factura_linea (factura_id);
CREATE INDEX IF NOT EXISTS idx_factura_linea_producto ON factura_linea (producto_id);
