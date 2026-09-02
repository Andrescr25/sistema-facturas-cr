-- Estado de cada dispositivo del agente, para verlo desde la casa.
--
-- EL LÍMITE QUE NO SE PUEDE SALTAR
-- Si una tablet no tiene señal, no puede avisar nada. Nadie puede saber en
-- tiempo real que un dispositivo tiene pedidos atascados: por definición, no
-- hay forma de contactarlo.
--
-- Lo que SÍ se puede saber es cuándo fue la última vez que pudo hablar y con
-- cuánto pendiente quedó. Y eso alcanza para lo que importa:
--
--   "la tablet de Juan reportó hace 4 horas que tenía 3 pedidos sin enviar"
--
-- Con eso se le puede llamar. Sin eso, esos 3 pedidos aparecen recién cuando
-- el cliente reclama que nunca le llegó el producto.
--
-- La ausencia de noticias ES la noticia: un dispositivo que no reporta hace
-- horas, en un día de ruta, es justamente el que hay que revisar.
CREATE TABLE IF NOT EXISTS dispositivo_agente (
    -- El mismo identificador que el dispositivo usa para armar las claves de
    -- sus pedidos, así se puede cruzar un pedido con el aparato que lo mandó.
    id VARCHAR(80) PRIMARY KEY,

    usuario_id INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
    usuario_nombre VARCHAR(120),

    -- Lo que el dispositivo reportó la última vez que pudo comunicarse.
    pedidos_pendientes INTEGER NOT NULL DEFAULT 0,
    pedido_mas_viejo TIMESTAMP,

    ultimo_contacto TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    primer_contacto TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- La pantalla ordena por quién tiene pendientes y hace cuánto no se sabe de
-- él, que es el orden en que hay que atenderlos.
CREATE INDEX IF NOT EXISTS idx_dispositivo_pendientes
    ON dispositivo_agente(pedidos_pendientes DESC, ultimo_contacto ASC);
