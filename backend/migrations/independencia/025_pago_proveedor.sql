-- Rama independencia-alegra — 025: el pago a proveedor es un documento
--
-- Hasta acá, pagarle a un proveedor era BAJAR A MANO
-- `cuentas_por_pagar.saldo_pendiente` (o marcar la cuenta PAGADA): sin fecha,
-- sin saber de qué cuenta salió la plata, con qué método ni con qué
-- referencia. Medido al escribir esto: 246 facturas pagadas por ₡16,3
-- millones, y ninguna deja rastro de cómo se pagó.
--
-- DECISIONES
--
-- 1. EL SALDO SE CALCULA, NO SE GUARDA — igual que en los cobros (009):
--    total − notas de crédito aplicadas − pagos vigentes. La vista
--    `cuenta_por_pagar_saldo` es la única fuente; `saldo_pendiente` y
--    `estado` quedan en la tabla porque el cliente de Prisma (compartido con
--    main/developer) los exige, pero nadie en esta rama los lee.
--
-- 2. LO PAGADO ANTES NO SE INVENTA. No existe ningún dato de cuándo ni cómo
--    se pagaron esas 246 facturas: fabricar pagos con una fecha y una cuenta
--    supuestas sería inventar registros de negocio. Queda como un número por
--    factura, `pagado_sin_detalle`, congelado acá una sola vez: lo que ya no
--    se debía al hacer el corte, sin más detalle del que había.
--
-- 3. UN PAGO PUEDE CUBRIR VARIAS FACTURAS del mismo proveedor, por eso
--    `pago_proveedor_cuenta` (mismo esquema que `pago_factura` en los cobros).
--
-- 4. SALE DE UNA CUENTA DE DINERO, con método. Es lo que permite cuadrar
--    cada cuenta (lo que entró menos lo que salió) y que el cierre de caja
--    reste el efectivo que se le pagó a un proveedor.
--
-- 5. NO SE BORRA: se anula con motivo, y el saldo vuelve solo.

-- El proveedor por id propio (checklist §9). Las 318 cuentas lo encuentran
-- por cédula al escribir esto.
ALTER TABLE cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedor(id);

UPDATE cuentas_por_pagar c
   SET proveedor_id = p.id
  FROM proveedor p
 WHERE c.proveedor_id IS NULL
   AND regexp_replace(p.identificacion, '\D', '', 'g') = regexp_replace(c.proveedor_cedula, '\D', '', 'g');

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_proveedor_id ON cuentas_por_pagar (proveedor_id);

ALTER TABLE cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS pagado_sin_detalle NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Una sola vez: lo que el saldo guardado ya daba por pagado, descontadas las
-- notas de crédito (esas sí tienen su registro). Con la condición
-- `pagado_sin_detalle = 0`, correrla de nuevo no suma dos veces.
UPDATE cuentas_por_pagar c
   SET pagado_sin_detalle = GREATEST(0, ROUND(c.monto_total - COALESCE(nc.credito, 0) - c.saldo_pendiente, 2))
  FROM (
         SELECT c2.id, SUM(a.monto) AS credito
           FROM cuentas_por_pagar c2
           LEFT JOIN nota_credito_aplicacion a ON a.cuenta_por_pagar_id = c2.id
          GROUP BY c2.id
       ) nc
 WHERE nc.id = c.id
   AND c.pagado_sin_detalle = 0;

