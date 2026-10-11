const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

/**
 * En Cuentas por Cobrar un cliente es una sola fila.
 *
 * Lo que pasaba (2026-10-10, al cargar producción): la lista agrupaba por
 * cliente Y por el nombre, la cédula y el teléfono copiados en cada factura.
 * Esas copias cambian: el tiquete sale con el nombre de la casa y la factura
 * electrónica con el nombre legal. El mismo cliente aparecía dos veces, con
 * la deuda partida, y React avisaba "two children with the same key". Eran
 * 13 de 142 clientes.
 *
 * Contra PostgreSQL local, en una transacción que se deshace.
 */
describe('la lista de deudores — contra PostgreSQL local', () => {
  let pool, conexion, cobros, clienteId;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    const rutaServicio = require.resolve('../src/modules/cuentas-por-cobrar/cobros.service');
    delete require.cache[rutaServicio];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'deu') };
    cobros = require(rutaServicio);

    clienteId = (await conexion.query(
      `INSERT INTO cliente (nombre) VALUES ('zz-deudor de prueba') RETURNING id`)).rows[0].id;
    const insertar = (numero, fecha, total, nombre, resto = {}) => conexion.query(
      `INSERT INTO factura (numero, fecha, estado, total, cliente_nombre, cliente_id, cliente_identificacion, cliente_telefono)
       VALUES ($1, $2, 'emitida', $3, $4, $5, $6, $7)`,
      [numero, fecha, total, nombre, resto.clienteId ?? null, resto.identificacion ?? null, resto.telefono ?? null]);

    // El mismo cliente: un tiquete con el nombre de la casa y, después, una
    // factura electrónica con el nombre legal y la cédula.
    await insertar('ZZ-DEU-0001', '2026-09-01', 1000, 'zz-deudor LA PULPERIA', { clienteId, telefono: '88880000' });
    await insertar('ZZ-DEU-0002', '2026-09-15', 2500, 'zz-deudor JUAN PEREZ SOCIEDAD ANONIMA', { clienteId, identificacion: '3101000000' });
    // Dos facturas sin ficha de cliente, con nombres distintos: no hay con qué unirlas.
    await insertar('ZZ-DEU-0003', '2026-09-02', 700, 'zz-deudor sin ficha UNO');
    await insertar('ZZ-DEU-0004', '2026-09-03', 800, 'zz-deudor sin ficha DOS');
  });

  after(async () => {
    delete require.cache[require.resolve('../config/database')];
    delete require.cache[require.resolve('../src/modules/cuentas-por-cobrar/cobros.service')];
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('un cliente con dos nombres en sus facturas sale una vez, con toda su deuda', async () => {
    const { data } = await cobros.listarDeudores({ buscar: 'zz-deudor', limite: 1000 });
    const suyas = data.filter(d => d.clienteId === clienteId);

    assert.equal(suyas.length, 1, 'el mismo cliente quedó partido en varias filas');
    assert.equal(suyas[0].facturas, 2);
    assert.equal(suyas[0].saldoTotal, 3500);
    assert.deepEqual(suyas[0].detalle.map(f => f.numero), ['ZZ-DEU-0001', 'ZZ-DEU-0002']);
  });

  test('se muestra lo de su factura más reciente, y el dato que esa no trae sale de otra', async () => {
    const { data } = await cobros.listarDeudores({ buscar: 'zz-deudor', limite: 1000 });
    const suya = data.find(d => d.clienteId === clienteId);

    assert.equal(suya.nombre, 'zz-deudor JUAN PEREZ SOCIEDAD ANONIMA');
    assert.equal(suya.identificacion, '3101000000');
    assert.equal(suya.telefono, '88880000', 'el teléfono solo venía en la factura vieja');
  });

  test('sin ficha de cliente se sigue agrupando por lo que dice la factura', async () => {
    const { data } = await cobros.listarDeudores({ buscar: 'zz-deudor sin ficha', limite: 1000 });

    assert.equal(data.length, 2);
    assert.deepEqual(data.map(d => d.nombre).sort(), ['zz-deudor sin ficha DOS', 'zz-deudor sin ficha UNO']);
  });

  test('ningún cliente con ficha se repite en la cartera entera', async () => {
    const { data } = await cobros.listarDeudores({ limite: 1000 });
    const ids = data.map(d => d.clienteId).filter(id => id != null);

    assert.equal(new Set(ids).size, ids.length);
  });
});
