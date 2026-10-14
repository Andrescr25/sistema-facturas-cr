-- Condición comercial para ventas nuevas. Las líneas ya emitidas conservan
-- el porcentaje y el monto que se cobraron, aunque cambie la ficha.
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS descuento_global NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE cliente ADD CONSTRAINT cliente_descuento_global_rango
  CHECK (descuento_global >= 0 AND descuento_global <= 100);
COMMENT ON COLUMN cliente.descuento_global IS
  'Descuento porcentual en ventas nuevas: margen antes de descuento mayor al 21%; se usa el mayor entre este, oferta y manual, sin acumular.';
