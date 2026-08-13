-- Migración: Agregar columna revisado a la tabla faltantes_ajustes
-- Permite diferenciar entre una respuesta seleccionada (revisado = false) y confirmada (revisado = true)

ALTER TABLE faltantes_ajustes ADD COLUMN IF NOT EXISTS revisado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE faltantes_ajustes ALTER COLUMN revisado SET DEFAULT FALSE;
