const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { baseEnTransaccion, prismaDelBuzon } = require('./dobles/buzonEnTransaccion');

/**
 * Revisión de Precios lee del maestro propio (sección 8).
 *
 * Hasta el 2026-10-04 la pantalla le pedía a ALEGRA EN VIVO el precio y el
 * costo de cada producto de la factura, por el id de Alegra, y las
 * sugerencias de precio salían por ese mismo id con la categoría de la caché.
 * Un producto sin ficha en Alegra —que desde la migración 038 ya se puede
 * relacionar— no se podía revisar; y el precio que se mostraba era el de
 * Alegra, no el que "Registrar compra" cambia en `producto`.
 *
 * Contra PostgreSQL local, en una transacción que se deshace.
 */

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const rutaServicio = require.resolve('../src/modules/revision-precios/revision-precios.service');
const RUTAS_COMPRAS = ['../src/modules/compras/compras.service', '../src/modules/compras/liberarCuentaPorPagar'].map(r => require.resolve(r));

describe('Revisión de Precios desde el maestro propio — contra PostgreSQL local', () => {
  let pool, conexion, servicio, compras;
  let propio, conFicha, exento, sinImpuesto, facturaId, lineaPropia, lineaConFicha, lineaSuelta;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
    doble(rutaDb, baseEnTransaccion(conexion, 'rev'));
    doble(rutaPrisma, prismaDelBuzon(conexion));
    for (const r of [rutaServicio, ...RUTAS_COMPRAS]) delete require.cache[r];
    servicio = require(rutaServicio);
    compras = require(RUTAS_COMPRAS[0]);

    const iva13 = (await conexion.query('SELECT id FROM impuesto WHERE activo AND tarifa = 13 ORDER BY id LIMIT 1')).rows[0].id;
    const iva0 = (await conexion.query('SELECT id FROM impuesto WHERE activo AND tarifa = 0 ORDER BY id LIMIT 1')).rows[0].id;
    // Una categoría con su fila de márgenes: Librería pide 29,2 %.
    const { rows: [libreria] } = await conexion.query(`
      SELECT c.id, k.margen_meta::float8 AS meta FROM categoria_producto c JOIN config_precios k ON k.categoria = c.nombre
       WHERE c.nombre = 'Librería'`);
    assert.ok(libreria, 'la copia local no tiene la categoría Librería con sus márgenes');

    const producto = async (nombre, { alegraId = null, impuesto = iva13, categoria = null, precio = 1000, costo = 800 } = {}) =>
      (await conexion.query(`
        INSERT INTO producto (nombre, referencia, alegra_id, impuesto_id, categoria_id, precio_sin_iva, costo_con_iva)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [nombre, `zz-${nombre.slice(-6)}`, alegraId, impuesto, categoria, precio, costo])).rows[0].id;
    propio = await producto('zz-revisión sin ficha', { categoria: libreria.id });
    conFicha = await producto('zz-revisión con ficha', { alegraId: 'zz-920001' });
    exento = await producto('zz-revisión exento', { impuesto: iva0 });
    sinImpuesto = await producto('zz-revisión sin impuesto', { impuesto: null });

    facturaId = (await conexion.query(`
      INSERT INTO facturas_proveedores (clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula,
                                        total_productos, total_factura, archivo_xml, estado)
      VALUES ('zz-clave-revision-propia', 'zz-00000000000000000041', '2099-01-01', 'zz-proveedor', 'zz-3101-rev',
              2, 0, '<zz/>', 'PROCESADA') RETURNING id`)).rows[0].id;
    const linea = async (n, productoId, alegraItemId, estado = 'RELACIONADO') => (await conexion.query(`
      INSERT INTO productos_factura_proveedor
        (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida, precio_unitario,
         impuesto, total_linea, producto_id, alegra_item_id, estado_relacionado)
      VALUES ($1, $2, $3, $4, 1, 'Unid', 1000, 130, 1130, $5, $6, $7::estado_relacionado) RETURNING id`,
    [facturaId, n, `zz-R${n}`, `zz-línea ${n}`, productoId, alegraItemId, estado])).rows[0].id;
    lineaPropia = await linea(1, propio, null);
    lineaConFicha = await linea(2, conFicha, 'zz-920001');
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('los productos de la revisión salen del maestro, por producto.id', async () => {
    const r = await servicio.getProductosDeRevision([propio, String(conFicha), conFicha, exento, sinImpuesto, 'zz-920001', 0, 2000000000]);

    assert.deepEqual([r.total, r.solicitados], [4, 5]);   // el id de Alegra y el 0 ni se consultan
    assert.deepEqual(Object.keys(r.productos).map(Number).sort((a, b) => a - b), [propio, conFicha, exento, sinImpuesto].sort((a, b) => a - b));
    // El id de Alegra de un producto no abre nada.
    assert.equal(r.productos['zz-920001'], undefined);

    // Precio CON IVA y costo con IVA, como los espera la pantalla.
    assert.deepEqual(r.productos[propio], {
      id: propio, name: 'zz-revisión sin ficha', reference: 'zz- ficha', price: 1130, priceWithoutTax: 1000, cost: 800, taxPercentage: 13
    });
    // Un exento es 0 %, no "sin dato"...
    assert.deepEqual([r.productos[exento].price, r.productos[exento].taxPercentage], [1000, 0]);
    // ...y el que no tiene impuesto asignado lo dice con null: no se le inventa un IVA.
    assert.deepEqual([r.productos[sinImpuesto].price, r.productos[sinImpuesto].taxPercentage], [1000, null]);

    assert.deepEqual(await servicio.getProductosDeRevision([]), { productos: {}, total: 0, solicitados: 0 });
  });

  test('las listas entregan cada línea con su producto propio', async () => {
    const { facturas } = await servicio.getFacturasRelacionadas({ limit: 200 });
    const mia = facturas.find(f => f.id === facturaId);
    assert.ok(mia, 'la factura con todas sus líneas relacionadas no salió en "listas para revisión"');
    assert.deepEqual(mia.productos.map(l => [l.id, l.productoPropioId]), [[lineaPropia, propio], [lineaConFicha, conFicha]]);

    const procesadas = await servicio.getFacturas('PROCESADA');
    assert.deepEqual(procesadas.facturas.find(f => f.id === facturaId).productos.map(l => l.productoPropioId), [propio, conFicha]);
  });

  test('el producto sin ficha en Alegra recibe sugerencia, con el margen de SU categoría', async () => {
    const sugerencias = await servicio.obtenerSugerenciasPrecio(facturaId);

    assert.deepEqual(Object.keys(sugerencias).sort(), [lineaPropia, lineaConFicha].sort());
    // Librería: 29,2 % de meta (un producto nuevo no tiene rotación que lo ajuste).
    assert.deepEqual([sugerencias[lineaPropia].categoria, sugerencias[lineaPropia].margenObjetivo], ['Librería', 29.2]);
    assert.ok(sugerencias[lineaPropia].precioSugerido > 1000);
    // Sin categoría, el margen por defecto.
    assert.equal(sugerencias[lineaConFicha].categoria, '(sin categoría)');
  });

  test('una línea sin producto propio no recibe sugerencia, y una factura que no existe da 404', async () => {
    lineaSuelta = (await conexion.query(`
      INSERT INTO productos_factura_proveedor
        (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida, precio_unitario, total_linea)
      VALUES ($1, 3, 'zz-R3', 'zz-línea pendiente', 1, 'Unid', 1000, 1130) RETURNING id`, [facturaId])).rows[0].id;
    const sugerencias = await servicio.obtenerSugerenciasPrecio(facturaId);
    assert.equal(sugerencias[lineaSuelta], undefined);
    assert.equal(Object.keys(sugerencias).length, 2);
    await assert.rejects(servicio.obtenerSugerenciasPrecio('00000000-0000-0000-0000-000000000000'), { status: 404 });
  });

  test('registrar la compra escribe el costo y el precio al producto que se REVISÓ: el de la línea', async () => {
    await conexion.query(`INSERT INTO proveedor (nombre, identificacion) VALUES ('zz-proveedor', 'zz-3101-rev')`);
    // El código del proveedor de la segunda línea se volvió a relacionar
    // después con OTRO producto: su mapeo ya no dice lo que dice la línea.
    const { rows: [mapeo] } = await conexion.query(`
      INSERT INTO supplier_product_mapping (supplier_name, supplier_cedula, supplier_code, supplier_desc,
                                            alegra_item_id, alegra_name, producto_id, factor_conversion)
      VALUES ('zz-proveedor', 'zz-3101-rev', 'zz-R2', 'zz-línea 2', '', 'zz-revisión exento', $1, 1) RETURNING id`, [exento]);
    await conexion.query('UPDATE productos_factura_proveedor SET mapeo_id = $2 WHERE id = $1', [lineaConFicha, mapeo.id]);

    const r = await compras.registrarCompra(facturaId, { [lineaPropia]: 1600 }, null);

    // La tercera línea quedó pendiente en la prueba anterior: se cuenta aparte.
    assert.deepEqual([r.lineas, r.costosActualizados, r.preciosActualizados, r.sinProductoPropio], [3, 2, 1, 1]);
    const { rows: lineasDeCompra } = await conexion.query(
      'SELECT numero_linea, producto_id FROM compra_linea WHERE compra_id = $1 ORDER BY numero_linea', [r.compra.id]);
    assert.deepEqual(lineasDeCompra, [
      { numero_linea: 1, producto_id: propio },      // sin mapeo: antes quedaba sin producto
      { numero_linea: 2, producto_id: conFicha },    // el de la línea, no el del mapeo
      { numero_linea: 3, producto_id: null }
    ]);

    const de = async (id) => (await conexion.query(
      'SELECT precio_sin_iva::float8 AS precio, costo_con_iva::float8 AS costo FROM producto WHERE id = $1', [id])).rows[0];
    // El producto sin ficha en Alegra recibe el costo de la compra y el precio ajustado.
    assert.deepEqual(await de(propio), { precio: 1600, costo: 1130 });
    assert.deepEqual(await de(conFicha), { precio: 1000, costo: 1130 });
    // Al producto del mapeo, que no es el de la línea, no se le toca nada.
    assert.deepEqual(await de(exento), { precio: 1000, costo: 800 });
  });

  // 2026-10-12: la compra se acepta sola ante Hacienda al registrarla. La
  // lista de Registradas dice cómo quedó, para que una aceptación que no
  // salió no dependa de abrir esa compra para enterarse.
  test('la lista de registradas dice cómo quedó cada compra ante Hacienda', async () => {
    const mia = async () => (await servicio.getFacturas('ENVIADA')).facturas.find(f => f.id === facturaId);
    const compra = (await conexion.query('SELECT id FROM compra WHERE factura_proveedor_id = $1', [facturaId])).rows[0].id;
    // Sin el XML del proveedor (como las anteriores al corte) no se marca
    // como pendiente: no se aceptó desde acá y no hay con qué.
    assert.equal((await mia()).aceptacionHacienda, null);
    await conexion.query("UPDATE compra SET xml_ruta = 'compras-proveedor/zz.xml' WHERE id = $1", [compra]);
    assert.equal((await mia()).aceptacionHacienda, 'sin_enviar');
    const comprobante = (estado, revision, ambiente = 'produccion') => conexion.query(
      `INSERT INTO hacienda_comprobante(ambiente,origen,origen_id,tipo,clave,consecutivo,fecha,xml_ruta,xml_sha256,sobre,estado,revision_documento)
       VALUES($1,'compra',$2,'05',$3,$4,now(),'zz','zz','{}',$5,$6)`,
      [ambiente, compra, '7'.repeat(50), '0010000105' + String(9900000000 + revision), estado, revision]);
    // Una de pruebas no cuenta: para Hacienda no existe.
    await comprobante('aceptada', 1, 'pruebas');
    assert.equal((await mia()).aceptacionHacienda, 'sin_enviar');
    await comprobante('rechazada', 1);
    assert.equal((await mia()).aceptacionHacienda, 'rechazada');
    // Manda la última: la que se volvió a enviar.
    await comprobante('aceptada', 2);
    assert.equal((await mia()).aceptacionHacienda, 'aceptada');
    // Las que todavía no se registraron no llevan el dato.
    assert.equal('aceptacionHacienda' in ((await servicio.getFacturas('PROCESADA')).facturas[0] || {}), false);
  });
});

describe('lo que Revisión de Precios ya no tiene', () => {
  const backend = (...partes) => fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'revision-precios', ...partes), 'utf8');
  const frontend = (...partes) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...partes), 'utf8');
  const sinComentarios = (texto) => texto.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');

  test('las rutas que nadie llamaba: confirmar y rechazar por id de Alegra, pendientes, actualizar-precio, estadísticas', () => {
    const rutas = sinComentarios(backend('revision-precios.routes.js'));
    for (const muerta of ['/productos-pendientes', '/confirmar-producto', '/rechazar-producto', '/actualizar-precio', '/estadisticas']) {
      assert.ok(!rutas.includes(`'${muerta}'`), `${muerta} volvió`);
    }
    const servicio = require('../src/modules/revision-precios/revision-precios.service');
    for (const funcion of ['getProductosPendientes', 'confirmarProducto', 'rechazarProducto', 'actualizarPrecio', 'getEstadisticas', 'getProductosBatch']) {
      assert.equal(servicio[funcion], undefined, `${funcion} volvió`);
    }
  });

  test('el envío de la compra a Alegra se retiró: el módulo ya no importa la integración', () => {
    const rutas = sinComentarios(backend('revision-precios.routes.js'));
    assert.ok(!rutas.includes("'/enviar-alegra'"), '/enviar-alegra volvió');
    const servicio = require('../src/modules/revision-precios/revision-precios.service');
    for (const funcion of ['enviarFacturaAlegra', 'construirItemsFactura', 'inferirTipoIdentificacion', 'actualizacionDeLinea']) {
      assert.equal(servicio[funcion], undefined, `${funcion} volvió`);
    }
    for (const archivo of ['revision-precios.service.js', 'revision-precios.controller.js']) {
      assert.doesNotMatch(sinComentarios(backend(archivo)), /integrations\/alegra|impuestosAlegra|pagosProveedoresService/, `${archivo} todavía depende de Alegra`);
    }
    // Lo que ese camino cuidaba sigue cuidado donde se registra la compra.
    const compras = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'compras', 'compras.service.js'), 'utf8');
    assert.match(compras, /SELECT id FROM compra WHERE factura_proveedor_id = \$1/);   // no se registra dos veces
    assert.match(compras, /esRegalia \? null : costoNuevo/);                            // la regalía no pisa el costo
  });

  test('el lote de productos pide `productoIds` y no le pregunta a Alegra', () => {
    const controlador = sinComentarios(backend('revision-precios.controller.js'));
    assert.match(controlador, /const \{ productoIds \} = req\.body/);
    assert.doesNotMatch(controlador, /alegraIds/);

    const servicio = backend('revision-precios.service.js');
    const lote = servicio.slice(servicio.indexOf('async function getProductosDeRevision('), servicio.indexOf('async function conProductoPropio('));
    assert.doesNotMatch(sinComentarios(lote), /productService|getProductById|alegra/i);
    const sugerencias = servicio.slice(servicio.indexOf('async function obtenerSugerenciasPrecio('), servicio.indexOf('async function getProductosDeRevision('));
    assert.doesNotMatch(sinComentarios(sugerencias), /alegra_products_cache|alegraItemId|alegra_item_id/);
  });

  test('la pantalla manda ids propios y ya no ofrece "Sincronizar desde Alegra"', () => {
    const hook = sinComentarios(frontend('hooks', 'useRevisionPrecios.js'));
    assert.match(hook, /\.map\(p => p\.productoPropioId\)/);
    assert.match(hook, /productoIds\n?\s*\}\)/);
    assert.doesNotMatch(hook, /alegraIds|alegraItemId|\/alegra\/sincronizar/);

    const lista = sinComentarios(frontend('components', 'revision-precios', 'ListaFacturas.jsx'));
    assert.doesNotMatch(lista, /Sincronizar|onSincronizar/);
    const analisis = sinComentarios(frontend('utils', 'revisionPreciosUtils.js'));
    assert.match(analisis, /productosDelCatalogo\[producto\.productoPropioId\]/);
    assert.doesNotMatch(analisis, /alegraItemId|\|\| 13/);
  });
});
