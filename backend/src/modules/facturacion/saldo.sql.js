/**
 * Una sola regla para la pantalla, el portal y la conciliación. Esta parte
 * es SQL puro: una auditoría puede usarla sin cargar servicios ni conexiones.
 * No leer factura.saldo/total_pagado: son la foto histórica de la importación.
 */
const COBRADO = `
  COALESCE((SELECT SUM(pf.monto)
              FROM pago_factura pf
              JOIN pago p ON p.id = pf.pago_id
             WHERE pf.factura_id = f.id AND p.anulado = FALSE), 0)`;

const ACREDITADO = `
  COALESCE((SELECT SUM(nf.monto)
              FROM nota_credito_factura nf
              JOIN nota_credito nc ON nc.id = nf.nota_credito_id
             WHERE nf.factura_id = f.id AND nc.estado <> 'anulada'), 0)`;

module.exports = { COBRADO, ACREDITADO };
