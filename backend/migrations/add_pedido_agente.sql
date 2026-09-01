-- Pedidos que levanta el AGENTE en la calle, junto al cliente.
--
-- POR QUÉ NO ALCANZABA LA TABLA COMO ESTABA
-- pedido_cliente nació para el portal, donde el cliente entra con su cuenta,
-- así que cliente_portal_id es NOT NULL. Pero solo 5 clientes tienen cuenta,
-- y el agente le vende a 239. Exigir una cuenta obligaría a inventarle un
-- usuario y una contraseña a cada cliente al que se le levanta un pedido en
-- la calle, que no tiene sentido.
--
-- Ahora un pedido puede venir de dos lados, y se sabe de cuál.
ALTER TABLE pedido_cliente ALTER COLUMN cliente_portal_id DROP NOT NULL;

ALTER TABLE pedido_cliente
    ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'portal',
    ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(255),
    ADD COLUMN IF NOT EXISTS creado_por_usuario_id INTEGER REFERENCES usuario(id) ON DELETE SET NULL;

-- Los que ya existen son todos del portal, que es el valor por omisión.
ALTER TABLE pedido_cliente DROP CONSTRAINT IF EXISTS pedido_cliente_origen_check;
ALTER TABLE pedido_cliente ADD CONSTRAINT pedido_cliente_origen_check
    CHECK (origen IN ('portal', 'agente'));

-- Un pedido del portal SIEMPRE tiene cuenta detrás; uno del agente puede no
-- tenerla. Sin esta regla, un error de programación podría dejar un pedido
-- del portal huérfano y nadie se enteraría hasta que alguien lo busque.
ALTER TABLE pedido_cliente DROP CONSTRAINT IF EXISTS pedido_cliente_portal_con_cuenta;
ALTER TABLE pedido_cliente ADD CONSTRAINT pedido_cliente_portal_con_cuenta
    CHECK (origen <> 'portal' OR cliente_portal_id IS NOT NULL);

-- ---------------------------------------------------------------------------
-- LA CLAVE: lo que impide perder pedidos Y duplicarlos.
--
-- El dispositivo del agente arma el pedido sin señal y lo manda cuando puede.
-- Si la respuesta no llega, el dispositivo NO SABE si el pedido entró, y su
-- única salida sería reenviarlo — creando un segundo pedido, que después
-- alguien facturaría dos veces.
--
-- Con la clave, el dispositivo puede reenviar todas las veces que quiera: el
-- servidor reconoce que ya lo tiene y devuelve el mismo pedido. Es el mismo
-- principio que factura_intento, aplicado un paso antes.
--
-- El UNIQUE es lo que hace el trabajo: no es una comprobación en el código
-- que se pueda olvidar, es la base la que no admite el duplicado.
ALTER TABLE pedido_cliente
    ADD COLUMN IF NOT EXISTS clave_idempotencia VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_clave_idempotencia
    ON pedido_cliente(clave_idempotencia)
    WHERE clave_idempotencia IS NOT NULL;

-- Para la pantalla de la casa: qué entró del agente y sigue sin facturar.
CREATE INDEX IF NOT EXISTS idx_pedido_origen_estado
    ON pedido_cliente(origen, estado);
