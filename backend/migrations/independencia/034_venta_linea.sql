-- Rama independencia-alegra — 034: `venta_linea`, qué es una venta
-- (sección 12 del checklist: historial desde las facturas propias).
--
-- Hasta acá la rotación, las estadísticas, las sugerencias del portal y el
-- historial del catálogo del agente leían `venta_historico`: una copia de las
-- líneas de factura que se llenaba al facturar en Alegra y se repasaba cada
-- hora contra Alegra. Tenía tres problemas:
--
--   1. Había que sincronizarla. Una factura hecha en el sistema no existía
--      para la rotación hasta el siguiente repaso — y sin Alegra, nunca.
--   2. Se llaveaba por ids de Alegra (factura, producto y cliente).
--   3. Guardaba la línea COMO SE FACTURÓ. Una factura editada después (lo que
--      hace Impresión al rebajar faltantes) seguía contando lo que no se
--      entregó. Medido en la copia local: 139 pares factura-producto distintos
--      de 51.330, y 8 facturas emitidas que el historial nunca registró.
--
-- La vista no se sincroniza: ES las líneas de las facturas propias.
--
-- LA REGLA (la misma `esVenta` que vino de main): solo cuentan las facturas
-- EMITIDAS. Un borrador (proforma) no es una venta y una anulada tampoco: el
-- historial viejo llegó a contar 24 borradores y 132 anuladas.
--
-- `importe` es lo vendido en la línea SIN IVA y con su descuento restado (el
-- historial viejo no guardaba descuentos). Las notas de crédito no se restan,
-- igual que antes: quedan para la sección 13 (Reportes).

CREATE OR REPLACE VIEW venta_linea AS
SELECT l.id                                   AS linea_id,
       l.factura_id,
       f.numero                               AS factura_numero,
       f.fecha,
       f.cliente_id,
       f.cliente_nombre,
       l.producto_id,
       l.cantidad,
       l.precio_unitario,
       (l.cantidad * l.precio_unitario - COALESCE(l.descuento_monto, 0)) AS importe
  FROM factura_linea l
  JOIN factura f ON f.id = l.factura_id
 WHERE f.estado = 'emitida';

COMMENT ON VIEW venta_linea IS
  'Las ventas: una fila por línea de factura EMITIDA, con ids propios. Reemplaza a venta_historico (migración independencia/034).';
