const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');

/**
 * Un producto que se puede vender aparece en Facturación.
 *
 * QUÉ PASÓ (2026-10-13). El usuario reactivó dos productos en Gestión de
 * Catálogo y preguntó por qué no aparecían en Facturación. Eran dos cosas:
 *
 *  1. Los productos estaban inactivos Y ocultos. Al reactivarlos quedaron
 *     activos pero ocultos, y la lista que alimenta Facturación pedía "activo
 *     y sin ocultar" —aunque «oculto» solo los saca de los catálogos que ven
 *     los clientes, y facturar solo rechaza los inactivos—.
 *  2. Facturación trabaja con una copia del catálogo guardada en el
 *     dispositivo (para facturar sin internet) que solo se renovaba al tocar
 *     «Actualizar». Aun siendo vendible, el producto no aparecía hasta eso.
 *
 * Acá se cuida que todo lo activo llegue a Facturación, y que la pantalla
 * note sola cuándo su copia quedó vieja sin bajar el catálogo de gusto.
 */

describe('cuándo renovar la copia del catálogo', () => {
  let u;
  before(async () => { u = await import('../../frontend/src/utils/catalogoAlDia.js'); });

  test('se renueva cuando la huella del servidor es otra, o nunca se guardó una', () => {
    assert.equal(u.cambio('abc', 'def'), true);
    assert.equal(u.cambio(null, 'def'), true, 'un dispositivo que nunca la guardó tiene que ponerse al día');
    assert.equal(u.cambio('', 'def'), true);
    assert.equal(u.cambio('abc', 'abc'), false);
    assert.equal(u.cambio(' abc ', 'abc'), false);
  });

  test('si el servidor no contesta una huella, no se baja el catálogo a ciegas', () => {
    // Un servidor viejo, o un error: cada tres minutos serían veinte pedidos.
    for (const sinHuella of [undefined, null, '', '  '])
      assert.equal(u.cambio('abc', sinHuella), false, String(sinHuella));
  });

  test('no se pregunta dos veces seguidas, y sí pasado el mínimo', () => {
    const ahora = 1_000_000_000;
    assert.equal(u.tocaPreguntar(ahora, 0), true, 'la primera vez siempre');
    assert.equal(u.tocaPreguntar(ahora, ahora - 1000), false, 'volver a la pestaña no dispara otro pedido');
    assert.equal(u.tocaPreguntar(ahora, ahora - u.MINIMO_MS), true);
    assert.ok(u.CADA_MS >= u.MINIMO_MS, 'el reloj no puede ir más rápido que el mínimo entre preguntas');
    assert.ok(u.CADA_MS <= 5 * 60 * 1000, 'con la pantalla abierta todo el día, un producto reactivado tiene que aparecer en minutos');
  });
});

