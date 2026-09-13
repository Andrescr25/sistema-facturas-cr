-- El registro de envíos guarda a QUÉ CLIENTE se le mandó, con nuestro id.
--
-- La tabla solo tenía `alegra_contact_id`. Ahora los clientes son nuestros y
-- meter un id propio en una columna con ese nombre es dejar escrita una
-- mentira: dentro de seis meses nadie sabría si ese número es de Alegra o
-- nuestro. La columna vieja se queda para lo ya registrado.
--
-- Sirve para responder "¿qué le he mandado a este cliente?", que es lo que va
-- a necesitar el recordatorio de saldo (sección 7).

ALTER TABLE envio_whatsapp ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES cliente(id);
CREATE INDEX IF NOT EXISTS idx_envio_whatsapp_cliente ON envio_whatsapp (cliente_id, creado_en DESC);
