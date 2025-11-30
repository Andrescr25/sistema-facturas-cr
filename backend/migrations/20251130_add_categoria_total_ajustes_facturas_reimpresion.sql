-- Ensure facturas_reimpresion entries can be categorized and counted
ALTER TABLE facturas_reimpresion
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(32) DEFAULT 'requiere_cambios';

ALTER TABLE facturas_reimpresion
  ADD COLUMN IF NOT EXISTS total_ajustes INTEGER DEFAULT 0;

