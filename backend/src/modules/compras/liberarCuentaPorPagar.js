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

/**
 * La cuenta por pagar de una compra de CONTADO (migración 028), para cuando
 * la factura llegó sin ninguna: al recibir el correo solo se crea si es a
 * crédito o trae plazo.
 *
 * Nace PENDIENTE, no pagada (decisión del usuario, 2026-09-23): el pago lo
 * indica una persona en Pagos a Proveedores —"esta factura de contado se pagó
 * vía efectivo"—, y recién ahí sale de Caja General, con su factura. Vence el
 * día de la factura; la vista la muestra como CONTADO, no como vencida.
 *
 * La llaman Registrar compra y la factura cargada a mano (compraManual.service.js).
 * Los gastos recurrentes (internet, luz) también crean una compra, pero se
 * pagan en Pagos Recurrentes: una cuenta acá contaría esa salida dos veces.
 *
 * @param {import('pg').PoolClient} cliente  la conexión DENTRO de la transacción
 * @param {object} factura  la fila de `facturas_proveedores` (o, a mano, sus mismos campos con `id` null)
 * @param {object} compra   la fila de `compra` recién creada
 * @returns {Promise<object|null>} la cuenta creada, o null si no hay nada que pagar
 */
async function crearCuentaDeContado(cliente, factura, compra) {
  if (!(Number(compra.total) > 0)) return null;
  const { rows } = await cliente.query(
    `INSERT INTO cuentas_por_pagar
       (factura_id, proveedor_nombre, proveedor_cedula, numero_consecutivo, condicion_venta,
        plazo_credito, fecha_emision, fecha_vencimiento, monto_total, saldo_pendiente, estado,
        liberada, compra_id, proveedor_id, de_contado)
     VALUES ($1, $2, $3, $4, '01', 0, $5, $5, $6, $6, 'PENDIENTE', TRUE, $7, $8, TRUE)
     ON CONFLICT (factura_id) DO NOTHING
     RETURNING *`,
    [
      factura.id, String(factura.proveedor_nombre || '').trim(), factura.proveedor_cedula,
      factura.numero_consecutivo, compra.fecha_emision, compra.total, compra.id, compra.proveedor_id
    ]
  );
  return rows[0] || null;
}

/**
 * La de una factura cargada a mano a CRÉDITO (compraManual.service.js): la
 * del buzón ya la trae desde que llegó el correo. Igual que la de contado,
 * pero vence `plazoDias` después de la factura y no es de contado.
 */
async function crearCuentaACredito(cliente, factura, compra, plazoDias) {
  if (!(Number(compra.total) > 0)) return null;
  const { rows } = await cliente.query(
    `INSERT INTO cuentas_por_pagar
       (factura_id, proveedor_nombre, proveedor_cedula, numero_consecutivo, condicion_venta,
        plazo_credito, fecha_emision, fecha_vencimiento, monto_total, saldo_pendiente, estado,
        liberada, compra_id, proveedor_id, de_contado)
     VALUES (NULL, $1, $2, $3, '02', $4::int, $5::date, $5::date + $4::int, $6, $6, 'PENDIENTE', TRUE, $7, $8, FALSE)
     RETURNING *`,
    [
      String(factura.proveedor_nombre || '').trim(), factura.proveedor_cedula, factura.numero_consecutivo,
      plazoDias, compra.fecha_emision, compra.total, compra.id, compra.proveedor_id
    ]
  );
  return rows[0];
}

module.exports = { liberarCuentaPorPagar, crearCuentaDeContado, crearCuentaACredito };
