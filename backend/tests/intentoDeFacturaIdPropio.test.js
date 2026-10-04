const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * El intento de factura devuelve SIEMPRE nuestro id (migración 041).
 *
 * `factura_intento` vino de producción con el id de Alegra de cada documento
 * creado, y el código nuevo escribía el id propio en esa misma columna. Al
 * reenviar una factura ya creada, el servidor contestaba ese número como si
 * fuera `factura.id`: medido en la copia local, la clave de la factura
 * 001000014841 devolvía 5369 —su id de Alegra—, y acá la 5369 es de otro
 * cliente. La tablet la habría guardado y abierto en PDF.
 *
 * Contra PostgreSQL local, en una transacción que se deshace, porque lo que
 * se prueba es justo el cruce entre dos espacios de ids y eso no lo ve un
 * doble. Se arman los tres casos reales:
 *  · un intento de FACTURA de antes del corte, cuya factura ya está copiada;
 *  · otro cuya factura todavía no se copió;
 *  · un intento de COTIZACIÓN (en producción usan la misma tabla), cuyo id y
 *    número de Alegra calzan los dos con una factura vieja: la cotización 7 y
 *    la factura 7 de junio de 2024. La primera versión de la migración las
 *    enlazó.
 */

const MIGRACION = path.join(__dirname, '..', 'migrations', 'independencia', '041_intento_de_factura_con_id_propio.sql');

