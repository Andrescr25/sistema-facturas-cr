/**
 * Caja General: la única cuenta por donde pasa la plata del negocio.
 *
 * Decisión del usuario (2026-09-23): no hay fondo fijo ni cajas separadas
 * para proveedores o clientes. Todo cobro ENTRA a Caja General y todo pago
 * —a proveedores o de gastos— SALE de ella; el método (efectivo, SINPE,
 * transferencia…) dice cómo, no de dónde. Los movimientos se leen en la vista
 * `movimiento_caja` (migración 027), armada sobre los mismos documentos: no
 * hay una segunda tabla que se pueda desincronizar ni un movimiento que se
 * pueda contar dos veces.
 *
 * La cuenta se busca por nombre porque así la sembró la migración 002 y así
 * la usaban ya los cobros. Si no existe o está inactiva, se dice, en vez de
 * guardar un pago que no sale de ningún lado.
 */

const CAJA_GENERAL = 'Caja general';

/** @returns {Promise<number>} el id de Caja General */
async function idCajaGeneral(ejecutor) {
  const { rows } = await ejecutor.query(
    'SELECT id FROM cuenta_dinero WHERE nombre = $1 AND activo = TRUE LIMIT 1', [CAJA_GENERAL]
  );
  if (!rows[0]) {
    const error = new Error(`No existe la cuenta "${CAJA_GENERAL}" (o está inactiva): revisala en Configuración.`);
    error.status = 409;
    throw error;
  }
  return rows[0].id;
}

/**
 * El método de un pago que sale de Caja General: que exista y esté activo, y
 * su referencia si la pide (SINPE, transferencia…). Lo comparten los pagos a
 * proveedores y los pagos a empleados (2026-10-30).
 */
async function metodoDePago(ejecutor, metodoPagoId, referenciaCruda, { referenciaOpcional = false } = {}) {
  const id = Number(metodoPagoId);
  const fallar = (mensaje) => { const error = new Error(mensaje); error.status = 400; throw error; };
  if (!id) fallar('Falta el método de pago.');
  const { rows } = await ejecutor.query('SELECT id, nombre, pide_referencia FROM metodo_pago WHERE id = $1 AND activo = TRUE', [id]);
  const metodo = rows[0];
  if (!metodo) fallar('Ese método de pago no existe o está inactivo.');
  const referencia = referenciaCruda ? String(referenciaCruda).trim().slice(0, 60) : null;
  if (metodo.pide_referencia && !referencia && !referenciaOpcional) fallar(`${metodo.nombre}: falta el número de referencia del pago.`);
  return { metodo, referencia };
}

module.exports = { CAJA_GENERAL, idCajaGeneral, metodoDePago };
