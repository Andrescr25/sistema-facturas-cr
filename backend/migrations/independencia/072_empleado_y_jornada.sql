-- 072 · Ficha de empleado y jornadas (2026-10-30).
--
-- El usuario, sobre el agente de ventas: «Mis ingresos» con «las horas que
-- trabaja por día», y desde su lado «Empleados»: «qué hizo, cuántas horas,
-- comisión, viáticos, el total que le debo». Decidió que el agente MARCA
-- ENTRADA Y SALIDA y que se le paga por hora trabajada, más ₡5.000 de
-- gasolina por día trabajado (anda en moto), 2 % de comisión sobre sus ventas
-- netas y ₡2.000 por cliente nuevo. Las cuentas se hacen al leer
-- (backend/src/modules/empleados/liquidacion.js); acá solo lo que pasó.
--
-- · `empleado`: quién cobra planilla y con qué tarifas. Las tarifas valen
--   para lo que todavía no se pagó; cada cambio queda en la bitácora.
-- · `jornada`: cada tramo entre «Iniciar» y «Terminar jornada». La hora la
--   pone el servidor, no el teléfono, con el GPS del momento (o por qué no lo
--   hay). Una sola abierta por usuario. La que quedó sin salida cuenta 0 horas
--   hasta que se corrija, con motivo.
--
-- Ninguna se borra con el usuario: lo que se le pagó y lo que trabajó tiene
-- que seguir ahí. Un usuario con jornadas se desactiva, no se borra.
--
-- Se puede correr dos veces: la segunda no hace nada.

CREATE TABLE IF NOT EXISTS empleado (
  id                      SERIAL PRIMARY KEY,
  usuario_id              INTEGER NOT NULL UNIQUE REFERENCES usuario(id),
  pago_hora               NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pago_hora >= 0),
  comision_porcentaje     NUMERIC(5,2) NOT NULL DEFAULT 2 CHECK (comision_porcentaje BETWEEN 0 AND 100),
  incentivo_cliente_nuevo NUMERIC(12,2) NOT NULL DEFAULT 2000 CHECK (incentivo_cliente_nuevo >= 0),
  gasolina_diaria         NUMERIC(12,2) NOT NULL DEFAULT 5000 CHECK (gasolina_diaria >= 0),
  activo                  BOOLEAN NOT NULL DEFAULT TRUE,
  -- Desde qué día de Costa Rica cuenta (lo anterior no se le debe).
  desde                   DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Costa_Rica')::date),
  creado_por              INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jornada (
  id                      SERIAL PRIMARY KEY,
  usuario_id              INTEGER NOT NULL REFERENCES usuario(id),
  -- El día de Costa Rica de la entrada: a ese día cuenta, aunque pase la medianoche.
  fecha                   DATE NOT NULL,
  inicio                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fin                     TIMESTAMPTZ,
  -- abierta: trabajando · cerrada: con salida · sin_salida: se olvidó de
  -- terminarla (0 horas hasta que se corrija) · anulada: no se cuenta.
  estado                  VARCHAR(12) NOT NULL DEFAULT 'abierta'
                          CHECK (estado IN ('abierta', 'cerrada', 'sin_salida', 'anulada')),
  -- marcada: la marcó él con «Iniciar»/«Terminar» · a_mano: la agregó quien
  -- lleva Empleados (no la marcó: no tiene GPS que mostrar).
  origen                  VARCHAR(10) NOT NULL DEFAULT 'marcada' CHECK (origen IN ('marcada', 'a_mano')),
  inicio_ubicacion_estado VARCHAR(20) NOT NULL DEFAULT 'no_disponible'
                          CHECK (inicio_ubicacion_estado IN ('tomada', 'negada', 'no_disponible')),
  inicio_latitud          NUMERIC(9,6),
  inicio_longitud         NUMERIC(9,6),
  inicio_precision_m      INTEGER,
  fin_ubicacion_estado    VARCHAR(20) CHECK (fin_ubicacion_estado IN ('tomada', 'negada', 'no_disponible')),
  fin_latitud             NUMERIC(9,6),
  fin_longitud            NUMERIC(9,6),
  fin_precision_m         INTEGER,
  -- Quién la corrigió, agregó a mano o anuló, y por qué.
  corregida_por           INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
  motivo_correccion       VARCHAR(300),
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (fin IS NULL OR fin > inicio),
  CHECK ((fin IS NOT NULL) = (estado = 'cerrada') OR estado = 'anulada'),
  CHECK ((inicio_ubicacion_estado = 'tomada') = (inicio_latitud IS NOT NULL AND inicio_longitud IS NOT NULL)),
  CHECK (fin_ubicacion_estado IS DISTINCT FROM 'tomada' OR (fin_latitud IS NOT NULL AND fin_longitud IS NOT NULL)),
  CHECK (corregida_por IS NULL OR motivo_correccion IS NOT NULL)
);

-- Una sola jornada abierta por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS jornada_una_abierta ON jornada (usuario_id) WHERE estado = 'abierta';
CREATE INDEX IF NOT EXISTS idx_jornada_usuario_fecha ON jornada (usuario_id, fecha DESC, inicio DESC);
