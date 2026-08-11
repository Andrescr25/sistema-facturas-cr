-- Cuánto de la nota de crédito se pudo aplicar de verdad.
--
-- Sin esto, una NC contra una factura YA PAGADA (saldo 0) se marcaba como
-- "aplicada" habiendo reducido ₡0 — y el crédito desaparecía. Pasó con 3
-- notas reales por ₡177.195,82 en la primera corrida.
--
-- Un crédito que no se pudo aplicar no es un crédito consumido: es plata que
-- el proveedor te debe. Queda como saldo a favor hasta que haya una factura
-- de ese proveedor contra la cual descontarlo.

ALTER TABLE nota_credito_proveedor ADD COLUMN IF NOT EXISTS monto_aplicado NUMERIC(14,2) NOT NULL DEFAULT 0;
