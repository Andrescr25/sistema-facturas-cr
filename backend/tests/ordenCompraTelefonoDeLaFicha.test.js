const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * La orden de compra le escribe al proveedor al WhatsApp de su FICHA.
 *
 * Había dos lugares para ese número: el campo de la ficha del proveedor
 * —"WhatsApp (para la orden de compra)"— y `proveedor_contactos`, una tabla
 * aparte llaveada por el NOMBRE del proveedor, que era la que la orden leía
 * y escribía. Cambiar el número en la ficha no cambiaba a dónde iba la orden.
 *
 * Y en la práctica no se leía ninguno de los dos: la pantalla buscaba
 * `response.data.telefono` y el servidor lo manda adentro de `data`, así que
 * recibía siempre null y mostraba el número que ese navegador recordaba por
 * su cuenta (`localStorage`). Cada computadora, el suyo.
 *
 * Contra PostgreSQL local, en una transacción que se deshace: lo que se cuida
 * es a QUÉ ficha se llega —por cédula, nunca adivinando entre dos nombres
 * iguales— y que guardar pase por la ficha de verdad, con su bitácora.
 */

const RAIZ = path.join(__dirname, '..', '..');

describe('el WhatsApp del proveedor para la orden — contra PostgreSQL local', () => {
  let pool, conexion, servicio;
  let uno, soloNombre, usuarioId;

  const ficha = async (id) => (await conexion.query('SELECT telefono_whatsapp FROM proveedor WHERE id = $1', [id])).rows[0];
  const cambiosEnBitacora = async (id) => Number((await conexion.query(
    `SELECT COUNT(*) AS n FROM bitacora_cambio WHERE entidad = 'proveedor' AND entidad_id = $1`, [String(id)])).rows[0].n);
  const contactosViejos = async () => Number((await conexion.query('SELECT COUNT(*) AS n FROM proveedor_contactos')).rows[0].n);

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'prv') };
    const Servicio = require('../src/modules/orders-whatsapp/orders-whatsapp.service');
    servicio = new Servicio();

    const crear = async (nombre, identificacion, whatsapp) => (await conexion.query(
      `INSERT INTO proveedor (nombre, tipo_identificacion, identificacion, telefono_whatsapp)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [nombre, identificacion ? 'EXTRANJERO' : null, identificacion, whatsapp])).rows[0].id;

    uno = await crear('zz-Proveedor Uno S.A.', 'zz-310-uno', '50688881111');
    await crear('zz-Dos Grafías', 'zz-310-dos-a', '50688882222');
    await crear('ZZ-DOS GRAFÍAS', 'zz-310-dos-b', '50688883333');
    soloNombre = await crear('zz-Solo Por Nombre', null, null);
    usuarioId = (await conexion.query('SELECT id FROM usuario ORDER BY id LIMIT 1')).rows[0].id;
  });

  after(async () => {
    delete require.cache[require.resolve('../config/database')];
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('por cédula se llega a la ficha, aunque el nombre de la orden sea otra grafía', async () => {
    const r = await servicio.getProveedorContacto({ cedula: 'zz-310-uno', nombre: 'PROVEEDOR UNO SOCIEDAD ANONIMA' });
    assert.deepEqual(r, { proveedorId: uno, telefono: '50688881111' });
  });

  test('sin cédula, por el nombre exacto si hay UNA sola ficha con ese nombre', async () => {
    const r = await servicio.getProveedorContacto({ cedula: null, nombre: '  ZZ-SOLO POR NOMBRE ' });
    assert.deepEqual(r, { proveedorId: soloNombre, telefono: null });
  });

  test('dos fichas con el mismo nombre: no se adivina a cuál escribirle', async () => {
    const r = await servicio.getProveedorContacto({ cedula: '', nombre: 'zz-dos grafías' });
    assert.deepEqual(r, { proveedorId: null, telefono: null });
  });

  test('"Sin proveedor" y un proveedor que no tiene ficha no tienen número', async () => {
    assert.deepEqual(await servicio.getProveedorContacto({ cedula: 'SIN_PROVEEDOR', nombre: 'Sin_Proveedor' }), { proveedorId: null, telefono: null });
    assert.deepEqual(await servicio.getProveedorContacto({ cedula: 'zz-no-existe', nombre: 'zz-Proveedor Uno S.A.' }), { proveedorId: null, telefono: null },
      'con cédula se busca SOLO por cédula: no se cae al nombre');
    assert.deepEqual(await servicio.getProveedorContacto({}), { proveedorId: null, telefono: null });
  });

  test('guardar deja el número en la ficha, como la ficha guarda sus teléfonos, y queda en la bitácora', async () => {
    const antes = await cambiosEnBitacora(uno);
    const viejos = await contactosViejos();

    // Copiado y pegado: con guion y con una marca invisible de dirección de texto.
    const r = await servicio.guardarProveedorContacto({ cedula: 'zz-310-uno', nombre: 'lo que sea', telefono: '\u202a8888-2222' }, usuarioId);

    // "8888 2222" es el formato del validador de la ficha: el mismo que queda
    // si se cambia desde la pestaña Fichas.
    assert.deepEqual(r, { proveedorId: uno, telefono: '8888 2222', cambiado: true });
    assert.equal((await ficha(uno)).telefono_whatsapp, '8888 2222');
    assert.equal(await cambiosEnBitacora(uno), antes + 1);
    assert.equal(await contactosViejos(), viejos, 'se escribió en la tabla vieja por nombre');
    // Y es lo que lee la próxima orden, desde cualquier computadora.
    assert.equal((await servicio.getProveedorContacto({ cedula: 'zz-310-uno' })).telefono, '8888 2222');
  });

  test('mandar otra orden al mismo número no escribe nada', async () => {
    const antes = await cambiosEnBitacora(uno);
    const r = await servicio.guardarProveedorContacto({ cedula: 'zz-310-uno', nombre: 'x', telefono: '+506 8888 2222' }, usuarioId);

    // El mismo número escrito de otra forma (con el 506) no es un cambio.
    assert.equal(r.cambiado, false);
    assert.equal(await cambiosEnBitacora(uno), antes);
    assert.equal((await ficha(uno)).telefono_whatsapp, '8888 2222');
  });

  test('un proveedor sin ficha: se dice, y no se guarda en ningún lado', async () => {
    const viejos = await contactosViejos();
    await assert.rejects(
      () => servicio.guardarProveedorContacto({ cedula: null, nombre: 'zz-Proveedor Sin Ficha', telefono: '88884444' }, usuarioId),
      (e) => e.status === 404 && /no tiene ficha/.test(e.message)
    );
    assert.equal(await contactosViejos(), viejos);
  });

  test('un número imposible se rechaza y la ficha queda como estaba', async () => {
    await assert.rejects(() => servicio.guardarProveedorContacto({ cedula: 'zz-310-uno', nombre: 'x', telefono: '123' }, usuarioId));
    assert.equal((await ficha(uno)).telefono_whatsapp, '8888 2222');
  });
});

describe('ya no hay un segundo lugar para ese número', () => {
  const { sinComentarios } = require('./dobles/sinComentarios');
  const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');

  test('ningún módulo lee ni escribe `proveedor_contactos`', () => {
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      return e.name.endsWith('.js') ? [ruta] : [];
    });
    const culpables = ['src', 'services'].flatMap(c => recorrer(path.join(RAIZ, 'backend', c)))
      .filter(ruta => /proveedor_contactos/.test(sinComentarios(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });

  test('ni la tabla vieja `proveedores`: la única lista de proveedores es el maestro', () => {
    // `proveedor` (singular) es el maestro. La plural era la lista vieja, sin
    // cédula; sigue en la base por las llaves que la apuntan, sin código.
    const recorrer = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      return e.name.endsWith('.js') ? [ruta] : [];
    });
    const culpables = ['src', 'services'].flatMap(c => recorrer(path.join(RAIZ, 'backend', c)))
      .filter(ruta => /\b(FROM|JOIN|INTO|UPDATE)\s+proveedores\b/i.test(sinComentarios(fs.readFileSync(ruta, 'utf8'))))
      .map(ruta => path.relative(RAIZ, ruta));

    assert.deepEqual(culpables, []);
  });

  test('la ruta nombra con qué se busca: cédula y nombre, no un nombre en la dirección', () => {
    const rutas = sinComentarios(leer('backend', 'src', 'modules', 'orders-whatsapp', 'orders-whatsapp.routes.js'));
    assert.match(rutas, /router\.get\('\/proveedor-contacto', controller\.getProveedorContacto\)/);
    assert.equal(/proveedor-contacto\/:/.test(rutas), false);
  });

  test('la pantalla envía al destino seguro resuelto en la ficha por el servidor', () => {
    const hook = leer('frontend', 'src', 'hooks', 'useEnvioOrdenProveedor.js');
    const envio = leer('backend', 'src', 'modules', 'orders-whatsapp', 'ordenesCicloEnvio.service.js');
    assert.match(hook, /api\.post\('\/orden-compra\/proveedor\/enviar', intento\.cuerpo\)/);
    assert.doesNotMatch(hook, /setTelefono|telefonos\[0\]|telefono:/);
    assert.match(envio, /SELECT telefono_whatsapp,telefono FROM proveedor WHERE id=\$1/);
    assert.match(envio, /\[o\.proveedor_id\]/);
    assert.doesNotMatch(hook, /localStorage|proveedor_telefono/);
  });
});
