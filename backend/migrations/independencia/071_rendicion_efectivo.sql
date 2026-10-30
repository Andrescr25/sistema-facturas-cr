-- 071 · El efectivo que entrega cada cobrador (2026-10-29).
--
-- El usuario, sobre el agente de ventas: «de momento este no podrá cobrar …
-- pero igual esto desarróllalo para futuro: cuánto dinero recogió por usuario
-- y todo más acomodado a cierre de caja».
--
-- Cada cobro ya dice quién lo registró (`pago.registrado_por`). Esto anota,
-- por usuario y día, cuánto efectivo ENTREGÓ en caja contra lo que cobró. Lo
-- cobrado se congela al recibir —como el esperado del cierre de caja—: anular
-- un cobro después no cambia la diferencia que alguien firmó.
--
-- Se puede correr dos veces: la segunda no hace nada.

CREATE TABLE IF NOT EXISTS rendicion_efectivo (
  id                 SERIAL PRIMARY KEY,
  fecha              DATE NOT NULL,
  -- Quien cobró y entrega. Como `pago.registrado_por`: un usuario con cobros no se borra.
  usuario_id         INTEGER NOT NULL REFERENCES usuario(id),
  efectivo_cobrado   NUMERIC(14,2) NOT NULL,
  efectivo_entregado NUMERIC(14,2) NOT NULL CHECK (efectivo_entregado >= 0),
  diferencia         NUMERIC(14,2) NOT NULL,
  -- SINPE, transferencia…: no se cuentan en billetes, quedan de referencia.
  otros_metodos      JSONB NOT NULL DEFAULT '[]'::jsonb,
  observaciones      VARCHAR(500),
  recibido_por       INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
  recibido_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (fecha, usuario_id)
);
