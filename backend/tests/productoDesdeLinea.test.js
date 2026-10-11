const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { baseEnTransaccion, prismaDelBuzon } = require('./dobles/buzonEnTransaccion');

/**
 * Crear un producto nuevo desde una línea de factura de proveedor (sección 8,
 * parte 2 de Relacionar Productos).
 *
 * Hasta el 2026-10-04 lo creaba en Alegra. Ahora nace en el maestro propio,
 * por la misma puerta que "Nuevo producto" de Gestión de Catálogo, y la línea
 * queda relacionada con él por `producto.id`.
 *
 * Contra PostgreSQL local, en una transacción que se deshace. Las fotos van a
 * un doble del almacenamiento: no se escribe ningún archivo.
 */

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const rutaImagenes = require.resolve('../src/modules/productos/productos.imagenes');
const RUTAS = [
  '../src/modules/productos/productos.service',
  '../src/modules/productos-revision/relacionPropia',
  '../src/modules/productos-revision/productoDesdeLinea',
  '../src/modules/precios/costoHistorico',
  '../src/modules/precios/costoDerivado'
].map(r => require.resolve(r));

describe('producto nuevo desde una línea del proveedor — contra PostgreSQL local', () => {
  let pool, conexion, modulo, derivado;
  let facturaId, categoriaId, usuarioId;
  const fotos = { archivo: [], url: [], falla: null };

  const CEDULA = 'zz-3101-nuevo';
  const CABYS = '2413900000100';

  /** Una línea PENDIENTE del buzón. `impuesto` y `total` definen el IVA real. */
  const linea = async (n, { codigo = `zz-N${n}`, precio = 1000, cantidad = 2, impuesto = 260, descuento = 0, cabys = CABYS } = {}) => {
    const neto = precio * cantidad - descuento;
    return (await conexion.query(`
      INSERT INTO productos_factura_proveedor
        (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida,
         precio_unitario, descuento, impuesto, total_linea, codigo_cabys)
      VALUES ($1, $2, $3, $4, $5, 'Unid', $6, $7, $8, $9, $10) RETURNING id`,
    [facturaId, n, codigo, `zz-línea nueva ${n}`, cantidad, precio, descuento, impuesto, neto + impuesto, cabys])).rows[0].id;
  };
  const formulario = (lineaId, extra = {}) => ({
    productoId: lineaId, nombre: 'zz-producto nuevo', precio: '1500', costo: '1130',
    categoria: String(categoriaId), unidad: 'Unid', esMedicamento: 'false', ...extra
  });
  const producto = async (id) => (await conexion.query('SELECT * FROM producto WHERE id = $1', [id])).rows[0];
  const lineaEnLaBase = async (id) => (await conexion.query(`
    SELECT producto_id, alegra_item_id, estado_relacionado::text AS estado, mapeo_id
      FROM productos_factura_proveedor WHERE id = $1`, [id])).rows[0];
  const impuestoDe = async (tarifa) => (await conexion.query(
    'SELECT id FROM impuesto WHERE activo AND tarifa = $1 ORDER BY id LIMIT 1', [tarifa])).rows[0].id;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
    doble(rutaDb, baseEnTransaccion(conexion, 'nuevo'));
    doble(rutaPrisma, prismaDelBuzon(conexion));
    doble(rutaImagenes, {
      asignarImagenDesdeArchivo: async (id, archivo, usuario) => {
        if (fotos.falla) throw new Error(fotos.falla);
        fotos.archivo.push({ id, nombre: archivo.originalname, usuario });
      },
      asignarImagenDesdeUrl: async (id, origen, usuario) => {
        if (fotos.falla) throw new Error(fotos.falla);
        fotos.url.push({ id, ...origen, usuario });
      }
    });
    for (const r of RUTAS) delete require.cache[r];
    modulo = require(RUTAS[2]);
    derivado = require(RUTAS[4]);

    categoriaId = (await conexion.query(
      `INSERT INTO categoria_producto (nombre) VALUES ('zz-categoría de prueba') RETURNING id`)).rows[0].id;
    usuarioId = (await conexion.query('SELECT id FROM usuario ORDER BY id LIMIT 1')).rows[0]?.id || null;
    await conexion.query(`INSERT INTO proveedor (nombre, identificacion) VALUES ('zz-proveedor de nuevos', $1)`, [CEDULA]);
    facturaId = (await conexion.query(`
      INSERT INTO facturas_proveedores (clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula,
                                        total_productos, total_factura, archivo_xml)
      VALUES ('zz-clave-producto-nuevo', 'zz-00000000000000000040', '2031-05-10', 'zz-proveedor de nuevos', $1,
              1, 0, '<zz/>') RETURNING id`, [CEDULA])).rows[0].id;
  });

  beforeEach(async () => {
    fotos.archivo.length = 0; fotos.url.length = 0; fotos.falla = null;
    await conexion.query('SAVEPOINT caso');
  });
  afterEach(async () => { await conexion.query('ROLLBACK TO SAVEPOINT caso'); });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('nace en el maestro propio, sin ficha en Alegra, y la línea queda relacionada con él', async () => {
    const lineaId = await linea(1);
    const r = await modulo.crearProductoDesdeLinea(formulario(lineaId, { referencia: 'zz-REF-NUEVO' }), undefined, usuarioId);

    const p = await producto(r.productoPropioId);
    assert.deepEqual({
      nombre: p.nombre, referencia: p.referencia, descripcion: p.descripcion, cabys: p.cabys, unidad: p.unidad,
      categoria: p.categoria_id, precio: Number(p.precio_sin_iva), costo: Number(p.costo_con_iva),
      alegra: p.alegra_id, activo: p.activo, medicamento: p.es_medicamento
    }, {
      nombre: 'zz-producto nuevo', referencia: 'zz-REF-NUEVO', descripcion: null, cabys: CABYS, unidad: 'Unid',
      categoria: categoriaId, precio: 1500, costo: 1130,
      alegra: null, activo: true, medicamento: false
    });
    // El impuesto salió del IVA real de la línea: 260 sobre 2.000 es 13 %.
    assert.equal(p.impuesto_id, await impuestoDe(13));

    const l = await lineaEnLaBase(lineaId);
    assert.deepEqual([l.producto_id, l.alegra_item_id, l.estado, l.mapeo_id], [p.id, null, 'RELACIONADO', r.mapeoId]);
    const { rows: [mapeo] } = await conexion.query(
      'SELECT producto_id, alegra_item_id, alegra_name, supplier_code, origen FROM supplier_product_mapping WHERE id = $1', [r.mapeoId]);
    assert.deepEqual(mapeo, {
      producto_id: p.id, alegra_item_id: '', alegra_name: 'zz-producto nuevo', supplier_code: 'zz-N1', origen: 'manual'
    });

    // Su compra ya le da costo, y la factura cuenta la línea como relacionada.
    assert.equal((await derivado.obtenerCostosDerivados()).get(p.id).costo, 1130);
    const { rows: [f] } = await conexion.query(
      'SELECT porcentaje_relacionado AS pct, estado_relacionado AS estado FROM facturas_proveedores WHERE id = $1', [facturaId]);
    assert.deepEqual(f, { pct: 100, estado: 'RELACIONADO' });

    // Queda en la bitácora, igual que un producto creado desde Gestión de Catálogo.
    const { rows: [cambio] } = await conexion.query(
      `SELECT accion, usuario_id FROM bitacora_cambio WHERE entidad = 'producto' AND entidad_id = $1 ORDER BY id DESC LIMIT 1`,
      [String(p.id)]);
    assert.deepEqual(cambio, { accion: 'crear', usuario_id: usuarioId });

    assert.deepEqual([r.imagenSubida, r.warnings], [false, []]);
    assert.ok(!('alegraProductId' in r));
  });

  test('no escribe la caché de Alegra ni le habla a Alegra', async () => {
    const antes = Number((await conexion.query('SELECT COUNT(*) AS n FROM alegra_products_cache')).rows[0].n);
    await modulo.crearProductoDesdeLinea(formulario(await linea(1)), undefined, usuarioId);
    assert.equal(Number((await conexion.query('SELECT COUNT(*) AS n FROM alegra_products_cache')).rows[0].n), antes);

    const fuente = fs.readFileSync(RUTAS[2], 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(fuente, /integrations\/alegra|alegraProduct|createProduct|alegra_products_cache/);
    // Y el servicio del módulo ya no importa la integración.
    const servicio = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'productos-revision', 'productos-revision.service.js'), 'utf8');
    assert.doesNotMatch(servicio, /integrations\/alegra|impuestosAlegra/);
  });

  describe('el impuesto', () => {
    test('se propone el que calza con el IVA real de la línea, aunque venga con céntimos de diferencia', async () => {
      // 1 % sobre 2.000 son 20; el proveedor redondeó a 19,90.
      const al1 = await modulo.formularioProducto(await linea(1, { impuesto: 19.9 }));
      assert.deepEqual([al1.impuestoSugerido.tarifa, al1.porcentajeDeLaLinea], [1, 0.99]);
      const al13 = await modulo.formularioProducto(await linea(2, { impuesto: 260.4 }));
      assert.equal(al13.impuestoSugerido.id, await impuestoDe(13));
    });

    test('con tres impuestos de 0 %, se propone el que ya usan los productos', async () => {
      const { impuestoSugerido } = await modulo.formularioProducto(await linea(1, { impuesto: 0 }));
      const { rows: [masUsado] } = await conexion.query(`
        SELECT i.id FROM impuesto i LEFT JOIN producto p ON p.impuesto_id = i.id AND p.activo
         WHERE i.activo AND i.tarifa = 0 GROUP BY i.id ORDER BY COUNT(p.id) DESC, i.id LIMIT 1`);
      assert.equal(impuestoSugerido.id, masUsado.id);
    });

    test('lo que se elige en el formulario gana sobre lo que se deduce', async () => {
      const exento = (await conexion.query(`SELECT id FROM impuesto WHERE activo AND tarifa = 0 ORDER BY id LIMIT 1`)).rows[0].id;
      const r = await modulo.crearProductoDesdeLinea(formulario(await linea(1), { impuestoId: String(exento) }), undefined, usuarioId);
      assert.equal((await producto(r.productoPropioId)).impuesto_id, exento);
    });

    test('una tarifa que no existe no se adivina: hay que elegirla, y no se crea nada', async () => {
      const lineaId = await linea(1, { impuesto: 130 });   // 6,5 %: hay un impuesto así, pero inactivo
      const f = await modulo.formularioProducto(lineaId);
      assert.deepEqual([f.impuestoSugerido, f.porcentajeDeLaLinea], [null, 6.5]);

      const antes = Number((await conexion.query('SELECT COUNT(*) AS n FROM producto')).rows[0].n);
      await assert.rejects(modulo.crearProductoDesdeLinea(formulario(lineaId), undefined, usuarioId),
        { status: 400, message: /Impuesto: la línea del proveedor trae 6\.5 %/ });
      assert.equal(Number((await conexion.query('SELECT COUNT(*) AS n FROM producto')).rows[0].n), antes);
      assert.equal((await lineaEnLaBase(lineaId)).estado, 'PENDIENTE');
    });

    test('el formulario recibe las categorías y los impuestos PROPIOS, solo los activos', async () => {
      const f = await modulo.formularioProducto(await linea(1));
      assert.ok(f.categorias.some(c => c.id === categoriaId && c.nombre === 'zz-categoría de prueba'));
      assert.ok(f.impuestos.length > 0 && f.impuestos.every(i => typeof i.tarifa === 'number' && i.nombre));
      const { rows: inactivos } = await conexion.query('SELECT id FROM impuesto WHERE NOT activo');
      assert.ok(inactivos.every(i => !f.impuestos.some(x => x.id === i.id)));
      await assert.rejects(modulo.formularioProducto('00000000-0000-0000-0000-000000000000'), { status: 404 });
    });
  });

  describe('la referencia', () => {
    test('vacía queda vacía: ya no se rellena con el código del proveedor', async () => {
      const r = await modulo.crearProductoDesdeLinea(formulario(await linea(1), { referencia: '  ' }), undefined, usuarioId);
      assert.equal((await producto(r.productoPropioId)).referencia, null);
    });

    test('repetida no se crea, y dice quién la tiene; la línea sigue pendiente', async () => {
      await conexion.query(
        `INSERT INTO producto (nombre, referencia, precio_sin_iva) VALUES ('zz-el que ya existe', 'zz-REF-TOMADA', 1)`);
      const lineaId = await linea(1);
      await assert.rejects(
        modulo.crearProductoDesdeLinea(formulario(lineaId, { referencia: 'ZZ-ref-tomada' }), undefined, usuarioId),
        { status: 409, message: /ya la usa "zz-el que ya existe"/ });
      assert.equal((await lineaEnLaBase(lineaId)).estado, 'PENDIENTE');
      assert.equal(Number((await conexion.query(`SELECT COUNT(*) AS n FROM producto WHERE nombre = 'zz-producto nuevo'`)).rows[0].n), 0);
    });
  });

  describe('lo que el maestro exige', () => {
    test('sin CABYS de 13 dígitos no se crea: ni el del formulario ni el de la línea sirven', async () => {
      const sinCabys = await linea(1, { cabys: null });
      await assert.rejects(modulo.crearProductoDesdeLinea(formulario(sinCabys), undefined, usuarioId),
        { status: 400, message: /CABYS/ });
      await assert.rejects(modulo.crearProductoDesdeLinea(formulario(sinCabys, { codigoCabys: '1234' }), undefined, usuarioId),
        { status: 400, message: /CABYS: tiene que tener 13 dígitos/ });
      // El de la línea se usa cuando el formulario no trae uno.
      const r = await modulo.crearProductoDesdeLinea(formulario(await linea(2), { codigoCabys: '' }), undefined, usuarioId);
      assert.equal((await producto(r.productoPropioId)).cabys, CABYS);
    });

    test('la casilla de medicamento manda sobre el CABYS, y marcada exige forma y registro', async () => {
      // CABYS farmacéutico (grupo 352) con la casilla desmarcada: no es medicamento.
      const libre = await modulo.crearProductoDesdeLinea(
        formulario(await linea(1, { cabys: '3521100000000' })), undefined, usuarioId);
      assert.equal((await producto(libre.productoPropioId)).es_medicamento, false);

      const lineaId = await linea(2);
      await assert.rejects(
        modulo.crearProductoDesdeLinea(formulario(lineaId, { nombre: 'zz-jarabe', esMedicamento: 'true' }), undefined, usuarioId),
        { status: 400, message: /medicamento necesita forma farmacéutica y registro sanitario/ });

      const r = await modulo.crearProductoDesdeLinea(formulario(lineaId, {
        nombre: 'zz-jarabe', esMedicamento: 'true', formaFarmaceutica: '101', registroSanitario: 'zz-M-1'
      }), undefined, usuarioId);
      const p = await producto(r.productoPropioId);
      assert.deepEqual([p.es_medicamento, p.forma_farmaceutica, p.registro_sanitario], [true, '101', 'zz-M-1']);
    });

    test('sin pronunciarse, un CABYS farmacéutico sí lo marca', async () => {
      const lineaId = await linea(1, { cabys: '3521100000000' });
      const { esMedicamento: _fuera, ...sinCasilla } = formulario(lineaId);
      await assert.rejects(modulo.crearProductoDesdeLinea(sinCasilla, undefined, usuarioId),
        { status: 400, message: /medicamento necesita/ });
    });

    test('la unidad del formulario viejo (vocabulario de Alegra) se guarda como la de Hacienda', async () => {
      const kilo = await modulo.crearProductoDesdeLinea(formulario(await linea(1), { unidad: 'kilogram' }), undefined, usuarioId);
      assert.equal((await producto(kilo.productoPropioId)).unidad, 'kg');
      const defecto = await modulo.crearProductoDesdeLinea(
        formulario(await linea(2), { nombre: 'zz-otro', unidad: '' }), undefined, usuarioId);
      assert.equal((await producto(defecto.productoPropioId)).unidad, 'Unid');
    });

    test('una línea que no existe da 404 antes de crear nada', async () => {
      await assert.rejects(
        modulo.crearProductoDesdeLinea(formulario('00000000-0000-0000-0000-000000000000'), undefined, usuarioId), { status: 404 });
    });
  });

  test('el factor de conversión queda en el mapeo y divide el costo de la compra', async () => {
    // El proveedor factura 2 a ₡1.130 con IVA; yo cuento cada una como 10.
    const r = await modulo.crearProductoDesdeLinea(formulario(await linea(1), { factorConversion: '10', costo: '113' }), undefined, usuarioId);
    const { rows: [m] } = await conexion.query('SELECT factor_conversion FROM supplier_product_mapping WHERE id = $1', [r.mapeoId]);
    assert.equal(Number(m.factor_conversion), 10);
    assert.equal((await derivado.obtenerCostosDerivados()).get(r.productoPropioId).costo, 113);
  });

  describe('la foto', () => {
    test('un archivo o una sugerencia van al almacenamiento propio, con el producto ya creado', async () => {
      const archivo = { buffer: Buffer.from('zz'), originalname: 'zz-foto.png', mimetype: 'image/png' };
      const conArchivo = await modulo.crearProductoDesdeLinea(formulario(await linea(1)), archivo, usuarioId);
      assert.deepEqual(fotos.archivo, [{ id: conArchivo.productoPropioId, nombre: 'zz-foto.png', usuario: usuarioId }]);
      assert.equal(conArchivo.imagenSubida, true);

      const conUrl = await modulo.crearProductoDesdeLinea(formulario(await linea(2), {
        nombre: 'zz-con sugerencia', imageUrl: 'https://zz.example/foto.jpg', fallbackImageUrl: 'https://zz.example/mini.jpg'
      }), undefined, usuarioId);
      assert.deepEqual(fotos.url, [{
        id: conUrl.productoPropioId, url: 'https://zz.example/foto.jpg', urlRespaldo: 'https://zz.example/mini.jpg', usuario: usuarioId
      }]);
    });

    test('si la foto falla, el producto y la relación quedan, y se avisa', async () => {
      fotos.falla = 'el sitio de origen no dejó descargarla.';
      const lineaId = await linea(1);
      const r = await modulo.crearProductoDesdeLinea(formulario(lineaId, { imageUrl: 'https://zz.example/foto.jpg' }), undefined, usuarioId);

      assert.equal(r.imagenSubida, false);
      assert.match(r.warnings[0], /No se pudo guardar la foto: el sitio de origen no dejó descargarla/);
      assert.match(r.message, /con advertencias/);
      assert.equal((await lineaEnLaBase(lineaId)).producto_id, r.productoPropioId);
    });
  });
});

