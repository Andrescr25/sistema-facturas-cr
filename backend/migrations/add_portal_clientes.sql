-- Portal de clientes: cuentas, invitaciones y pedidos.
--
-- El cliente entra por un enlace que genera alguien de la casa, se pone una
-- contraseña, arma su pedido desde el catálogo y lo envía. El pedido NO se
-- convierte en factura solo: queda esperando que una persona lo facture con
-- un click. Una factura electrónica es un documento fiscal ante Hacienda y
-- anularla exige nota de crédito, que le llega al cliente — no es algo que
-- deba dispararse sin que nadie mire.

-- ---------------------------------------------------------------------------
-- Cuenta del cliente
--
-- `usuario` lo elige el cliente al activar. No se usa el correo (solo el 13%
-- de los clientes tiene uno cargado en Alegra) ni la cédula (hay 3 repetidas
-- entre los 202 clientes, así que no sirve como llave única).
--
-- `password_hash` arranca en NULL: la fila nace cuando se genera la
-- invitación y no hay cuenta usable hasta que el cliente la activa.
CREATE TABLE IF NOT EXISTS cliente_portal (
    id SERIAL PRIMARY KEY,
    alegra_contact_id VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(255) NOT NULL,
    identificacion VARCHAR(40),
    email VARCHAR(160),
    usuario VARCHAR(60) UNIQUE,
    password_hash VARCHAR(255),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_ingreso TIMESTAMP,
    activado_en TIMESTAMP,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Invitación
--
-- Se guarda el HASH del token, nunca el token en claro — mismo criterio que
-- una contraseña. El enlace se muestra una sola vez, al generarlo; si la
-- base se filtrara, esos hashes no sirven para activar ninguna cuenta.
CREATE TABLE IF NOT EXISTS cliente_invitacion (
    id SERIAL PRIMARY KEY,
    alegra_contact_id VARCHAR(20) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expira_en TIMESTAMP NOT NULL,
    usado_en TIMESTAMP,
    creado_por INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cliente_invitacion_contacto
    ON cliente_invitacion(alegra_contact_id);

-- ---------------------------------------------------------------------------
-- Pedido
--
-- estado: 'pendiente' -> lo envió el cliente y espera revisión
--         'facturado' -> se creó la factura en Alegra (alegra_invoice_id)
--         'rechazado' -> alguien de la casa lo descartó, con motivo
CREATE TABLE IF NOT EXISTS pedido_cliente (
    id SERIAL PRIMARY KEY,
    cliente_portal_id INTEGER NOT NULL REFERENCES cliente_portal(id) ON DELETE CASCADE,
    alegra_contact_id VARCHAR(20) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    observaciones TEXT,
    motivo_rechazo TEXT,
    alegra_invoice_id VARCHAR(20),
    numero_factura VARCHAR(60),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resuelto_en TIMESTAMP,
    resuelto_por INTEGER REFERENCES usuario(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pedido_cliente_estado ON pedido_cliente(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_cliente_portal ON pedido_cliente(cliente_portal_id);

-- ---------------------------------------------------------------------------
-- Líneas del pedido
--
-- El precio se CONGELA acá cuando el cliente envía, tomado del servidor y
-- nunca de lo que mande el navegador: si el precio viajara en la petición,
-- cualquiera podría pedir con precio 1. Guardarlo además deja ver qué precio
-- se le prometió al cliente si el del catálogo cambia antes de facturar.
CREATE TABLE IF NOT EXISTS pedido_cliente_linea (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedido_cliente(id) ON DELETE CASCADE,
    alegra_item_id VARCHAR(20) NOT NULL,
    nombre_producto VARCHAR(255),
    referencia VARCHAR(80),
    cantidad NUMERIC(12,3) NOT NULL,
    precio_unitario NUMERIC(14,4) NOT NULL,
    tax_percentage NUMERIC(6,3)
);

CREATE INDEX IF NOT EXISTS idx_pedido_cliente_linea_pedido ON pedido_cliente_linea(pedido_id);