describe('el intento de factura y los ids propios — contra PostgreSQL local', () => {
  let pool, conexion, idem;
  let facturaCopiada;

  // Números imposibles de confundir con datos reales.
  const ALEGRA_FACTURA = '900000111';      // id de Alegra de la factura ya copiada
  const ALEGRA_SIN_COPIAR = '900000333';
  const ALEGRA_COTIZACION = '900000222';   // id de Alegra de una cotización…
  const OTRA_FACTURA = 900000111;          // …y una factura propia cuyo id ES ese número

  const viejo = (cliente) => ({ client: cliente, date: '2026-09-07', items: [{ id: 983, quantity: 2, price: 1000 }] });
  const fila = async (clave) => (await conexion.query('SELECT * FROM factura_intento WHERE clave = $1', [clave])).rows[0];

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    const rutaIdem = require.resolve('../src/modules/facturacion/idempotencia');
    delete require.cache[rutaIdem];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'int') };
    idem = require(rutaIdem);

    const factura = async (columnas, valores) => (await conexion.query(
      `INSERT INTO factura (${columnas}, cliente_nombre, fecha, estado)
       VALUES (${valores.map((_, i) => `$${i + 1}`).join(', ')}, 'zz-cliente de prueba', CURRENT_DATE, 'emitida') RETURNING id`,
      valores)).rows[0].id;

    // La factura de la clave, ya copiada de Alegra: tiene su id propio.
    facturaCopiada = await factura('alegra_id, numero', [ALEGRA_FACTURA, 'ZZ-0001']);
    // OTRA factura, de otro cliente, cuyo id propio es el id de Alegra de la primera.
    await factura('id, numero', [OTRA_FACTURA, 'ZZ-OTRA']);
    // Una factura vieja que calza en id de Alegra Y en número con una cotización.
    await factura('alegra_id, numero', [ALEGRA_COTIZACION, ALEGRA_COTIZACION]);

    const intento = (clave, huella, alegraId, numero) => conexion.query(
      `INSERT INTO factura_intento (clave, estado, huella, alegra_invoice_id, numero_factura)
       VALUES ($1, 'creada', $2, $3, $4)`, [clave, huella, alegraId, numero]);
    await intento('zz-disp-copiada', idem.huellaAnteriorDe(viejo(38)), ALEGRA_FACTURA, 'ZZ-0001');
    await intento('zz-disp-sin-copiar', idem.huellaAnteriorDe(viejo(39)), ALEGRA_SIN_COPIAR, 'ZZ-0003');
    await intento('zz-cot-vieja', null, ALEGRA_COTIZACION, ALEGRA_COTIZACION);
  });

  after(async () => {
    const rutaDb = require.resolve('../config/database');
    delete require.cache[rutaDb];
    delete require.cache[require.resolve('../src/modules/facturacion/idempotencia')];
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('reenviar una factura creada en Alegra devuelve NUESTRO id, no el de allá', async () => {
    const r = await idem.reservar('zz-disp-copiada', viejo(38));

    assert.equal(r.seguir, false);
    assert.equal(r.yaCreada.id, facturaCopiada);
    assert.notEqual(r.yaCreada.id, OTRA_FACTURA, 'devolvió el id de Alegra: acá ese número es la factura de otro cliente');
    assert.equal(r.yaCreada.numero, 'ZZ-0001');
  });

  test('si esa factura todavía no se copió, no hay id: queda el número', async () => {
    const r = await idem.reservar('zz-disp-sin-copiar', viejo(39));

    assert.deepEqual(r, { seguir: false, yaCreada: { id: null, numero: 'ZZ-0003' } });
  });

  test('la clave de una cotización no se entrega como factura, aunque calcen el id y el número', async () => {
    await assert.rejects(
      () => idem.reservar('zz-cot-vieja', viejo(38)),
      (e) => e.status === 409 && /otro documento distinto/.test(e.message)
    );
  });

  test('una factura creada acá queda en `factura_id`, y la columna de Alegra vacía', async () => {
    const propia = { clienteId: 38, date: '2026-10-04', items: [{ id: 983, productoId: 983, quantity: 1, price: 500 }] };
    assert.equal((await idem.reservar('zz-disp-nueva', propia)).seguir, true);
    await idem.marcarCreada('zz-disp-nueva', { id: facturaCopiada, numero: 'ZZ-0001' });

    const guardada = await fila('zz-disp-nueva');
    assert.equal(guardada.estado, 'creada');
    assert.equal(guardada.factura_id, facturaCopiada);
    assert.equal(guardada.alegra_invoice_id, null);

    const otraVez = await idem.reservar('zz-disp-nueva', propia);
    assert.deepEqual(otraVez, { seguir: false, yaCreada: { id: facturaCopiada, numero: 'ZZ-0001' } });
  });

  test('la migración enlaza la factura y deja la cotización sin enlazar; correrla dos veces no cambia nada', async () => {
    const sentencias = fs.readFileSync(MIGRACION, 'utf8')
      .replace(/^--.*$/gm, '')
      .split(';').map(s => s.trim()).filter(s => /^UPDATE factura_intento/.test(s));
    assert.equal(sentencias.length, 2, 'la migración cambió de forma: revisar qué corre esta prueba');

    // Lo que hizo la primera versión de la migración: la cotización enlazada
    // a la factura vieja que calza en id y número.
    await conexion.query(
      `UPDATE factura_intento SET factura_id = (SELECT id FROM factura WHERE alegra_id = $1) WHERE clave = 'zz-cot-vieja'`,
      [ALEGRA_COTIZACION]);

    const correr = async () => { for (const sql of sentencias) await conexion.query(sql); };
    await correr();

    assert.equal((await fila('zz-disp-copiada')).factura_id, facturaCopiada);
    assert.equal((await fila('zz-disp-sin-copiar')).factura_id, null);
    assert.equal((await fila('zz-cot-vieja')).factura_id, null, 'una cotización quedó enlazada a una factura');

    const antes = (await conexion.query(`SELECT clave, factura_id FROM factura_intento WHERE clave LIKE 'zz-%' ORDER BY clave`)).rows;
    await correr();
    const despues = (await conexion.query(`SELECT clave, factura_id FROM factura_intento WHERE clave LIKE 'zz-%' ORDER BY clave`)).rows;
    assert.deepEqual(despues, antes);
  });

  test('en la copia local no queda ningún intento sin huella con factura', async () => {
    // Lo que deja la migración sobre los datos de verdad: las claves de
    // cotizaciones de producción no apuntan a ninguna factura.
    const { rows } = await conexion.query(
      `SELECT clave FROM factura_intento WHERE huella IS NULL AND factura_id IS NOT NULL AND clave NOT LIKE 'zz-%'`);
    assert.deepEqual(rows, []);
  });
});
