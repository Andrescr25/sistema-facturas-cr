// La decisión confirmada es la cola durable previa a reservar un comprobante.
// Si el proceso cae después de pagar y antes de firmar, el trabajador retoma
// SÓLO la respuesta fiscal. Nunca ejecuta otra aprobación ni otro pago.
async function recuperarGastosPendientes(pool, responder) {
  const { rows } = await pool.query(`SELECT g.compra_id,g.decidido_por FROM gasto_operativo g
    WHERE g.decision IN ('aprobado','rechazado') AND g.validacion='validado'
      AND g.compra_id IS NOT NULL AND g.decidido_en < now()-interval '2 minutes'
      AND g.decidido_en > now()-interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM hacienda_comprobante h
        WHERE h.origen='compra' AND h.origen_id=g.compra_id AND h.ambiente='produccion')
    ORDER BY g.decidido_en,g.id LIMIT 5`);
  for (const r of rows) {
    try { await responder(r.compra_id, r.decidido_por); } catch { /* El gasto conserva su pendiente. */ }
  }
}
module.exports = { recuperarGastosPendientes };
