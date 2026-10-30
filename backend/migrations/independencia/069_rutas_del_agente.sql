-- 069 · Las rutas que atiende cada agente (2026-10-29).
--
-- El usuario va a contratar un agente de ventas que «se hará cargo de las
-- rutas poco a poco». En su ficha de Usuarios se le marcan las rutas que
-- atiende, y Preventa le muestra solo esas.
--
-- Quien tiene «Ver todas las rutas» (`rutas-todas`) sigue viendo todas, como
-- hasta hoy: se le da a todo el que hoy tiene Preventa, para que a nadie le
-- cambie nada. Los administradores lo tienen por su rol.
--
-- Se puede correr dos veces: la segunda no hace nada.

-- Llave `id` propia, como toda tabla de la rama (tests/tablasPropias.test.js).
CREATE TABLE IF NOT EXISTS usuario_ruta (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  ruta_id      INTEGER NOT NULL REFERENCES ruta_cliente(id) ON DELETE CASCADE,
  asignada_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  asignada_por INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
  UNIQUE (usuario_id, ruta_id)
);

CREATE INDEX IF NOT EXISTS idx_usuario_ruta_ruta ON usuario_ruta (ruta_id);

INSERT INTO usuario_modulo (usuario_id, modulo, otorgado_por)
SELECT usuario_id, 'rutas-todas', NULL
  FROM usuario_modulo
 WHERE modulo = 'preventa'
ON CONFLICT (usuario_id, modulo) DO NOTHING;
