-- Consulta automática de recibos para un gasto recurrente.
--
-- fuente_auto identifica el adaptador ('acueductoscr' hoy) y config_auto
-- guarda lo que ese adaptador necesita para consultar — para el agua son
-- {provincia, acueducto, medidor}. Va en JSONB y no en columnas fijas
-- porque cada fuente pide datos distintos: la luz del ICE va a pedir número
-- de cuenta, no número de paja, y no tiene sentido llenar la tabla de
-- columnas nulas por cada servicio que se agregue.

ALTER TABLE gasto_recurrente ADD COLUMN IF NOT EXISTS fuente_auto VARCHAR(50);
ALTER TABLE gasto_recurrente ADD COLUMN IF NOT EXISTS config_auto JSONB;
ALTER TABLE gasto_recurrente ADD COLUMN IF NOT EXISTS ultima_consulta TIMESTAMP;

-- Documento del recibo en la fuente externa: sirve para no duplicar y para
-- poder rastrear el pago contra el recibo real.
ALTER TABLE pago_recurrente ADD COLUMN IF NOT EXISTS documento_externo VARCHAR(100);
