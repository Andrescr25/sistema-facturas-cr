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

// Facturación conserva emitida la factura anulada mediante notas. La misma
// tolerancia de medio colón sirve para despacho y para última atención; un
// cobro completo o una factura gratis sin créditos siguen siendo ventas.
const SIN_CREDITO_TOTAL = `NOT (${ACREDITADO} > 0 AND ${ACREDITADO} >= f.total - 0.5)`;

module.exports = { COBRADO, ACREDITADO, SIN_CREDITO_TOTAL };
