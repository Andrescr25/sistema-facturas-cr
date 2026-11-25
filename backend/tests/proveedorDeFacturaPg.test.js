const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomInt } = require('node:crypto');

/**
 * El SQL de proveedorDeFactura contra PostgreSQL de verdad (la prueba
 * unitaria lo simula): el índice parcial de la cédula, `xmax = 0` para saber
 * si la fila es nueva, y la búsqueda sin guiones ni ceros. Todo dentro de un
 * BEGIN/ROLLBACK: no deja nada.
 */
describe('proveedorDeFactura — contra PostgreSQL local', () => {
  let pool, c, proveedorDeFactura;
  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    ({ pool } = require('../config/database'));
    ({ proveedorDeFactura } = require('../src/modules/proveedores/proveedorDeFactura'));
    c = await pool.connect();
    await c.query('BEGIN');
  });
  after(async () => {
    if (c) { await c.query('ROLLBACK'); c.release(); }
    if (pool) await pool.end();
  });

  test('la primera vez la crea, con bitácora; la segunda la encuentra aunque la cédula venga con guiones', async () => {
    const cedula = '3102' + randomInt(100000, 999999);
    const factura = {
      numero_consecutivo: '00100002010000099999', proveedor_cedula: cedula, proveedor_nombre: 'ZZ Proveedor de prueba S.R.L',
      proveedor_email: 'zz@ejemplo.com', proveedor_telefono: '2440-1234', xml_ruta: null
    };

    const primera = await proveedorDeFactura(c, factura, null);
    assert.equal(primera.creado, true);
    assert.equal(primera.proveedor.identificacion, cedula);
    assert.equal(primera.proveedor.nombre, 'ZZ Proveedor de prueba S.R.L');
    assert.equal(primera.proveedor.correo, 'zz@ejemplo.com');
    assert.equal(primera.proveedor.telefono, '2440 1234');
    assert.equal(primera.proveedor.activo, true);
    assert.equal(primera.proveedor.recien_creado, undefined);

    const conGuiones = `${cedula[0]}-${cedula.slice(1, 4)}-${cedula.slice(4)}`;
    const segunda = await proveedorDeFactura(c, { ...factura, proveedor_cedula: conGuiones }, null);
    assert.equal(segunda.creado, false);
    assert.equal(segunda.proveedor.id, primera.proveedor.id);

    const { rows: [{ n }] } = await c.query(
      "SELECT count(*)::int AS n FROM bitacora_cambio WHERE entidad = 'proveedor' AND entidad_id = $1 AND accion = 'crear'",
      [String(primera.proveedor.id)]
    );
    assert.equal(n, 1, 'una sola entrada de «crear»');
  });
});