CREATE TABLE IF NOT EXISTS pago_proveedor (
  id                SERIAL         PRIMARY KEY,
  fecha             DATE           NOT NULL,

  proveedor_id      INTEGER        NOT NULL REFERENCES proveedor(id),
  -- Copia fija, como en el recibo de un cobro: dice lo que decía ese día.
  proveedor_nombre  VARCHAR(255)   NOT NULL,
  proveedor_cedula  VARCHAR(50)    NOT NULL,

  cuenta_dinero_id  INTEGER        NOT NULL REFERENCES cuenta_dinero(id),
  metodo_pago_id    INTEGER        NOT NULL REFERENCES metodo_pago(id),
  metodo_pago_texto VARCHAR(40)    NOT NULL,
  referencia        VARCHAR(60),

  monto             NUMERIC(14,2)  NOT NULL CHECK (monto > 0),
  observaciones     TEXT,

  anulado           BOOLEAN        NOT NULL DEFAULT FALSE,
  motivo_anulacion  TEXT,
  anulado_por       INTEGER        REFERENCES usuario(id),
  anulado_en        TIMESTAMP,

  registrado_por    INTEGER        REFERENCES usuario(id),
  creado_en         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pago_proveedor_fecha ON pago_proveedor (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_pago_proveedor_proveedor ON pago_proveedor (proveedor_id, fecha DESC);
-- Lo que pregunta el cierre de caja: qué salió ese día y por dónde.
CREATE INDEX IF NOT EXISTS idx_pago_proveedor_dia ON pago_proveedor (fecha, metodo_pago_id) WHERE anulado = FALSE;

CREATE TABLE IF NOT EXISTS pago_proveedor_cuenta (
  id                   SERIAL         PRIMARY KEY,
  pago_id              INTEGER        NOT NULL REFERENCES pago_proveedor(id) ON DELETE CASCADE,
  cuenta_por_pagar_id  UUID           NOT NULL REFERENCES cuentas_por_pagar(id),
  monto                NUMERIC(14,2)  NOT NULL CHECK (monto > 0),
  UNIQUE (pago_id, cuenta_por_pagar_id)
);

CREATE INDEX IF NOT EXISTS idx_pago_proveedor_cuenta_cxp ON pago_proveedor_cuenta (cuenta_por_pagar_id);

-- El saldo y el estado de cada cuenta por pagar, calculados. "Vencida" se
-- mide contra el día de Costa Rica, no el del servidor: después de las 6 p.m.
-- el día UTC ya es mañana.
CREATE OR REPLACE VIEW cuenta_por_pagar_saldo AS
SELECT c.id,
       c.monto_total,
       COALESCE(nc.credito, 0)                                     AS credito,
       c.pagado_sin_detalle,
       COALESCE(pg.pagado, 0)                                      AS pagado,
       GREATEST(0, ROUND(c.monto_total - COALESCE(nc.credito, 0)
                         - c.pagado_sin_detalle - COALESCE(pg.pagado, 0), 2)) AS saldo,
       CASE
         WHEN ROUND(c.monto_total - COALESCE(nc.credito, 0)
                    - c.pagado_sin_detalle - COALESCE(pg.pagado, 0), 2) <= 0 THEN 'PAGADA'
         WHEN c.fecha_vencimiento::date < (now() AT TIME ZONE 'America/Costa_Rica')::date THEN 'VENCIDA'
         WHEN COALESCE(pg.pagado, 0) > 0 THEN 'PARCIAL'
         ELSE 'PENDIENTE'
       END                                                         AS estado
  FROM cuentas_por_pagar c
  LEFT JOIN (
         SELECT a.cuenta_por_pagar_id, SUM(a.monto) AS credito
           FROM nota_credito_aplicacion a
           JOIN nota_credito_proveedor n ON n.id = a.nota_credito_id
          WHERE n.eliminada_en IS NULL
          GROUP BY a.cuenta_por_pagar_id
       ) nc ON nc.cuenta_por_pagar_id = c.id
  LEFT JOIN (
         SELECT pc.cuenta_por_pagar_id, SUM(pc.monto) AS pagado
           FROM pago_proveedor_cuenta pc
           JOIN pago_proveedor p ON p.id = pc.pago_id
          WHERE NOT p.anulado
          GROUP BY pc.cuenta_por_pagar_id
       ) pg ON pg.cuenta_por_pagar_id = c.id;

-- Los gastos recurrentes (luz, internet, planilla) también salen de una
-- cuenta de dinero (checklist §9). Opcionales: los 6 ya pagados no dicen de
-- dónde salieron y no se les inventa.
ALTER TABLE pago_recurrente
  ADD COLUMN IF NOT EXISTS cuenta_dinero_id INTEGER REFERENCES cuenta_dinero(id);
ALTER TABLE pago_recurrente
  ADD COLUMN IF NOT EXISTS metodo_pago_id INTEGER REFERENCES metodo_pago(id);
