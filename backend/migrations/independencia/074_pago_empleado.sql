-- 074 · Los pagos a un empleado (2026-10-30).
--
-- El usuario decidió que la planilla del agente se paga por QUINCENA y que los
-- pagos salen «como salida de caja»; la gasolina (₡5.000 por día trabajado)
-- «que ahí le salga si ya se lo pagué o no».
--
-- · `pago_empleado`: cada pago, con su desglose CONGELADO (horas, tarifas,
--   clientes, comisión, días de gasolina): lo que se le pagó no cambia aunque
--   después se corrija una jornada; la diferencia sale como ajuste. Una sola
--   quincena vigente por empleado y período; un ajuste es otro pago del mismo
--   período. Anular pide motivo (y administrador, ver usuarios/modulos.js).
-- · `gasolina_pagada`: qué días de gasolina ya se pagaron y con qué pago. Un día
--   se paga una sola vez; anular el pago borra sus días, que quedan pendientes.
-- · `movimiento_caja`: se vuelve a crear con sus tres ramas TAL CUAL (027) y
--   una cuarta, la de estos pagos. Caja General y el cierre la leen solas.
--
-- Sin ON DELETE hacia usuario, como la jornada: lo pagado queda.
--
-- Se puede correr dos veces: la segunda no hace nada.

CREATE TABLE IF NOT EXISTS pago_empleado (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INTEGER NOT NULL REFERENCES usuario(id),
  concepto           VARCHAR(10) NOT NULL CHECK (concepto IN ('quincena', 'ajuste', 'gasolina')),
  -- "2026-10-Q2" para la quincena y su ajuste; la gasolina va por días.
  periodo            VARCHAR(10),
  fecha              DATE NOT NULL,
  monto              NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  desglose           JSONB NOT NULL,
  cuenta_dinero_id   INTEGER NOT NULL REFERENCES cuenta_dinero(id),
  metodo_pago_id     INTEGER NOT NULL REFERENCES metodo_pago(id),
  metodo_pago_texto  VARCHAR(40),
  referencia         VARCHAR(60),
  observaciones      VARCHAR(500),
  registrado_por     INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
  anulado            BOOLEAN NOT NULL DEFAULT FALSE,
  motivo_anulacion   VARCHAR(300),
  anulado_por        INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
  anulado_en         TIMESTAMPTZ,
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((concepto = 'gasolina') = (periodo IS NULL)),
  CHECK (NOT anulado OR motivo_anulacion IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS pago_empleado_una_quincena
  ON pago_empleado (usuario_id, periodo) WHERE concepto = 'quincena' AND NOT anulado;
CREATE INDEX IF NOT EXISTS idx_pago_empleado_usuario ON pago_empleado (usuario_id, fecha DESC, id DESC);

CREATE TABLE IF NOT EXISTS gasolina_pagada (
  id         SERIAL PRIMARY KEY,
  pago_id    INTEGER NOT NULL REFERENCES pago_empleado(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  fecha      DATE NOT NULL,
  monto      NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  UNIQUE (usuario_id, fecha)
);

CREATE OR REPLACE VIEW movimiento_caja AS
SELECT 'cobro'::text                                       AS tipo,
       'entrada'::text                                     AS sentido,
       p.id                                                AS documento_id,
       p.fecha,
       p.monto,
       p.cliente_nombre                                    AS contraparte,
       COALESCE(mp.nombre, p.metodo_pago_texto)            AS metodo,
       COALESCE(mp.clave, lower(p.metodo_pago_texto))      AS metodo_clave,
       p.referencia,
       p.anulado,
       p.motivo_anulacion,
       p.cuenta_dinero_id,
       (SELECT string_agg(COALESCE(f.numero, pf.factura_numero), ', ' ORDER BY pf.id)
          FROM pago_factura pf
          LEFT JOIN factura f ON f.id = pf.factura_id
         WHERE pf.pago_id = p.id)                          AS facturas,
       p.creado_en
  FROM pago p
  LEFT JOIN metodo_pago mp ON mp.id = p.metodo_pago_id

UNION ALL

SELECT 'pago_proveedor',
       'salida',
       pp.id,
       pp.fecha,
       pp.monto,
       pp.proveedor_nombre,
       COALESCE(mp.nombre, pp.metodo_pago_texto),
       mp.clave,
       pp.referencia,
       pp.anulado,
       pp.motivo_anulacion,
       pp.cuenta_dinero_id,
       (SELECT string_agg(c.numero_consecutivo, ', ' ORDER BY pc.id)
          FROM pago_proveedor_cuenta pc
          JOIN cuentas_por_pagar c ON c.id = pc.cuenta_por_pagar_id
         WHERE pc.pago_id = pp.id),
       pp.creado_en
  FROM pago_proveedor pp
  LEFT JOIN metodo_pago mp ON mp.id = pp.metodo_pago_id

UNION ALL

-- Un gasto recurrente "deshecho" vuelve a pendiente y deja de estar acá: no
-- queda como anulado porque la fila del período es la misma que se vuelve a
-- pagar.
SELECT 'gasto',
       'salida',
       pr.id,
       pr.fecha_pago,
       pr.monto,
       g.nombre,
       COALESCE(mp.nombre, pr.metodo),
       mp.clave,
       NULL,
       FALSE,
       NULL,
       pr.cuenta_dinero_id,
       'Período ' || pr.periodo,
       pr.created_at
  FROM pago_recurrente pr
  JOIN gasto_recurrente g ON g.id = pr.gasto_id
  LEFT JOIN metodo_pago mp ON mp.id = pr.metodo_pago_id
 WHERE pr.estado = 'pagado' AND pr.fecha_pago IS NOT NULL

UNION ALL

-- 074: lo que se le paga a un empleado (quincena, ajuste o gasolina). Sale de
-- Caja General; en efectivo, lo resta el cierre del día como cualquier salida.
SELECT 'pago_empleado',
       'salida',
       pe.id,
       pe.fecha,
       pe.monto,
       u.nombre,
       COALESCE(mp.nombre, pe.metodo_pago_texto),
       mp.clave,
       pe.referencia,
       pe.anulado,
       pe.motivo_anulacion,
       pe.cuenta_dinero_id,
       CASE pe.concepto WHEN 'gasolina' THEN 'Gasolina' WHEN 'ajuste' THEN 'Ajuste ' || pe.periodo ELSE 'Quincena ' || pe.periodo END,
       pe.creado_en AT TIME ZONE 'America/Costa_Rica'
  FROM pago_empleado pe
  JOIN usuario u ON u.id = pe.usuario_id
  LEFT JOIN metodo_pago mp ON mp.id = pe.metodo_pago_id;
