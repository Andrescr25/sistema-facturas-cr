-- Reporte Contador: separar devoluciones (notas de crédito) de las facturas.
--
-- Motivo: el Excel oficial de Alegra NO resta las notas de crédito de la base
-- gravable — las lleva en una hoja aparte ("Devoluciones en Ventas") y en dos
-- columnas propias del resumen ("Base devoluciones" / "Impuesto en
-- devoluciones"). La primera versión de este módulo las metía como líneas
-- negativas dentro del detalle, lo que hacía que el total no cuadrara nunca
-- contra el archivo de Alegra.
--
-- Se distinguen por tipo_documento = 'Nota de crédito', que ya se guardaba.
-- Lo único que faltaba era a qué factura hace referencia cada una.

ALTER TABLE reporte_contador_linea
    ADD COLUMN IF NOT EXISTS documento_asociado VARCHAR(30);

-- Totales del período partidos igual que el resumen de Alegra: la base
-- gravable es solo de facturas, las devoluciones van aparte.
ALTER TABLE reporte_contador_periodo
    ADD COLUMN IF NOT EXISTS base_devoluciones_original NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS impuesto_devoluciones_original NUMERIC(14,2) DEFAULT 0;
