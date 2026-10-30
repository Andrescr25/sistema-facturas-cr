-- 070 · Las visitas del agente (2026-10-29).
--
-- Una fila por visita en Preventa: con venta (la factura que salió) o
-- «próxima visita» (por qué no compró y para cuándo quedó). Guarda el GPS del
-- momento, o por qué no lo hay. El usuario pidió al agente «completamente
-- monitoreado» y GPS en cada acción.
--
-- La próxima visita que se guarda acá mueve la fecha de la agenda hasta que el
-- cliente vuelva a comprar: la factura manda, como siempre
-- (backend/src/modules/preventa/visitas.js).
--
-- Se puede correr dos veces: la segunda no hace nada.

CREATE TABLE IF NOT EXISTS visita (
  id               SERIAL PRIMARY KEY,
  cliente_id       INTEGER NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  usuario_id       INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
  ruta_id          INTEGER REFERENCES ruta_cliente(id) ON DELETE SET NULL,
  -- El día de Costa Rica en que se hizo.
  fecha            DATE NOT NULL,
  resultado        VARCHAR(20) NOT NULL CHECK (resultado IN ('venta', 'proxima_visita')),
  motivo           VARCHAR(20) CHECK (motivo IN ('no_necesita', 'cerrado', 'sin_encargado', 'sin_dinero', 'otro')),
  nota             VARCHAR(500),
  proxima_fecha    DATE,
  factura_id       INTEGER REFERENCES factura(id) ON DELETE SET NULL,
  -- El GPS del dispositivo en ese momento. Sin coordenadas, el estado dice por qué.
  ubicacion_estado VARCHAR(20) NOT NULL DEFAULT 'no_disponible'
                   CHECK (ubicacion_estado IN ('tomada', 'negada', 'no_disponible')),
  latitud          NUMERIC(9,6),
  longitud         NUMERIC(9,6),
  precision_m      INTEGER,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (resultado <> 'proxima_visita' OR (motivo IS NOT NULL AND proxima_fecha > fecha)),
  CHECK ((ubicacion_estado = 'tomada') = (latitud IS NOT NULL AND longitud IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_visita_cliente ON visita (cliente_id, fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_visita_usuario ON visita (usuario_id, fecha DESC);
