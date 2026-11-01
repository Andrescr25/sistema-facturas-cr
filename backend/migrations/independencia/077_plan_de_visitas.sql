-- 077 · «Mi día»: el plan de visitas del agente (2026-11-01).
--
-- El usuario: «quiero que el agente pueda organizar mejor cuál cliente quiere
-- visitar primero… que este módulo de Preventa sea más dinámico, que el agente
-- lo edite a su gusto». Decidió un plan POR DÍA con clientes de todas sus
-- rutas. Una fila por cliente del plan, con su lugar en el orden.
--
-- · El plan se arma solo la primera vez que lo abre en el día (los atrasados y
--   los de hoy de sus rutas, en el orden de la ruta); después lo edita él.
-- · Quitar no borra la fila: queda `quitado`, para que el administrador vea a
--   quién sacó del plan sin visitarlo.
-- · Si lo visitó no se guarda acá: se lee de sus facturas y visitas del día.
-- · Un día no pasa al siguiente: cada día tiene sus filas.
--
-- Sin ON DELETE hacia usuario, como la jornada; el cliente que se borra se va
-- de los planes.
--
-- Se puede correr dos veces: la segunda no hace nada.

CREATE TABLE IF NOT EXISTS plan_visita (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuario(id),
  -- El día de Costa Rica del plan.
  fecha       DATE NOT NULL,
  cliente_id  INTEGER NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  orden       INTEGER NOT NULL CHECK (orden > 0),
  quitado     BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (usuario_id, fecha, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_visita_dia ON plan_visita (usuario_id, fecha, orden);
