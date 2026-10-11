-- Sección 12, parte 2: el portal usa cliente.id, producto.id y factura.id.
-- Los ids de Alegra quedan en SUS columnas como referencia histórica. No se
-- reutilizan: los dos espacios de ids son seriales y mezclarlos no falla.
-- La tablet sigue entrando por Alegra hasta la parte 3; el servidor traduce
-- ese borde y guarda también producto_id en sus pedidos.
BEGIN;

ALTER TABLE cliente_portal ALTER COLUMN alegra_contact_id DROP NOT NULL;
ALTER TABLE cliente_invitacion ALTER COLUMN alegra_contact_id DROP NOT NULL;
ALTER TABLE pedido_cliente ALTER COLUMN alegra_contact_id DROP NOT NULL;
ALTER TABLE carrito_cliente_linea ALTER COLUMN alegra_item_id DROP NOT NULL;
ALTER TABLE pedido_cliente_linea ALTER COLUMN alegra_item_id DROP NOT NULL;

ALTER TABLE carrito_cliente_linea
  ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);
ALTER TABLE pedido_cliente_linea
  ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES producto(id);
ALTER TABLE pedido_cliente
  ADD COLUMN IF NOT EXISTS factura_id INTEGER REFERENCES factura(id);

UPDATE carrito_cliente_linea l SET producto_id = p.id
  FROM producto p WHERE p.alegra_id = l.alegra_item_id AND l.producto_id IS NULL;
UPDATE pedido_cliente_linea l SET producto_id = p.id
  FROM producto p WHERE p.alegra_id = l.alegra_item_id AND l.producto_id IS NULL;
UPDATE pedido_cliente p SET factura_id = f.id
  FROM factura f WHERE f.alegra_id = NULLIF(p.alegra_invoice_id, '') AND p.factura_id IS NULL;

-- Nunca se descartan líneas ni se enlazan por nombre. Las correspondencias
-- que falten en el corte se avisan y bloquean su facturación hasta corregirlas.
DO $$
DECLARE sin_producto INTEGER; sin_cliente INTEGER; sin_factura INTEGER;
BEGIN
  SELECT COUNT(*) INTO sin_producto FROM pedido_cliente_linea WHERE producto_id IS NULL;
  SELECT COUNT(*) INTO sin_cliente FROM cliente_portal WHERE cliente_id IS NULL;
  SELECT COUNT(*) INTO sin_factura FROM pedido_cliente WHERE estado = 'facturado' AND factura_id IS NULL;
  IF sin_producto + sin_cliente + sin_factura > 0 THEN
    RAISE NOTICE 'Portal: % líneas sin producto, % cuentas sin cliente, % pedidos facturados sin factura propia. Se conservan para conciliar.', sin_producto, sin_cliente, sin_factura;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS carrito_cliente_producto_unico
  ON carrito_cliente_linea (cliente_portal_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_pedido_cliente_factura ON pedido_cliente (factura_id);
CREATE INDEX IF NOT EXISTS idx_pedido_cliente_linea_producto ON pedido_cliente_linea (producto_id);
COMMIT;
