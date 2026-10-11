-- Rama independencia-alegra · 001
-- Bitácora de cambios: quién cambió qué y cuándo.
--
-- Hoy Alegra guarda el historial de cada documento y producto. Al dejar de
-- editar allá hay que llevarlo nosotros: sin esto, "¿quién le cambió el
-- precio a este producto?" o "¿quién editó esta factura?" no tiene respuesta.
--
-- `cambios` guarda solo lo que cambió ({campo: [antes, después]}) para que
-- leer la bitácora no obligue a comparar dos fotos enteras. `antes` y
-- `despues` quedan completos por si hace falta reconstruir.

CREATE TABLE IF NOT EXISTS bitacora_cambio (
  id          BIGSERIAL    PRIMARY KEY,
  entidad     VARCHAR(40)  NOT NULL,          -- producto | cliente | factura | pago | ...
  entidad_id  VARCHAR(60)  NOT NULL,
  accion      VARCHAR(20)  NOT NULL,          -- crear | editar | desactivar | anular | ...
  antes       JSONB,
  despues     JSONB,
  cambios     JSONB,
  usuario_id  INTEGER      REFERENCES usuario(id),
  motivo      TEXT,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bitacora_entidad ON bitacora_cambio (entidad, entidad_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_usuario ON bitacora_cambio (usuario_id, creado_en DESC);
