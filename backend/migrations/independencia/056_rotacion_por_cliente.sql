-- Rotación por cliente: cada cuántos días se le vuelve a atender.
-- Solo agrega la frecuencia. La última atención (la fecha de su última
-- factura emitida) y la próxima visita se CALCULAN al leer, igual que el
-- saldo: guardarlas es la forma en que quedan viejas sin que nadie lo note.
-- NULL = todavía no se le definió; no se inventa una frecuencia.
ALTER TABLE cliente ADD COLUMN IF NOT EXISTS rotacion_dias SMALLINT
  CHECK (rotacion_dias BETWEEN 1 AND 365);
COMMENT ON COLUMN cliente.rotacion_dias IS
  'Cada cuántos días se visita a este cliente. NULL: sin definir. La próxima visita se calcula: última factura emitida + estos días.';
