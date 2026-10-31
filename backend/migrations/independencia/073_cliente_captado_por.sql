-- 073 · Quién consiguió al cliente (2026-10-30).
--
-- El usuario paga ₡2.000 al agente «por cliente nuevo que consiga», y decidió
-- que cuenta CON SU PRIMERA COMPRA, no al registrarlo. Acá solo queda quién lo
-- registró desde Preventa («Cliente nuevo») y cuándo; si ya compró se lee de
-- sus facturas al calcular (backend/src/modules/empleados/liquidacion.js).
--
-- Sin ON DELETE, como la jornada: un usuario que consiguió clientes se
-- desactiva, no se borra.
--
-- Se puede correr dos veces: la segunda no hace nada.

ALTER TABLE cliente ADD COLUMN IF NOT EXISTS captado_por INTEGER REFERENCES usuario(id);
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS captado_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cliente_captado_por ON cliente (captado_por) WHERE captado_por IS NOT NULL;
