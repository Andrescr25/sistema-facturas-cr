-- Rama independencia-alegra — 026: el cierre de caja resta lo que salió
--
-- El esperado era "lo cobrado en efectivo". Desde la 025 un pago a proveedor
-- o un gasto recurrente dice de qué cuenta salió: si salió de la caja, esa
-- plata ya no está al contar, y sin restarla el cierre marcaba un faltante
-- que no existe.
--
-- Se guarda aparte, congelado igual que el esperado (016): si después se
-- anula un pago, lo que alguien firmó al cerrar no puede cambiar solo. Y así
-- el cierre viejo sigue explicando su número: cobrado − salidas = esperado.

ALTER TABLE cierre_caja
  ADD COLUMN IF NOT EXISTS salidas_efectivo NUMERIC(14,2) NOT NULL DEFAULT 0;
