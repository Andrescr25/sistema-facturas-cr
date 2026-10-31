-- La vista del administrador se elige en Usuarios y permisos (2026-10-31).
-- Es una preferencia de la cuenta, no una restricción de sus permisos.
-- Vacío conserva todos los módulos actuales y los que se agreguen después.
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS modulos_ocultos TEXT[] NOT NULL DEFAULT '{}';
