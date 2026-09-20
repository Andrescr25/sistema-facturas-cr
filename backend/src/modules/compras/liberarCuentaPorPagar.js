/**
 * Libera la cuenta por pagar de una factura del buzón y la cuelga de la
 * compra que acaba de nacer de ella.
 *
 * MISMO CÁLCULO que `pagosProveedoresService.liberarCuentaPorFactura`, pero
 * en SQL crudo para poder correr DENTRO de la transacción de quien registra
 * la compra — sea `compras.service.js` o el adaptador de gastos recurrentes.
 * Llamar a esa función usaría la conexión de Prisma, que es OTRA conexión a
 * la base: un rollback de la compra no revertiría lo que esa llamada ya
 * hubiera confirmado.
 *
 * Se extrajo a su propio archivo para que las dos transacciones que crean
 * una compra —la de Revisión de Precios y la de gastos recurrentes— usen la
 * MISMA función en vez de cada una llevar su copia.
 *
 * Una compra de CONTADO puede no tener cuenta por pagar — no es un error, es
 * la mayoría de las compras al contado.
 *
 * @param {import('pg').PoolClient} cliente  la conexión DENTRO de la transacción
 * @param {string} facturaProveedorId
 * @param {number} compraId
 */
async function liberarCuentaPorPagar(cliente, facturaProveedorId, compraId) {
  const { rows } = await cliente.query(
    'SELECT * FROM cuentas_por_pagar WHERE factura_id = $1 FOR UPDATE', [facturaProveedorId]
  );
  const cxp = rows[0];
  if (!cxp) return null;

  const { rows: creditoRows } = await cliente.query(
    'SELECT COALESCE(SUM(monto), 0) AS total FROM nota_credito_aplicacion WHERE cuenta_por_pagar_id = $1',
    [cxp.id]
  );
  const credito = Number(creditoRows[0].total) || 0;
  const saldo = Math.max(0, Math.round((Number(cxp.monto_total) - credito) * 100) / 100);
  const vencida = cxp.fecha_vencimiento && new Date(cxp.fecha_vencimiento) < new Date();
  const estado = saldo <= 0 ? 'PAGADA' : (vencida ? 'VENCIDA' : 'PENDIENTE');

  const { rows: actualizada } = await cliente.query(
    `UPDATE cuentas_por_pagar
        SET liberada = true, estado = $1, saldo_pendiente = $2, compra_id = $3
      WHERE id = $4 RETURNING *`,
    [estado, saldo, compraId, cxp.id]
  );
  return actualizada[0];
}

module.exports = { liberarCuentaPorPagar };
