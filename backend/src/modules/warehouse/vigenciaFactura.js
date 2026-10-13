const { ACREDITADO, SIN_CREDITO_TOTAL } = require('../facturacion/saldo.sql');
const { httpError } = require('../../utils/validacion');

// Facturación conserva la factura emitida cuando una nota la anula. Bodega
// debe mirar también las notas vigentes, con la tolerancia de medio colón
// que usa estadoDeFactura; cobrarla por completo NO cancela su despacho.
async function asegurarFacturaVigente(facturaId, db, { bloquear = false } = {}) {
  // Primero se espera el bloqueo y DESPUÉS se leen los créditos: una nota
  // confirmada mientras esperábamos debe verse en esta nueva consulta.
  if (bloquear) await db.query('SELECT id FROM factura WHERE id = $1 FOR UPDATE', [facturaId]);
  const { rows: [f] } = await db.query(`
    SELECT f.numero, f.estado, f.total, ${ACREDITADO} AS acreditado
      FROM factura f WHERE f.id = $1
  `, [facturaId]);
  const creditoTotal = Number(f?.acreditado) > 0 && Number(f.acreditado) >= Number(f.total) - 0.5;
  if (!f || f.estado !== 'emitida' || creditoTotal) {
    const motivo = !f ? 'ya no existe' : creditoTotal ? 'está anulada con nota de crédito' : `está ${f.estado}`;
    const error = httpError(f ? 409 : 404, `La factura ${f?.numero || facturaId} ${motivo}: no se alista.`);
    error.code = 'FACTURA_NO_VIGENTE';
    throw error;
  }
  return f;
}

module.exports = { SIN_CREDITO_TOTAL, asegurarFacturaVigente };
