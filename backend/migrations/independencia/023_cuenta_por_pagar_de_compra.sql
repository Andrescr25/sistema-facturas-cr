-- La cuenta por pagar se cuelga de la COMPRA, no solo del buzón.
--
-- `cuentas_por_pagar.factura_id` apunta a `facturas_proveedores` (el buzón)
-- desde que se creó: la cuenta nace ahí, al recibir el correo, antes de que
-- exista ninguna compra. Eso sigue así — no hay que crearla de nuevo al
-- registrar la compra ([[modulo/compras]] ya lo dice: "la CxP ya se crea al
-- recibir el correo, liberada: false").
--
-- Lo que faltaba era el otro lado: una vez que la factura del buzón SE
-- CONVIERTE en compra, no hay manera de ir de la cuenta por pagar a la
-- compra sin pasar primero por el buzón. `compra_id` es ese enlace directo,
-- el que va a usar Reportes y Cuentas por Pagar en vez de reconstruirlo cada
-- vez con un JOIN por `factura_proveedor_id`.

ALTER TABLE cuentas_por_pagar
  ADD COLUMN IF NOT EXISTS compra_id INTEGER REFERENCES compra(id);

CREATE INDEX IF NOT EXISTS idx_cuentas_por_pagar_compra ON cuentas_por_pagar (compra_id)
  WHERE compra_id IS NOT NULL;

-- Backfill de lo que ya se cargó (migración 020): las 860 compras
-- históricas ya tienen su `factura_proveedor_id`, así que la cuenta por
-- pagar correspondiente se puede enlazar de una vez.
UPDATE cuentas_por_pagar cxp
   SET compra_id = c.id
  FROM compra c
 WHERE c.factura_proveedor_id = cxp.factura_id
   AND cxp.compra_id IS NULL;
