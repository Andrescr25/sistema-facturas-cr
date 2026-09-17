-- El cliente se identifica por NUESTRO id, no por el contacto de Alegra.
--
-- El portal, las invitaciones, los pedidos y los envíos de WhatsApp se
-- llaveaban por `alegra_contact_id`: un texto que vive en un sistema ajeno.
-- Mientras esa columna sea la llave, no se puede dar de alta un cliente sin
-- crearlo primero en Alegra, que es justamente lo que esta rama va a apagar.
--
-- LAS COLUMNAS VIEJAS SE CONSERVAN hasta el corte. Borrarlas ahora obligaría a
-- que todo el código nuevo esté perfecto de una; dejándolas, las dos formas
-- conviven y la vieja se puede revisar si algo no cuadra.
--
-- El mapeo se verificó antes de escribir esto: las 11 cuentas del portal, las
-- 27 invitaciones, el pedido y los 15 envíos con contacto encuentran su ficha.

-- ── Cuentas del portal ───────────────────────────────────────────────────
ALTER TABLE cliente_portal ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES cliente(id);

UPDATE cliente_portal cp
   SET cliente_id = c.id
  FROM cliente c
 WHERE c.alegra_id = cp.alegra_contact_id AND cp.cliente_id IS NULL;

-- Una ficha, una cuenta. Sin esto, dos cuentas del mismo cliente verían y
-- moverían el mismo carrito.
CREATE UNIQUE INDEX IF NOT EXISTS cliente_portal_cliente_unico
  ON cliente_portal (cliente_id) WHERE cliente_id IS NOT NULL;

-- ── Invitaciones ────────────────────────────────────────────────────────
ALTER TABLE cliente_invitacion ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES cliente(id);

UPDATE cliente_invitacion ci
   SET cliente_id = c.id
  FROM cliente c
 WHERE c.alegra_id = ci.alegra_contact_id AND ci.cliente_id IS NULL;

-- ── Pedidos del portal ──────────────────────────────────────────────────
ALTER TABLE pedido_cliente ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES cliente(id);

UPDATE pedido_cliente pc
   SET cliente_id = c.id
  FROM cliente c
 WHERE c.alegra_id = pc.alegra_contact_id AND pc.cliente_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pedido_cliente_cliente ON pedido_cliente (cliente_id);

-- ── Envíos de WhatsApp ──────────────────────────────────────────────────
-- La columna `cliente_id` ya existía pero estaba vacía: se guardaba solo el
-- contacto de Alegra. Se rellena con lo que ya se puede saber.
UPDATE envio_whatsapp e
   SET cliente_id = c.id
  FROM cliente c
 WHERE c.alegra_id = e.alegra_contact_id AND e.cliente_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_envio_whatsapp_cliente ON envio_whatsapp (cliente_id);
