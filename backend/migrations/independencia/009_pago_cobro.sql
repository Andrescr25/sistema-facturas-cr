-- Rama independencia-alegra — 009: los cobros a clientes
--
-- Hoy los 1.349 pagos viven en Alegra y las cuentas por cobrar se sincronizan
-- cada 30 minutos. Acá el cobro es un documento propio y el saldo de una
-- factura deja de ser un dato que alguien sincroniza: se calcula.
--
-- DECISIONES
--
-- 1. UN PAGO PUEDE REPARTIRSE ENTRE VARIAS FACTURAS. Por eso `pago_factura`:
--    el cliente llega y abona ₡50.000 contra tres facturas. Guardar el pago
--    pegado a una sola factura obligaría a partirlo a mano y a que los montos
--    dejaran de sumar.
--
-- 2. COPIA FIJA del cliente y del número de factura, igual que en la factura:
--    un recibo dice lo que decía el día que se hizo.
--
-- 3. LA REFERENCIA IMPORTA. En SINPE o transferencia, el número de la
--    transacción es la única forma de casar el cobro con el banco. La tabla
--    `metodo_pago` ya dice cuáles la piden (`pide_referencia`).
--
-- 4. NO SE BORRA: un cobro mal hecho se anula con motivo, y el saldo de la
--    factura vuelve a subir. Borrarlo dejaría un recibo entregado sin
--    respaldo.

CREATE TABLE IF NOT EXISTS pago (
  id                SERIAL         PRIMARY KEY,
  numero            VARCHAR(40),
  fecha             DATE           NOT NULL,

  cliente_id        INTEGER        REFERENCES cliente(id),
  cliente_nombre    VARCHAR(200)   NOT NULL,

  metodo_pago_id    INTEGER        REFERENCES metodo_pago(id),
  metodo_pago_texto VARCHAR(40),
  cuenta_dinero_id  INTEGER        REFERENCES cuenta_dinero(id),
  cuenta_texto      VARCHAR(80),
  referencia        VARCHAR(60),

  monto             NUMERIC(14,2)  NOT NULL CHECK (monto > 0),
  observaciones     TEXT,

  anulado           BOOLEAN        NOT NULL DEFAULT FALSE,
  motivo_anulacion  TEXT,

  alegra_id         VARCHAR(20)    UNIQUE,
  registrado_por    INTEGER        REFERENCES usuario(id),
  creado_en         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pago_fecha ON pago (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pago_cliente ON pago (cliente_id, fecha DESC);
-- El cierre de caja del día pregunta esto: qué entró hoy y por dónde.
CREATE INDEX IF NOT EXISTS idx_pago_dia_metodo ON pago (fecha, metodo_pago_id) WHERE anulado = FALSE;

CREATE TABLE IF NOT EXISTS pago_factura (
  id             SERIAL         PRIMARY KEY,
  pago_id        INTEGER        NOT NULL REFERENCES pago(id) ON DELETE CASCADE,
  factura_id     INTEGER        REFERENCES factura(id),
  factura_numero VARCHAR(40),
  monto          NUMERIC(14,2)  NOT NULL CHECK (monto > 0),
  CONSTRAINT pago_factura_unica UNIQUE (pago_id, factura_id)
);

CREATE INDEX IF NOT EXISTS idx_pago_factura_factura ON pago_factura (factura_id);
