-- Registro de todo lo que sale por WhatsApp hacia un cliente o proveedor.
--
-- POR QUÉ HACE FALTA
-- 1. "¿Ya le mandé la cotización a este cliente?" Sin esto no hay forma de
--    saberlo, y se termina mandando dos veces o ninguna.
-- 2. Si un documento llega a un número equivocado, esta tabla es lo único que
--    dice cuándo salió y hacia dónde. Antes solo quedaba en el log del
--    servidor, que Render rota.
--
-- Se guardan también los fallos: un "no tiene WhatsApp" que se repite es un
-- teléfono que hay que corregir en Alegra, no un problema de WhatsApp.

CREATE TABLE IF NOT EXISTS envio_whatsapp (
  id                SERIAL PRIMARY KEY,
  -- cotizacion | factura | saldo | pedido | invitacion | orden_compra
  tipo              VARCHAR(30) NOT NULL,
  -- número de cotización o factura, id de pedido: con qué buscarlo después
  referencia        VARCHAR(60),
  alegra_contact_id VARCHAR(20),
  telefono          VARCHAR(20) NOT NULL,
  enviado_por       INTEGER REFERENCES usuario(id),
  exito             BOOLEAN NOT NULL,
  error             TEXT,
  creado_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_envio_whatsapp_ref ON envio_whatsapp (tipo, referencia);
CREATE INDEX IF NOT EXISTS idx_envio_whatsapp_contacto ON envio_whatsapp (alegra_contact_id, creado_en DESC);