describe('cómo quedó conectado', () => {
  const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
  const front = (...p) => sinComentarios(fs.readFileSync(path.join(FRONTEND, ...p), 'utf8'));
  const back = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

  test('Facturación renueva sola su copia y se la pasa a la pantalla', () => {
    const pagina = front('pages', 'Facturacion.jsx');
    assert.match(pagina, /useCatalogoAlDia\(\{ enLinea: isOnline, listo: !loading, ocupado: syncingCache, alRenovar: setProductos \}\)/);
    // Antes del return de carga: un hook condicional tumba la pantalla.
    assert.ok(pagina.indexOf('useCatalogoAlDia({') < pagina.indexOf('if (loading && productos.length === 0)'));
    const gancho = front('hooks', 'useCatalogoAlDia.js');
    assert.match(gancho, /api\.get\('\/catalogos\/productos\/huella'\)/);
    assert.match(gancho, /facturacionService\.actualizarCacheProductos\(\)/);
    // Solo baja el catálogo si la huella cambió.
    assert.ok(gancho.indexOf('if (!cambio(guardada(), huella)) return') < gancho.indexOf('actualizarCacheProductos()'));
    // La huella se anota DESPUÉS de bajar: si la descarga falla, se reintenta.
    assert.ok(gancho.indexOf('actualizarCacheProductos()') < gancho.lastIndexOf('guardar(huella)'));
  });

  test('nunca estorba: ni sin conexión, ni durante «Actualizar», ni si algo falla', () => {
    const gancho = front('hooks', 'useCatalogoAlDia.js');
    assert.match(gancho, /if \(!enLinea\) return undefined/);
    assert.match(gancho, /if \(!listo \|\| ocupado\) return undefined/);
    assert.match(gancho, /catch \{\s*\} finally \{\s*corriendo\.current = false/);
    assert.match(gancho, /document\.hidden/);
  });

  test('la lista para vender es todo lo activo; la de los catálogos sigue sin los ocultos', () => {
    const servicio = back('modules', 'productos', 'productos.service.js');
    assert.match(servicio, /const VENDIBLE = 'p\.activo = TRUE';/);
    assert.match(servicio, /listarProductos\(\{ buscar, pagina, limite, estado: 'vendibles' \}\)/);
    assert.match(servicio, /case 'activos': where\.push\('p\.activo = TRUE AND p\.oculto = FALSE'\)/);
    // Facturar sigue rechazando solo lo inactivo: las dos reglas dicen lo mismo.
    const facturar = back('modules', 'facturacion', 'facturaLineas.js');
    assert.match(facturar, /está inactivo: no se puede facturar/);
    assert.doesNotMatch(sinComentarios(facturar), /oculto/);
    assert.match(back('modules', 'productos', 'productos.routes.js'), /rutasCompartidas\.get\('\/productos\/huella', controller\.huellaParaOperar\)/);
  });
});

describe('contra PostgreSQL local', () => {
  const rutaDb = require.resolve('../config/database');
  const rutaServicio = require.resolve('../src/modules/productos/productos.service');
  let pool, conexion, servicio, oculto, visible, impuesto;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'aldia') };
    delete require.cache[rutaServicio];
    servicio = require(rutaServicio);

    impuesto = (await conexion.query('SELECT id FROM impuesto WHERE activo AND tarifa = 13 ORDER BY id LIMIT 1')).rows[0].id;
    const producto = async (nombre, extra) => (await conexion.query(
      `INSERT INTO producto (nombre, referencia, impuesto_id, precio_sin_iva, costo_con_iva, activo, oculto)
       VALUES ($1, $2, $3, 1000, 800, $4, $5) RETURNING id`,
      [nombre, `zz-${nombre.slice(-8)}`, impuesto, extra.activo, extra.oculto])).rows[0].id;
    // Como los del usuario: se habían sacado de la venta Y de los catálogos.
    oculto = await producto('zz-al-día delineador black', { activo: false, oculto: true });
    visible = await producto('zz-al-día delineador brown', { activo: true, oculto: false });
  });

  after(async () => {
    await conexion.query('ROLLBACK');
    conexion.release();
    await pool.end();
    delete require.cache[rutaDb];
    delete require.cache[rutaServicio];
  });

  const paraVender = async () => (await servicio.productosParaOperar({ buscar: 'zz-al-día delineador', limite: 100 })).data.map(p => p.id).sort();
  const enCatalogos = async () => (await servicio.listarProductos({ buscar: 'zz-al-día delineador', estado: 'activos', limite: 100 })).data.map(p => p.id).sort();
  const huella = async () => (await servicio.huellaParaOperar()).huella;

  test('inactivo no se vende; al reactivarlo aparece para vender AUNQUE siga oculto', async () => {
    assert.deepEqual(await paraVender(), [visible]);
    const antes = await huella();
    const r = await servicio.cambiarEstadoProducto(oculto, { activo: true }, null);
    assert.deepEqual([r.activo, r.oculto], [true, true], 'reactivar no lo saca de oculto: son dos cosas distintas');
    assert.deepEqual(await paraVender(), [oculto, visible].sort(), 'un producto activo y oculto no llegó a Facturación');
    // Los catálogos que ven los clientes siguen sin mostrarlo.
    assert.deepEqual(await enCatalogos(), [visible]);
    assert.notEqual(await huella(), antes, 'Facturación no se enteraría de que hay un producto más');
  });

  test('la huella cambia con lo que Facturación guarda, y solo con eso', async () => {
    let anterior = await huella();
    const cambia = async (que, sql, params) => {
      await conexion.query(sql, params);
      const nueva = await huella();
      assert.notEqual(nueva, anterior, `${que} no cambió la huella`);
      anterior = nueva;
    };
    const noCambia = async (que, sql, params) => {
      await conexion.query(sql, params);
      assert.equal(await huella(), anterior, `${que} obligaría a bajar el catálogo sin que cambiara nada de la venta`);
    };
    await cambia('el precio', 'UPDATE producto SET precio_sin_iva = 1250 WHERE id = $1', [visible]);
    await cambia('el nombre', "UPDATE producto SET nombre = 'zz-al-día delineador brown 2' WHERE id = $1", [visible]);
    await cambia('la referencia', "UPDATE producto SET referencia = 'zz-otra-ref' WHERE id = $1", [visible]);
    await cambia('el impuesto', 'UPDATE producto SET impuesto_id = NULL WHERE id = $1', [visible]);
    await cambia('desactivarlo', 'UPDATE producto SET activo = FALSE WHERE id = $1', [visible]);
    await cambia('reactivarlo', 'UPDATE producto SET activo = TRUE WHERE id = $1', [visible]);
    // Ocultar o mostrar es de los catálogos; la foto no viaja a Facturación.
    await noCambia('ocultarlo', 'UPDATE producto SET oculto = TRUE WHERE id = $1', [visible]);
    await noCambia('mostrarlo', 'UPDATE producto SET oculto = FALSE WHERE id = $1', [visible]);
    await noCambia('cambiarle la foto', "UPDATE producto SET imagen_url = '/archivos/productos/zz.jpg' WHERE id = $1", [visible]);
    await noCambia('cambiarle el costo', 'UPDATE producto SET costo_con_iva = 999 WHERE id = $1', [visible]);
    // La misma consulta dos veces da lo mismo: no depende del orden de las filas.
    assert.equal(await huella(), await huella());
    const r = await servicio.huellaParaOperar();
    assert.match(r.huella, /^[0-9a-f]{32}$/);
    assert.ok(r.productos > 0);
  });
});
