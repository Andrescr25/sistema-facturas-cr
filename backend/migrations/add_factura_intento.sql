-- Intentos de creación de factura, para que reenviar no duplique.
--
-- EL PROBLEMA
-- Crear una factura es un POST a Alegra. Si la respuesta no llega —timeout,
-- WiFi que se corta, Render que reinicia— quien la mandó no sabe si se creó o
-- no. Y la única salida que tenía era reenviarla, con lo que si Alegra sí la
-- había creado quedaban dos documentos fiscales; anular uno exige nota de
-- crédito, que le llega al cliente.
--
-- Esto se vuelve la norma, y no la excepción, cuando el agente sincroniza
-- pedidos desde la calle con señal intermitente.
--
-- CÓMO SE RESUELVE
-- Quien crea la factura le pone una CLAVE, una sola vez, cuando arma el
-- documento. Esa clave viaja en cada intento. El backend la registra antes de
-- llamar a Alegra, así que:
--
--   ya está y salió bien  -> se devuelve la factura que YA existe, sin llamar
--                            otra vez a Alegra
--   ya está en proceso    -> hay un intento en vuelo; se rechaza en vez de
--                            mandar un segundo
--   quedó incierta        -> Alegra pudo haberla creado. NO se reenvía a
--                            ciegas: hay que reconciliar contra Alegra
--   falló de verdad       -> Alegra la rechazó explícitamente (un 4xx con
--                            respuesta), así que no se creó nada y se puede
--                            reintentar tranquilo
--
-- La distinción entre "incierta" y "fallida" es el corazón de esto: son los
-- dos desenlaces que antes se trataban igual, y confundirlos es exactamente
-- lo que duplica.
CREATE TABLE IF NOT EXISTS factura_intento (
    -- La genera quien crea la factura (navegador o dispositivo del agente),
    -- UNA vez por documento. Es la identidad del intento, no de la factura.
    clave VARCHAR(80) PRIMARY KEY,

    estado VARCHAR(20) NOT NULL DEFAULT 'en_proceso'
        CHECK (estado IN ('en_proceso', 'creada', 'incierta', 'fallida')),

    -- Se llena cuando Alegra confirma. Es lo que se devuelve si alguien
    -- reenvía la misma clave.
    alegra_invoice_id VARCHAR(20),
    numero_factura VARCHAR(60),

    -- Huella del contenido (cliente + total + items). Sirve para detectar que
    -- alguien reusó una clave con OTRA factura adentro, que sería un error de
    -- programación y no un reenvío legítimo.
    huella VARCHAR(64),

    -- Por qué falló o por qué quedó incierta, para poder resolverlo después
    -- sin adivinar.
    detalle TEXT,

    intentos INTEGER NOT NULL DEFAULT 1,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Las inciertas son las que hay que ir a reconciliar contra Alegra; son pocas
-- y se buscan por estado, así que el índice parcial alcanza.
CREATE INDEX IF NOT EXISTS idx_factura_intento_pendientes
    ON factura_intento(estado, creado_en)
    WHERE estado IN ('en_proceso', 'incierta');
