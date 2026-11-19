/**
 * Lo que impide tocar una factura ya emitida, en piezas que comparten Editar
 * (`facturaPropia.service`, `revisarSiSePuedeTocar`) y Cambiar el descuento de
 * una línea (`descuentoLinea.service`, 2026-11-11). Una sola copia de cada
 * regla: si cambia, cambia para los dos.
 */
const { httpError } = require('../../utils/validacion');

/** Lo que Hacienda ya tiene —aceptado o esperando respuesta— no se toca. */
function exigirFueraDeHacienda(factura, accion) {
  if (factura.electronica) {
    throw httpError(409,
      `La factura ${factura.numero} se emitió como electrónica: ante Hacienda ya existe y no se puede ${accion}. ` +
      'Se corrige con una nota de crédito.');
  }
  if (['pendiente', 'enviada'].includes(factura.hacienda_estado)) {
    throw httpError(409, 'La factura está reservada ante Hacienda. Consulte el resultado antes de editar o anular.');
  }
}

// SOLO LO VIGENTE. Un cobro anulado y una nota anulada siguen en su tabla —no
// se borran, por el rastro—: es la misma regla del saldo (saldo.sql.js).
async function cobradoDe(db, facturaId) {
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(SUM(pf.monto), 0) AS total
       FROM pago_factura pf JOIN pago p ON p.id = pf.pago_id
      WHERE pf.factura_id = $1 AND p.anulado = FALSE`, [facturaId]);
  return Number(r.total) || 0;
}

async function acreditadoDe(db, facturaId) {
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(SUM(nf.monto), 0) AS total
       FROM nota_credito_factura nf JOIN nota_credito nc ON nc.id = nf.nota_credito_id
      WHERE nf.factura_id = $1 AND nc.estado <> 'anulada'`, [facturaId]);
  return Number(r.total) || 0;
}

/**
 * Un producto con nota de crédito vigente en esa factura (2026-11-19): ya se le
 * acreditó al cliente. No se cambia por otro en Reporte Clientes ni sale ahí.
 * La nota casa sus líneas con las de la factura por producto y número de línea
 * (`notaCredito.service`), así que esa línea no se toca.
 */
const productoConNotaSql = (factura, producto) => `EXISTS (SELECT 1 FROM nota_credito_factura nf
    JOIN nota_credito nc ON nc.id = nf.nota_credito_id AND nc.estado <> 'anulada'
    JOIN nota_credito_linea ncl ON ncl.nota_credito_id = nc.id
   WHERE nf.factura_id = ${factura} AND ncl.producto_id = ${producto})`;

/** Las líneas de la factura que tienen una nota de crédito vigente, con cómo están hoy. */
async function lineasAcreditadasEn(db, facturaId) {
  const { rows } = await db.query(
    `SELECT DISTINCT ncl.producto_id, ncl.numero_linea, l.nombre, l.cantidad, l.precio_unitario, l.descuento_porcentaje
       FROM nota_credito_factura nf
       JOIN nota_credito nc ON nc.id = nf.nota_credito_id AND nc.estado <> 'anulada'
       JOIN nota_credito_linea ncl ON ncl.nota_credito_id = nc.id
       JOIN factura_linea l ON l.factura_id = nf.factura_id AND l.numero_linea = ncl.numero_linea
                           AND l.producto_id IS NOT DISTINCT FROM ncl.producto_id
      WHERE nf.factura_id = $1
      ORDER BY ncl.numero_linea`, [facturaId]);
  return rows.map(r => ({ ...r, numero_linea: Number(r.numero_linea) }));
}

/**
 * Impresión con una nota de crédito (2026-11-19): puede cambiar la factura,
 * pero cada línea acreditada queda igual —mismo producto, número, cantidad,
 * precio y descuento—, porque la nota la reconoce por producto y número. Y el
 * total no puede quedar por debajo de lo acreditado.
 */
function exigirAcreditadasIntactas(factura, acreditadas, nuevas, total, acreditado) {
  for (const a of acreditadas) {
    const n = nuevas.find(l => Number(l.numero_linea) === a.numero_linea);
    const igual = n && n.producto_id === a.producto_id && Number(n.cantidad) === Number(a.cantidad)
      && Number(n.precio_unitario) === Number(a.precio_unitario)
      && Number(n.descuento_porcentaje) === Number(a.descuento_porcentaje);
    if (!igual) {
      throw httpError(409,
        `La factura ${factura.numero} tiene una nota de crédito sobre ${a.nombre} (línea ${a.numero_linea}): ` +
        'esa línea no se puede cambiar ni mover de lugar. Lo que no llegó de los demás productos, corregilo con otra nota de crédito.');
    }
  }
  if (total < acreditado) {
    throw httpError(409, `La factura ${factura.numero} quedaría por debajo de lo que ya se le acreditó con nota de crédito.`);
  }
}

module.exports = { exigirFueraDeHacienda, cobradoDe, acreditadoDe, productoConNotaSql, lineasAcreditadasEn, exigirAcreditadasIntactas };