describe('la pantalla de producto nuevo ya no habla de Alegra', () => {
  const fuente = (...partes) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...partes), 'utf8');
  const sinComentarios = (texto) => texto.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');

  test('el formulario pide las categorías y los impuestos al módulo, no a /alegra/categorias', () => {
    const hook = sinComentarios(fuente('hooks', 'useRelacionarProductos.js'));
    assert.match(hook, /\/productos-revision\/\$\{producto\.id\}\/formulario-producto/);
    assert.doesNotMatch(hook, /\/alegra\/categorias/);
  });

  test('tiene impuesto, no tiene cantidad inicial, y las unidades son las de Hacienda', () => {
    const modal = sinComentarios(fuente('components', 'relacionar-productos', 'ModalCrearProducto.jsx'));
    assert.match(modal, /name="impuestoId"/);
    assert.doesNotMatch(modal, /cantidadInicial/);
    assert.match(modal, /<option value="Unid">Unidad<\/option>/);
    assert.doesNotMatch(modal, /value="(unit|kilogram|service)"/);
    assert.doesNotMatch(modal, /Alegra/);
  });

  test('al motor de precios se le manda el NOMBRE de la categoría, no su id', () => {
    // La configuración de márgenes está llaveada por nombre. Con el id nunca
    // calzaba y el precio sugerido salía siempre con el margen por defecto.
    const modal = sinComentarios(fuente('components', 'relacionar-productos', 'ModalCrearProducto.jsx'));
    assert.match(modal, /params: \{ categoria: nombreDeCategoria \}/);
    assert.match(modal, /const nombreDeCategoria = categorias\.find\(c => String\(c\.id\) === String\(categoriaSeleccionada\)\)\?\.nombre \|\| ''/);
  });

  test('el endpoint que escribía el precio en Alegra ya no existe', () => {
    const rutas = sinComentarios(fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'productos-revision', 'productos-revision.routes.js'), 'utf8'));
    assert.doesNotMatch(rutas, /\/ajustar/);
    assert.match(rutas, /'\/:productoId\/formulario-producto'/);
  });
});
