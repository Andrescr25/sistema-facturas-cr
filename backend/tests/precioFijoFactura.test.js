/**
 * Precio y descuento fijos para quien no tiene «Cambiar precio y descuento»
 * (2026-10-29).
 *
 * El usuario va a contratar un agente de ventas: «el precio y descuento no lo
 * puede tocar». La pantalla esconde los campos, pero quien lo hace valer es
 * el servidor (facturacion/precioFijo.js). Acá se prueba la regla sola, el
 * camino real de crear y editar contra PostgreSQL (transacción que se
 * deshace), el controlador que decide por el permiso, y la migración 068, que
 * se lo da a todos los que ya tenían Facturación para que a nadie le cambie nada.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const { exigirPrecioDeLista } = require('../src/modules/facturacion/precioFijo');

// La oferta vigente sale de la base: acá una conexión de mentira con el 15 % al producto 7.
const conOfertas = (ofertas = {}) => ({
  query: async () => ({ rows: Object.entries(ofertas).map(([producto_id, descuento_porcentaje]) => ({ producto_id, descuento_porcentaje })) })
});
const PRODUCTO = { id: 7, nombre: 'CINTA METRICA 5M', precio: 1234.5 };
const revisar = (items, opciones, ofertas = { 7: 15 }) =>
  exigirPrecioDeLista(conOfertas(ofertas), items, () => PRODUCTO, opciones);
const rechazaPor = (patron) => (e) => e.status === 409 && e.code === 'PRECIO_FIJO' && patron.test(e.message);

describe('la regla: precio de lista y solo los descuentos que pone el sistema', () => {
  test('el precio de lista pasa; cualquier otro se rechaza diciendo cuál es', async () => {
    await revisar([{ productoId: 7, price: 1234.5, discount: 0 }]);
    await assert.rejects(revisar([{ productoId: 7, price: 1000, discount: 0 }]), rechazaPor(/Línea 1 \(CINTA METRICA 5M\).*₡1\.234,50 sin IVA/));
    await assert.rejects(revisar([{ productoId: 7, price: 1234.6, discount: 0 }]), rechazaPor(/no puede cambiar el precio/));
  });

  test('un descuento escrito a mano se rechaza; la oferta vigente y el del cliente pasan', async () => {
    await assert.rejects(revisar([{ productoId: 7, price: 1234.5, discount: 10 }]), rechazaPor(/no puede poner descuentos a mano/));
    await revisar([{ productoId: 7, price: 1234.5, discount: 15, descuentoBase: 15 }]);
    await revisar([{ productoId: 7, price: 1234.5, discount: 5, descuentoBase: 0 }], { porcentajeCliente: 5 });
    await revisar([{ productoId: 7, price: 1234.5, discount: 15, descuentoBase: 15 }], { porcentajeCliente: 5 });
  });

  test('la base del descuento tampoco se puede inventar, aunque el final calce', async () => {
    // El servidor completa el descuento del cliente sobre la base: una base
    // de 5 % escrita a mano daría 5 % aunque el cliente tenga 0.
    await assert.rejects(revisar([{ productoId: 7, price: 1234.5, discount: 5, descuentoBase: 5 }], { porcentajeCliente: 5 }),
      rechazaPor(/descuentos a mano/));
  });

  test('sin oferta vigente, el descuento de la oferta ya no vale', async () => {
    await assert.rejects(revisar([{ productoId: 7, price: 1234.5, discount: 15, descuentoBase: 15 }], {}, {}),
      rechazaPor(/descuentos a mano/));
  });

  test('al editar, también vale lo que ya tenía la línea (el precio de lista pudo cambiar después)', async () => {
    const anteriores = new Map([[7, { precios: ['1100.00000', 1150], descuentos: ['7'] }]]);
    await revisar([{ productoId: 7, precio: 1100, descuento: 7 }], { anteriores });
    await revisar([{ productoId: 7, precio: 1150, descuento: 0 }], { anteriores });
    await assert.rejects(revisar([{ productoId: 7, precio: 1120, descuento: 0 }], { anteriores }), rechazaPor(/precio/));
    await assert.rejects(revisar([{ productoId: 7, precio: 1100, descuento: 8 }], { anteriores }), rechazaPor(/descuentos/));
  });

  test('dice qué línea es: la segunda, no la primera', async () => {
    await assert.rejects(revisar([{ productoId: 7, price: 1234.5 }, { productoId: 7, price: 1 }]), rechazaPor(/^Línea 2 /));
  });

  test('una línea sin producto conocido la explica `armarLineas`, no esta regla', async () => {
    await exigirPrecioDeLista(conOfertas(), [{ productoId: 999, price: 1 }], () => undefined);
  });
});

describe('quién factura a precio fijo: lo decide la base, por permiso', () => {
  const { puedeHacer } = require('../src/modules/usuarios/permisos.middleware');
  const req = (permisos) => ({ usuario: { id: 99 }, permisos });

  test('con Facturación y sin el permiso de acción: precio fijo', async () => {
    assert.equal(await puedeHacer(req({ esAdmin: false, modulos: new Set(['facturacion', 'preventa']) }), 'precio-factura'), false);
  });

  test('con el permiso, o siendo administrador, puede cambiarlo', async () => {
    assert.equal(await puedeHacer(req({ esAdmin: false, modulos: new Set(['facturacion', 'precio-factura']) }), 'precio-factura'), true);
    assert.equal(await puedeHacer(req({ esAdmin: true, modulos: new Set() }), 'precio-factura'), true);
  });

  test('sin usuario en la petición no hay nada que restringir (igual que requirePermiso)', async () => {
    assert.equal(await puedeHacer({}, 'precio-factura'), true);
  });

  test('el permiso es una clave válida para guardar, y el administrador la tiene por su rol', () => {
    const { CLAVES, PERMISOS_DE_ACCION, MODULOS } = require('../src/modules/usuarios/modulos');
    assert.deepEqual(PERMISOS_DE_ACCION.map(a => a.clave), ['precio-factura', 'cobro-factura', 'facturas-todas', 'rutas-todas']);
    for (const clave of ['precio-factura', 'cobro-factura', 'facturas-todas', 'rutas-todas']) {
      assert.ok(CLAVES.includes(clave));
      assert.equal(MODULOS.some(m => m.clave === clave), false, `${clave} no es una pantalla: no va al menú`);
    }
    for (const a of PERMISOS_DE_ACCION) assert.ok(MODULOS.some(m => m.clave === a.modulo), `${a.clave}: su módulo existe`);
  });

  test('el controlador lo pregunta al crear y al editar', () => {
    const fuente = sinComentarios(fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaPropia.controller.js'), 'utf8'));
    assert.equal((fuente.match(/const precioFijo = !\(await puedeHacer\(req, 'precio-factura'\)\);/g) || []).length, 2);
    assert.match(fuente, /const sinCobro = !\(await puedeHacer\(req, 'cobro-factura'\)\);/);
    assert.match(fuente, /crearFactura\(datos, req\.usuario\?\.id, \{ clave: claveIdempotencia \|\| null, precioFijo, sinCobro \}\)/);
    assert.match(fuente, /const conCostos = await puedeHacer\(req, 'precio-factura'\);/);
    assert.match(fuente, /editarFactura\(req\.params\.id, req\.body \|\| \{\}, req\.usuario\?\.id, \{ precioFijo \}\)/);
  });
});

describe('la pantalla no ofrece lo que el servidor no va a aceptar', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('puedeAccion: sin el permiso no; con él, o administrador, sí', async () => {
    const { puedeAccion, PERMISOS_DE_ACCION, porGrupo } = await import(path.join(FRONT, 'utils', 'modulos.js'));
    assert.equal(puedeAccion({ esAdmin: false, modulos: ['facturacion'] }, 'precio-factura'), false);
    assert.equal(puedeAccion({ esAdmin: false, modulos: ['facturacion', 'precio-factura'] }, 'precio-factura'), true);
    assert.equal(puedeAccion({ esAdmin: true, modulos: [] }, 'precio-factura'), true);
    assert.equal(puedeAccion(null, 'precio-factura'), false);
    assert.deepEqual(PERMISOS_DE_ACCION.map(a => a.clave), ['precio-factura', 'cobro-factura', 'facturas-todas', 'rutas-todas']);
    assert.equal(puedeAccion({ esAdmin: false, modulos: ['facturacion'] }, 'cobro-factura'), false);
    const facturacion = porGrupo().flatMap(g => g.modulos).find(m => m.clave === 'facturacion');
    assert.deepEqual(facturacion.acciones.map(a => a.nombre), ['Cambiar precio y descuento', 'Cobrar al facturar', 'Ver las facturas de todos'],
      'el tablero los muestra debajo de Facturación');
  });

  test('sin «Cobrar al facturar» no se ofrece cómo pagó: la factura queda pendiente', () => {
    const pagina = leer('pages', 'Facturacion.jsx');
    assert.match(pagina, /const puedeCobrar = puedeAccion\(usuario, 'cobro-factura'\)/);
    assert.match(pagina, /metodosPago=\{puedeCobrar \? metodosPago : \[\]\}/);
  });

  test('sin costos, el descuento del cliente sale de la lista `aplica` del servidor', async () => {
    const { lineaConDescuentoCliente } = await import(path.join(FRONT, 'utils', 'descuentoCliente.js'));
    const condiciones = { porcentaje: 5, costos: new Map(), aplica: new Set([7]) };
    assert.equal(lineaConDescuentoCliente({ productoId: 7, price: 100, discount: 0 }, condiciones).discount, 5);
    assert.equal(lineaConDescuentoCliente({ productoId: 8, price: 100, discount: 0 }, condiciones).discount, 0);
    // Con costos (quien sí puede cambiar precio) sigue la cuenta de siempre.
    assert.equal(lineaConDescuentoCliente({ productoId: 7, price: 100 }, { porcentaje: 5, costos: new Map([[7, 70]]) }).discount, 5);
  });

  test('la factura nueva esconde los campos de precio y descuento', () => {
    assert.match(leer('pages', 'Facturacion.jsx'), /const precioFijo = !puedeAccion\(usuario, 'precio-factura'\)/);
    assert.match(leer('pages', 'Facturacion.jsx'), /precioFijo=\{precioFijo\}/);
    const linea = leer('components', 'facturacion', 'LineaFactura.jsx');
    assert.match(linea, /\{!precioFijo && \(\s*<div className="mt-3 hidden gap-3/);
    assert.match(linea, /\{colones\(item\.price\)\} c\/u/, 'el precio se sigue VIENDO junto al subtotal');
  });

  test('al editar una factura emitida, precio y descuento se ven pero no se cambian', () => {
    const lineas = leer('components', 'facturacion', 'LineasFactura.jsx');
    assert.match(lineas, /const fijo = \{ \.\.\.comun, editando: editando && puedeAccion\(usuario, 'precio-factura'\) \}/);
    assert.equal((lineas.match(/<Precio l=\{l\} i=\{i\} \{\.\.\.fijo\} \/>/g) || []).length, 2);
    assert.equal((lineas.match(/<Descuento l=\{l\} i=\{i\} \{\.\.\.fijo\} \/>/g) || []).length, 2);
  });

  test('el tablero quita el permiso de acción cuando se quita su módulo', () => {
    const tablero = leer('components', 'usuarios', 'TableroPermisos.jsx');
    assert.match(tablero, /onCambiar\(modulo \? sinAccionesDe\(sin, \[modulo\]\) : sin\)/);
    assert.match(tablero, /\{marcado && \(m\.acciones \|\| \[\]\)\.map/);
  });
});

describe('crear y editar de verdad — contra PostgreSQL local', () => {
  let db, facturas, controlador, usuario, ficha, producto, otro;
  const linea = (p, extra = {}) => ({ productoId: p.id, price: 100, quantity: 2, discount: 0, descuentoBase: 0, ...extra });
  const pedido = (items) => ({ clienteId: ficha.id, clienteNombre: ficha.nombre, items, descuentoClienteRevisado: 5 });
  const siguiente = async () => (await db.query(
    "SELECT siguiente FROM serie_consecutivo WHERE tipo_documento = 'factura' AND activo AND NOT electronica LIMIT 1")).rows[0]?.siguiente;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'preciofijo') };
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    controlador = require('../src/modules/facturacion/facturaPropia.controller');
    const clientes = require('../src/modules/clientes/clientes.service');

    usuario = (await db.query('SELECT id FROM usuario ORDER BY id LIMIT 1')).rows[0].id;
    ficha = await clientes.crearCliente({ nombre: 'ZZ Precio fijo', descuento_global: 5 }, usuario);
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    const nuevo = async (ref) => (await db.query(
      `INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id)
       VALUES ($1, $1, 100, 79.1, $2) RETURNING *`, [`ZZ-PRECIO-FIJO-${ref}`, impuesto.id])).rows[0];
    producto = await nuevo('A');
    otro = await nuevo('B');
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('a precio de lista, con el descuento del cliente, se factura', async () => {
    const f = await facturas.crearFactura(pedido([linea(producto, { discount: 5 })]), usuario, { precioFijo: true });
    assert.equal(Number(f.lineas[0].precio_unitario), 100);
    assert.equal(Number(f.lineas[0].descuento_porcentaje), 5);
  });

  test('otro precio se rechaza y no gasta número de factura', async () => {
    const antes = await siguiente();
    await assert.rejects(facturas.crearFactura(pedido([linea(producto, { price: 80, discount: 5 })]), usuario, { precioFijo: true }),
      rechazaPor(/no puede cambiar el precio/));
    assert.equal(await siguiente(), antes);
  });

  test('un descuento a mano se rechaza', async () => {
    await assert.rejects(facturas.crearFactura(pedido([linea(producto, { discount: 20, descuentoBase: 20 })]), usuario, { precioFijo: true }),
      rechazaPor(/descuentos a mano/));
  });

  test('quien tiene el permiso sigue pudiendo cambiar el precio, como hasta hoy', async () => {
    // A ₡80 el margen no alcanza para el 5 % del cliente: va sin descuento.
    const f = await facturas.crearFactura(pedido([linea(producto, { price: 80 })]), usuario);
    assert.equal(Number(f.lineas[0].precio_unitario), 80);
  });

  test('al editar, la línea vieja conserva su precio aunque la lista haya subido; uno inventado no', async () => {
    const f = await facturas.crearFactura(pedido([linea(producto, { discount: 5 })]), usuario, { precioFijo: true });
    await db.query('UPDATE producto SET precio_sin_iva = 120 WHERE id = $1', [producto.id]);
    try {
      const vieja = { productoId: producto.id, precio: 100, cantidad: 3, descuento: 5 };
      const editada = await facturas.editarFactura(f.id, { items: [vieja], motivo: 'ZZ precio fijo' }, usuario, { precioFijo: true });
      assert.equal(Number(editada.lineas[0].precio_unitario), 100);

      await assert.rejects(facturas.editarFactura(f.id, { items: [{ ...vieja, precio: 110 }], motivo: 'ZZ' }, usuario, { precioFijo: true }),
        rechazaPor(/precio/));
      // Un producto nuevo en la edición va al precio de lista de hoy.
      const conOtro = await facturas.editarFactura(f.id, {
        items: [vieja, { productoId: otro.id, precio: 100, cantidad: 1, descuento: 0 }], motivo: 'ZZ'
      }, usuario, { precioFijo: true });
      assert.equal(conOtro.lineas.length, 2);
    } finally {
      await db.query('UPDATE producto SET precio_sin_iva = 100 WHERE id = $1', [producto.id]);
    }
  });

  test('sin «Cobrar al facturar» un cobro se rechaza (403) y no gasta número; sin cobro, se factura', async () => {
    const metodo = (await db.query('SELECT id FROM metodo_pago WHERE activo ORDER BY id LIMIT 1')).rows[0];
    const antes = await siguiente();
    await assert.rejects(
      facturas.crearFactura({ ...pedido([linea(producto, { discount: 5 })]), cobro: { metodoPagoId: metodo.id } }, usuario, { sinCobro: true }),
      (e) => e.status === 403 && e.code === 'SIN_COBRO' && /queda|quedar pendiente/.test(e.message));
    assert.equal(await siguiente(), antes);
    const f = await facturas.crearFactura(pedido([linea(producto, { discount: 5 })]), usuario, { sinCobro: true });
    assert.ok(f.id);
  });

  test('sin «Cambiar precio y descuento» no viajan costos: el servidor dice dónde aplica el descuento', async () => {
    const { condicionesDelCliente } = require('../src/modules/facturacion/descuentoCliente.service');
    const sin = await condicionesDelCliente(ficha.id, { conCostos: false });
    assert.deepEqual(sin.costos, []);
    assert.ok(sin.aplica.includes(producto.id), 'a ₡100 con costo ₡70 sin IVA el 5 % aplica');
    assert.equal(JSON.stringify(sin).includes('costoSinIva'), false);
    const con = await condicionesDelCliente(ficha.id);
    assert.ok(con.costos.some(c => c.id === producto.id), 'quien puede cambiar precio sigue recibiendo los costos');
    assert.equal('aplica' in con, false);
  });

  test('el controlador decide por los permisos de la base: sin el de acción, 409', async () => {
    const respuesta = () => { const r = {}; r.status = (c) => { r.estado = c; return r; }; r.json = (b) => { r.cuerpo = b; return r; }; return r; };
    const req = (modulos) => ({
      usuario: { id: usuario }, permisos: { esAdmin: false, modulos: new Set(modulos) },
      body: pedido([linea(producto, { price: 80 })])
    });

    const sin = respuesta();
    await controlador.crear(req(['facturacion']), sin);
    assert.equal(sin.estado, 409);
    assert.match(JSON.stringify(sin.cuerpo), /no puede cambiar el precio/);

    const con = respuesta();
    await controlador.crear(req(['facturacion', 'precio-factura']), con);
    assert.equal(con.estado, 201);
  });
});

describe('migración 068: a nadie le cambia nada — contra PostgreSQL local', () => {
  let db;
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'independencia', '068_permisos_accion_facturacion.sql'), 'utf8');

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
  });
  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('quien tenía Facturación recibe el permiso; quien no, no; y se puede correr dos veces', async () => {
    const nuevo = async (u) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $1, 'zz', TRUE, FALSE) RETURNING id`, [u])).rows[0].id;
    const cajero = await nuevo('zz-cajero-068');
    const bodega = await nuevo('zz-bodega-068');
    await db.query(`INSERT INTO usuario_modulo (usuario_id, modulo) VALUES ($1, 'facturacion'), ($2, 'preventa')`, [cajero, bodega]);

    await db.query(sql);
    await db.query(sql);

    const permisos = async (id) => (await db.query(
      `SELECT modulo FROM usuario_modulo WHERE usuario_id = $1 AND modulo IN ('precio-factura', 'cobro-factura', 'facturas-todas') ORDER BY modulo`, [id])).rows.map(r => r.modulo);
    assert.deepEqual(await permisos(cajero), ['cobro-factura', 'facturas-todas', 'precio-factura']);
    assert.deepEqual(await permisos(bodega), []);
  });
});
