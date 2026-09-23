/**
 * Libera la cuenta por pagar de una factura del buzón y la cuelga de la
 * compra que acaba de nacer de ella —y de su proveedor por id propio—.
 *
 * Corre en SQL crudo DENTRO de la transacción de quien registra la compra
 * —`compras.service.js` o el adaptador de gastos recurrentes—: con la
 * conexión de Prisma sería OTRA conexión, y un rollback de la compra no
 * revertiría lo que ya se hubiera confirmado. Está en su propio archivo para
 * que las dos transacciones usen la MISMA función.
 *
 * YA NO CALCULA EL SALDO NI EL ESTADO (migración 025): los dos salen de la
 * vista `cuenta_por_pagar_saldo`, que descuenta sola las notas de crédito
 * aplicadas antes de liberar. Recalcularlos acá era una segunda copia de la
 * misma cuenta, que además se guardaba y se quedaba vieja.
 *
 * Una compra de CONTADO puede no tener cuenta por pagar — no es un error, es
 * la mayoría de las compras al contado.
 *
 * @param {import('pg').PoolClient} cliente  la conexión DENTRO de la transacción
 * @param {string} facturaProveedorId
 * @param {number} compraId
 * @returns {Promise<object|null>} la cuenta liberada, o null si no tenía
 */
async function liberarCuentaPorPagar(cliente, facturaProveedorId, compraId) {
  const { rows } = await cliente.query(
    `UPDATE cuentas_por_pagar c
        SET liberada = TRUE,
            compra_id = $2,
            proveedor_id = COALESCE(c.proveedor_id, (SELECT proveedor_id FROM compra WHERE id = $2))
      WHERE c.factura_id = $1
      RETURNING *`,
    [facturaProveedorId, compraId]
  );
  return rows[0] || null;
}

module.exports = { liberarCuentaPorPagar };
