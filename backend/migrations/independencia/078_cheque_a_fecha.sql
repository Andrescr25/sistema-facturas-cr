-- 078 · Cheques a fecha a proveedores (2026-11-03).
--
-- El usuario: «hay algunos pagos que hago con cheque porque así el proveedor
-- me da 30 días; pongo el cheque con fecha dentro de un mes. Cuando el tipo de
-- pago sea cheque y ponga fecha dentro de 30 días, que este pago no me lo
-- quite de una, sino que me salga una nota como cheque para x fecha, pendiente
-- de confirmación». Eligió confirmarlo él («Confirmar cobro»), no que se dé por
-- cobrado solo al llegar la fecha.
--
-- UN CHEQUE A FECHA NO ES UN PAGO TODAVÍA. Vive acá y no en `pago_proveedor`:
-- así el saldo (`cuenta_por_pagar_saldo`), Caja General (`movimiento_caja`),
-- el cierre de caja y el reporte del contador no lo ven hasta que se confirma.
-- Confirmarlo REGISTRA el pago de siempre (`registrarPagoEn`) y lo cuelga acá
-- en `pago_id`. Mientras tanto, lo que cubre no se puede volver a pagar.
--
-- · `fecha_cobro` es la fecha escrita en el cheque; `fecha_emision`, el día
--   que se giró.
-- · `confirmado_en` se pone ANTES de registrar el pago, en la misma
--   transacción: desde ahí deja de contar como pendiente.
-- · Anular no borra: queda con su motivo, como un pago.
-- · El mismo número de cheque no se anota dos veces al mismo proveedor (salvo
--   anulado).
--
-- Se puede correr dos veces: la segunda no hace nada.

CREATE TABLE IF NOT EXISTS cheque_proveedor (
  id                SERIAL         PRIMARY KEY,
  proveedor_id      INTEGER        NOT NULL REFERENCES proveedor(id),
  -- Copia fija, como en el pago: dice lo que decía ese día.
  proveedor_nombre  VARCHAR(255)   NOT NULL,
  proveedor_cedula  VARCHAR(50)    NOT NULL,
  metodo_pago_id    INTEGER        NOT NULL REFERENCES metodo_pago(id),
  numero            VARCHAR(60)    NOT NULL,
  fecha_emision     DATE           NOT NULL,
  fecha_cobro       DATE           NOT NULL,
  monto             NUMERIC(14,2)  NOT NULL CHECK (monto > 0),
  observaciones     TEXT,

  confirmado_en     TIMESTAMP,
  confirmado_por    INTEGER        REFERENCES usuario(id),
  pago_id           INTEGER        UNIQUE REFERENCES pago_proveedor(id),

  anulado           BOOLEAN        NOT NULL DEFAULT FALSE,
  motivo_anulacion  TEXT,
  anulado_por       INTEGER        REFERENCES usuario(id),
  anulado_en        TIMESTAMP,

  registrado_por    INTEGER        REFERENCES usuario(id),
  creado_en         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (fecha_cobro > fecha_emision),
  CHECK (NOT (anulado AND confirmado_en IS NOT NULL)),
  CHECK (pago_id IS NULL OR confirmado_en IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cheque_proveedor_pendiente
  ON cheque_proveedor (fecha_cobro) WHERE confirmado_en IS NULL AND NOT anulado;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cheque_proveedor_numero
  ON cheque_proveedor (proveedor_id, numero) WHERE NOT anulado;

CREATE TABLE IF NOT EXISTS cheque_proveedor_cuenta (
  id                   SERIAL         PRIMARY KEY,
  cheque_id            INTEGER        NOT NULL REFERENCES cheque_proveedor(id) ON DELETE CASCADE,
  cuenta_por_pagar_id  UUID           NOT NULL REFERENCES cuentas_por_pagar(id),
  monto                NUMERIC(14,2)  NOT NULL CHECK (monto > 0),
  UNIQUE (cheque_id, cuenta_por_pagar_id)
);

CREATE INDEX IF NOT EXISTS idx_cheque_proveedor_cuenta_cxp ON cheque_proveedor_cuenta (cuenta_por_pagar_id);
