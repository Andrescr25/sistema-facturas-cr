-- Registro de aplicaciones de nota de crédito.
--
-- Antes el vínculo era una sola columna `cuenta_por_pagar_id` en la nota,
-- que asume que un crédito se consume contra UNA factura. No alcanza: una
-- nota de ₡135.553 contra una factura de ₡50.000 deja ₡85.553 que hay que
-- poder aplicar a otra. Con este registro una nota se reparte entre las
-- facturas que haga falta, y cada movimiento queda trazable y reversible.
--
-- `nota_credito_proveedor.monto_aplicado` se mantiene como la suma de estas
-- filas (denormalizado a propósito, para no recalcularlo en cada listado).

CREATE TABLE IF NOT EXISTS nota_credito_aplicacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nota_credito_id UUID NOT NULL REFERENCES nota_credito_proveedor(id) ON DELETE CASCADE,
    cuenta_por_pagar_id UUID NOT NULL,
    monto NUMERIC(14,2) NOT NULL CHECK (monto > 0),
    -- 'automatica' = la aplicó el sistema al recibir la nota contra su
    -- factura referenciada. 'manual' = la persona la ligó a otra factura.
    origen VARCHAR(20) NOT NULL DEFAULT 'automatica',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nc_aplicacion_nota ON nota_credito_aplicacion(nota_credito_id);
CREATE INDEX IF NOT EXISTS idx_nc_aplicacion_cuenta ON nota_credito_aplicacion(cuenta_por_pagar_id);

-- Backfill de lo ya aplicado por la lógica anterior, que guardaba el vínculo
-- en la nota. Sin esto, eliminar una de esas notas no sabría cuánto devolver.
INSERT INTO nota_credito_aplicacion (nota_credito_id, cuenta_por_pagar_id, monto, origen)
SELECT id, cuenta_por_pagar_id, monto_aplicado, 'automatica'
FROM nota_credito_proveedor
WHERE cuenta_por_pagar_id IS NOT NULL
  AND monto_aplicado > 0
  AND NOT EXISTS (
    SELECT 1 FROM nota_credito_aplicacion a WHERE a.nota_credito_id = nota_credito_proveedor.id
  );
