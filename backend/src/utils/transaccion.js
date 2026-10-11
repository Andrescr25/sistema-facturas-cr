/**
 * Corre `trabajo(cliente)` dentro de una transacción: COMMIT si termina,
 * ROLLBACK si lanza, y siempre devuelve la conexión.
 *
 * Recibe el pool en vez de requerirlo: así cada servicio usa el suyo y las
 * pruebas pueden sustituirlo.
 */
async function enTransaccion(pool, trabajo) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await trabajo(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { enTransaccion };
