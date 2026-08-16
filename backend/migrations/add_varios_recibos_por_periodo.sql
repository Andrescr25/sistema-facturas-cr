-- Un gasto puede recibir VARIOS recibos en el mismo mes.
--
-- El caso que lo motivó: Liberty factura por separado el internet y cada
-- línea móvil, así que llegan varias facturas del mismo emisor con
-- vencimientos en el mismo mes. Con UNIQUE (gasto_id, periodo) la segunda
-- pisaba a la primera y el monto de una desaparecía.
--
-- La unicidad pasa a incluir el documento del proveedor. Se usa COALESCE en
-- un índice de expresión y NO una restricción sobre la columna: en Postgres
-- dos NULL no colisionan entre sí, así que con UNIQUE (gasto_id, periodo,
-- documento_externo) los gastos manuales —que no tienen documento— dejarían
-- de deduplicarse y asegurarPeriodos crearía una fila nueva cada vez que se
-- abre el mes.
--
-- Con COALESCE(documento_externo, ''):
--   · gasto manual  -> '' -> sigue habiendo una sola fila por mes
--   · con recibo    -> el consecutivo -> una fila por recibo

ALTER TABLE pago_recurrente
    DROP CONSTRAINT IF EXISTS pago_recurrente_gasto_id_periodo_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pago_recurrente_gasto_periodo_doc
    ON pago_recurrente (gasto_id, periodo, (COALESCE(documento_externo, '')));
