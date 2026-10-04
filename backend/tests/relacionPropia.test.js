const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Relacionar lo que factura un proveedor con un producto PROPIO (sección 13,
 * migración 038).
 *
 * Contra PostgreSQL local, en una transacción que se deshace. Lo que cambió el
 * 2026-10-03 y acá se comprueba:
 *  · la línea del buzón y el mapeo guardan `producto.id`; el id de Alegra
 *    queda al lado solo cuando el producto tiene ficha allá;
 *  · un producto creado en el sistema, SIN ficha en Alegra, se puede relacionar
 *    y su compra deja costo;
 *  · editar y soltar una relación mueven el producto de la línea y su costo;
 *  · lo que todavía relaciona por el id de Alegra (confirmar en Revisión de
 *    Precios, el buzón al recibir) deja la línea colgada de su producto propio.
 *
 * Prisma abre su propia conexión y no vería lo que hay en esta transacción:
 * se reemplaza por un doble que lee de la MISMA conexión, con lo justo que el
 * servicio le pide.
 *
 * LO QUE ESE DOBLE NO VEÍA, y costó un 500 en el navegador: el Prisma de
 * verdad valida tipos. El cliente generado declara `alegraItemId` del mapeo
 * obligatorio, así que una fila con NULL revienta cada lectura. Por eso el
 * doble de acá lo imita (falla con NULL, igual que el P2032) y hay un bloque
 * aparte que amarra las tres cosas: lo que exige el cliente, lo que permite
 * la columna y lo que escribe el código.
 */

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const RUTAS = [
  '../src/modules/productos-revision/relacionPropia',
  '../src/modules/productos-revision/productos-revision.service',
  '../src/modules/precios/costoHistorico',
  '../src/modules/precios/costoDerivado'
].map(r => require.resolve(r));

describe('la relación de compra por producto propio — contra PostgreSQL local', () => {
  let pool, conexion, servicio, relacion, derivado;
  let conAlegra, sinAlegra, proveedorId, facturaId, lineaA1, lineaA2, lineaB, mapeoA;

  const CEDULA = 'zz-3101-relacion';

  const comoLinea = (f) => ({
    id: f.id, facturaId: f.factura_id, numeroLinea: f.numero_linea,
    codigoProveedor: f.codigo_proveedor, descripcion: f.descripcion,
    cantidad: Number(f.cantidad), precioUnitario: Number(f.precio_unitario),
    descuento: Number(f.descuento || 0), impuesto: Number(f.impuesto || 0), totalLinea: Number(f.total_linea),
    alegraItemId: f.alegra_item_id, estadoRelacionado: f.estado_relacionado, mapeoId: f.mapeo_id,
    factura: { id: f.factura_id, fechaEmision: f.fecha_emision, proveedorNombre: f.proveedor_nombre, proveedorCedula: f.proveedor_cedula },
    mapeo: f.mapeo_id ? leerMapeoDeLinea(f) : null
  });
  // Abrir una factura trae el mapeo de cada línea (`include: { mapeo: true }`).
  const leerMapeoDeLinea = (f) => {
    if (f.mapeo_alegra_item_id === null) throw new Error('Prisma no puede leer un mapeo con alegra_item_id NULL');
    return { id: f.mapeo_id, factorConversion: f.factor_conversion, alegraItemId: f.mapeo_alegra_item_id };
  };
  const lineas = async (filtro, params) => (await conexion.query(`
    SELECT l.*, f.fecha_emision, f.proveedor_nombre, f.proveedor_cedula, m.factor_conversion,
           m.alegra_item_id AS mapeo_alegra_item_id
      FROM productos_factura_proveedor l
      JOIN facturas_proveedores f ON f.id = l.factura_id
      LEFT JOIN supplier_product_mapping m ON m.id = l.mapeo_id
     WHERE ${filtro} ORDER BY l.numero_linea`, params)).rows.map(comoLinea);
  // Igual que el cliente de verdad (P2032): estos dos no pueden venir en NULL.
  const comoMapeoPrisma = (m) => {
    if (!m) return m;
    for (const campo of ['alegra_item_id', 'alegra_name']) {
      if (m[campo] === null) throw new Error(`Prisma no puede leer un mapeo con ${campo} NULL`);
    }
    return comoMapeoPrismaSinValidar(m);
  };
  const comoMapeoPrismaSinValidar = (m) => ({
    id: m.id, supplierName: m.supplier_name, supplierCedula: m.supplier_cedula, supplierCode: m.supplier_code,
    supplierDesc: m.supplier_desc, alegraItemId: m.alegra_item_id, alegraReference: m.alegra_reference,
    alegraName: m.alegra_name, confidence: Number(m.confidence), timesUsed: m.times_used,
    origen: m.origen, factorConversion: m.factor_conversion, lastUsedDate: m.last_used_date
  });
  const mapeos = async (filtro, params) => (await conexion.query(
    `SELECT * FROM supplier_product_mapping WHERE ${filtro}`, params)).rows.map(comoMapeoPrisma);

  const prismaDoble = {
    productoFactura: {
      findUnique: async ({ where }) => (await lineas('l.id = $1', [where.id]))[0] || null,
      findMany: async ({ where }) => {
        if (where.id?.in) return lineas('l.id = ANY($1::uuid[])', [where.id.in]);
        if (where.mapeoId) return lineas('l.mapeo_id = $1', [where.mapeoId]);
        return lineas('l.factura_id = $1', [where.facturaId]);
      },
      count: async ({ where }) => (await lineas('l.factura_id = $1', [where.facturaId]))
        .filter(l => !where.estadoRelacionado || l.estadoRelacionado === where.estadoRelacionado).length
    },
    factura: {
      findUnique: async ({ where }) => ({ id: where.id, productos: await lineas('l.factura_id = $1', [where.id]) }),
      update: async ({ where, data }) => conexion.query(
        'UPDATE facturas_proveedores SET porcentaje_relacionado = $2 WHERE id = $1', [where.id, data.porcentajeRelacionado])
    },
    supplierProductMapping: {
      findUnique: async ({ where }) => (where.id
        ? await mapeos('id = $1', [where.id])
        : await mapeos('supplier_cedula = $1 AND supplier_code = $2',
          [where.supplierCedula_supplierCode.supplierCedula, where.supplierCedula_supplierCode.supplierCode]))[0] || null,
      findMany: async ({ where }) => (await mapeos('id = ANY($1::uuid[])', [where.id.in])).map(m => ({ ...m, productos: [] })),
      delete: async ({ where }) => conexion.query('DELETE FROM supplier_product_mapping WHERE id = $1', [where.id])
    }
  };

  /** La línea como quedó en la base, con lo que la relación escribe. */
  const enLaBase = async (lineaId) => (await conexion.query(`
    SELECT producto_id, alegra_item_id, estado_relacionado::text AS estado, mapeo_id, confianza::float8 AS confianza
      FROM productos_factura_proveedor WHERE id = $1`, [lineaId])).rows[0];
  const costoDe = async (lineaId) => (await conexion.query(
    'SELECT producto_id, alegra_item_id FROM costo_historico WHERE producto_factura_id = $1', [lineaId])).rows[0];
  const mapeoEnLaBase = async (codigo) => (await conexion.query(`
    SELECT id, producto_id, proveedor_id, alegra_item_id, alegra_name, alegra_reference, times_used, origen
      FROM supplier_product_mapping WHERE supplier_cedula = $1 AND supplier_code = $2`, [CEDULA, codigo])).rows[0];

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
    doble(rutaDb, { query: (sql, params) => conexion.query(sql, params) });
    doble(rutaPrisma, prismaDoble);
    for (const r of RUTAS) delete require.cache[r];
    relacion = require(RUTAS[0]);
    servicio = require(RUTAS[1]);
    derivado = require(RUTAS[3]);

    const producto = async (nombre, referencia, alegraId) => (await conexion.query(
      `INSERT INTO producto (nombre, referencia, alegra_id, precio_sin_iva) VALUES ($1, $2, $3, 1000) RETURNING id`,
      [nombre, referencia, alegraId])).rows[0].id;
    conAlegra = await producto('zz-relación con Alegra', 'zz-REL-1', 'zz-910001');
    sinAlegra = await producto('zz-relación sin Alegra', 'zz-REL-2', null);

    proveedorId = (await conexion.query(
      `INSERT INTO proveedor (nombre, identificacion) VALUES ('zz-proveedor de relación', $1) RETURNING id`, [CEDULA])).rows[0].id;

    facturaId = (await conexion.query(`
      INSERT INTO facturas_proveedores (clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula,
                                        total_productos, total_factura, archivo_xml)
      VALUES ('zz-clave-relacion-propia', 'zz-00000000000000000038', '2031-04-10', 'zz-proveedor de relación', $1,
              3, 0, '<zz/>') RETURNING id`, [CEDULA])).rows[0].id;

    const linea = async (n, codigo) => (await conexion.query(`
      INSERT INTO productos_factura_proveedor
        (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad, unidad_medida, precio_unitario, total_linea, impuesto)
      VALUES ($1, $2, $3, $4, 2, 'Unid', 500, 1130, 130) RETURNING id`,
    [facturaId, n, codigo, `zz-línea ${codigo}`])).rows[0].id;
    // El proveedor facturó el mismo código en dos renglones, y otro distinto.
    lineaA1 = await linea(1, 'zz-A');
    lineaA2 = await linea(2, 'zz-A');
    lineaB = await linea(3, 'zz-B');
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('un producto SIN ficha en Alegra se puede relacionar, y su compra deja costo', async () => {
    const r = await servicio.crearRelacion({ productoProveedorId: lineaA1, productoPropioId: sinAlegra });

    mapeoA = (await mapeoEnLaBase('zz-A')).id;
    assert.deepEqual(await enLaBase(lineaA1), {
      producto_id: sinAlegra, alegra_item_id: null, estado: 'RELACIONADO', mapeo_id: mapeoA, confianza: 100
    });
    // En el MAPEO "sin ficha en Alegra" es '' y no NULL: ver el bloque de abajo.
    assert.deepEqual(await mapeoEnLaBase('zz-A'), {
      id: mapeoA, producto_id: sinAlegra, proveedor_id: proveedorId,
      alegra_item_id: '', alegra_name: 'zz-relación sin Alegra', alegra_reference: 'zz-REL-2',
      times_used: 1, origen: 'manual'
    });
    // La compra entró al historial por el id propio: 1130 / 2 unidades.
    assert.deepEqual(await costoDe(lineaA1), { producto_id: sinAlegra, alegra_item_id: null });
    assert.equal((await derivado.obtenerCostosDerivados()).get(sinAlegra).costo, 565);

    assert.equal(r.producto.productoPropioId, sinAlegra);
    assert.equal(r.mapeo.productoPropioId, sinAlegra);
    assert.equal(r.mapeo.productoNombre, 'zz-relación sin Alegra');
    assert.equal(r.porcentajeRelacionado, 33);
    assert.equal(r.facturaCompleta, false);
  });

  test('con un producto que SÍ tiene ficha, el id de Alegra se guarda al lado y sale del propio', async () => {
    await servicio.crearRelacion({ productoProveedorId: lineaA2, productoPropioId: conAlegra });

    assert.deepEqual(await enLaBase(lineaA2), {
      producto_id: conAlegra, alegra_item_id: 'zz-910001', estado: 'RELACIONADO', mapeo_id: mapeoA, confianza: 100
    });
    // El mismo código del proveedor: es el MISMO mapeo, apuntado al producto
    // nuevo y con un uso más.
    const mapeo = await mapeoEnLaBase('zz-A');
    assert.deepEqual(
      { id: mapeo.id, producto: mapeo.producto_id, alegra: mapeo.alegra_item_id, usos: mapeo.times_used },
      { id: mapeoA, producto: conAlegra, alegra: 'zz-910001', usos: 2 });
    // La otra línea NO se mueve sola: por eso el producto se guarda en la
    // línea y no se deduce del mapeo (70 líneas reales difieren del suyo).
    assert.equal((await enLaBase(lineaA1)).producto_id, sinAlegra);
    assert.deepEqual(await costoDe(lineaA2), { producto_id: conAlegra, alegra_item_id: 'zz-910001' });
  });

  test('no se relaciona con un producto que no existe, ni con algo que no es un id', async () => {
    await assert.rejects(
      servicio.crearRelacion({ productoProveedorId: lineaB, productoPropioId: 2000000000 }), { status: 404 });
    // Un id de Alegra de los de antes tampoco entra por otra puerta: acá solo
    // hay enteros de `producto.id`.
    await assert.rejects(
      servicio.crearRelacion({ productoProveedorId: lineaB, productoPropioId: 'zz-910001' }), { status: 400 });

    assert.deepEqual(await enLaBase(lineaB), {
      producto_id: null, alegra_item_id: null, estado: 'PENDIENTE', mapeo_id: null, confianza: null
    });
    assert.equal(await mapeoEnLaBase('zz-B'), undefined);
  });

  test('la pantalla recibe cada línea con su producto propio', async () => {
    const { data } = await servicio.getFacturaConProductos(facturaId);
    assert.deepEqual(data.productos.map(l => [l.codigoProveedor, l.productoPropioId, l.productoInfo && l.productoInfo.name]), [
      ['zz-A', sinAlegra, 'zz-relación sin Alegra'],
      ['zz-A', conAlegra, 'zz-relación con Alegra'],
      ['zz-B', null, null]
    ]);

    const { mapeo } = await servicio.getMapeoDeProducto(lineaA1);
    assert.deepEqual(
      { id: mapeo.id, producto: mapeo.productoPropioId, nombre: mapeo.productoNombre, referencia: mapeo.productoReferencia },
      { id: mapeoA, producto: conAlegra, nombre: 'zz-relación con Alegra', referencia: 'zz-REL-1' });
  });

  test('el buscador ofrece el maestro propio, tenga o no ficha en Alegra', async () => {
    const { productos } = await servicio.buscarProductos('zz-relación');
    assert.deepEqual(productos.map(p => p.id).sort((a, b) => a - b), [conAlegra, sinAlegra].sort((a, b) => a - b));
    assert.ok(productos.every(p => p.productoPropioId === p.id && !('alegraItemId' in p)));

    // Por referencia también, y un producto dado de baja no se ofrece.
    assert.deepEqual((await servicio.buscarProductos('zz-REL-2')).productos.map(p => p.id), [sinAlegra]);
    await conexion.query('SAVEPOINT baja');
    await conexion.query('UPDATE producto SET activo = FALSE WHERE id = $1', [sinAlegra]);
    assert.deepEqual((await servicio.buscarProductos('zz-REL-2')).productos, []);
    await conexion.query('ROLLBACK TO SAVEPOINT baja');
  });

  test('las relaciones de un producto se piden por su id propio', async () => {
    const r = await servicio.getRelacionesDeProducto(conAlegra);
    assert.deepEqual(r.producto, { id: conAlegra, reference: 'zz-REL-1', name: 'zz-relación con Alegra' });
    assert.deepEqual(r.relaciones.map(x => [x.mapeoId, x.producto.id]), [[mapeoA, conAlegra]]);
    // Un producto sin ninguna relación responde vacío, no 404: existe.
    assert.equal((await servicio.getRelacionesDeProducto(sinAlegra)).total, 0);
    await assert.rejects(servicio.getRelacionesDeProducto(2000000000), { status: 404 });
  });

  test('editar la relación se lleva TODAS las líneas del mapeo, y sus costos', async () => {
    const r = await servicio.editarRelacion(mapeoA, sinAlegra);

    assert.equal(r.productosAfectados, 2);
    assert.equal(r.mapeo.productoPropioId, sinAlegra);
    for (const id of [lineaA1, lineaA2]) {
      const l = await enLaBase(id);
      assert.deepEqual([l.producto_id, l.alegra_item_id, l.estado], [sinAlegra, null, 'RELACIONADO']);
      assert.deepEqual(await costoDe(id), { producto_id: sinAlegra, alegra_item_id: null });
    }
    const mapeo = await mapeoEnLaBase('zz-A');
    assert.deepEqual([mapeo.producto_id, mapeo.alegra_item_id, mapeo.alegra_name], [sinAlegra, '', 'zz-relación sin Alegra']);
    // Al producto anterior no le queda ninguna compra.
    assert.equal((await derivado.obtenerCostosDerivados()).get(conAlegra), undefined);

    await assert.rejects(servicio.editarRelacion(mapeoA, 2000000000), { status: 404 });
    assert.equal((await mapeoEnLaBase('zz-A')).producto_id, sinAlegra);
  });

  test('soltar una línea la deja pendiente y sin costo; el mapeo sigue para las que vengan', async () => {
    await servicio.eliminarRelacionDeProducto(lineaA1);

    assert.deepEqual(await enLaBase(lineaA1), {
      producto_id: null, alegra_item_id: null, estado: 'PENDIENTE', mapeo_id: null, confianza: null
    });
    assert.equal(await costoDe(lineaA1), undefined);
    assert.equal((await mapeoEnLaBase('zz-A')).producto_id, sinAlegra);
    assert.equal((await enLaBase(lineaA2)).producto_id, sinAlegra);
  });

  test('lo que todavía relaciona por Alegra o por un mapeo deja la línea con su producto propio', async () => {
    // Revisión de Precios confirma por el id de Alegra.
    await conexion.query(`
      UPDATE productos_factura_proveedor SET alegra_item_id = 'zz-910001', estado_relacionado = 'RELACIONADO' WHERE id = $1`, [lineaB]);
    await relacion.ligarProductoDeLineas([lineaB]);
    assert.equal((await enLaBase(lineaB)).producto_id, conAlegra);

    // El buzón, al recibir otra factura del mismo proveedor, relaciona por el
    // mapeo y copia su id de Alegra a la línea. Si el producto no tiene ficha
    // lo que copia es el '' del mapeo: el producto sale del mapeo, y en la
    // línea ese '' vuelve a ser NULL.
    await conexion.query(`
      UPDATE productos_factura_proveedor SET alegra_item_id = '', estado_relacionado = 'RELACIONADO', mapeo_id = $2 WHERE id = $1`,
    [lineaA1, mapeoA]);
    await relacion.ligarProductoDeLineas({ facturaId });
    assert.deepEqual(
      [(await enLaBase(lineaA1)).producto_id, (await enLaBase(lineaA1)).alegra_item_id], [sinAlegra, null]);
    assert.equal((await enLaBase(lineaB)).producto_id, conAlegra);

    // Una línea que vuelve a pendiente no se queda con un producto.
    await conexion.query(`UPDATE productos_factura_proveedor SET estado_relacionado = 'PENDIENTE' WHERE id = $1`, [lineaB]);
    await relacion.ligarProductoDeLineas([lineaB]);
    assert.equal((await enLaBase(lineaB)).producto_id, null);

    // Sin nada que ligar no consulta, y un fallo no se propaga.
    await relacion.ligarProductoDeLineas([]);
    await relacion.ligarProductoDeLineas(null);
  });

  test('eliminar la relación entera suelta sus líneas y borra el mapeo', async () => {
    const r = await servicio.eliminarRelacionPorMapeo(mapeoA);

    assert.equal(r.productosAfectados, 2);
    for (const id of [lineaA1, lineaA2]) {
      const l = await enLaBase(id);
      assert.deepEqual([l.producto_id, l.estado, l.mapeo_id], [null, 'PENDIENTE', null]);
      // Y su compra sale del historial de costos: antes se quedaba ahí.
      assert.equal(await costoDe(id), undefined);
    }
    assert.equal(await mapeoEnLaBase('zz-A'), undefined);
  });
});

describe('el mapeo de un producto sin ficha en Alegra se puede leer con Prisma', () => {
  // Las tres cosas tienen que decir lo mismo. Si un día se regenera el cliente
  // con el campo opcional, la primera prueba falla y avisa que '' puede pasar
  // a ser NULL (y que la migración puede soltar el NOT NULL).
  const OBLIGATORIOS = ['alegraItemId', 'alegraName'];

  test('el cliente generado los exige', () => {
    const { Prisma } = require('@prisma/client');
    const modelo = Prisma.dmmf.datamodel.models.find(m => m.name === 'SupplierProductMapping');
    for (const campo of OBLIGATORIOS) {
      assert.equal(modelo.fields.find(f => f.name === campo).isRequired, true,
        `${campo} ya es opcional en el cliente: '' puede volver a ser NULL (relacionPropia.js y migración 038)`);
    }
  });

  test('la base no deja guardar NULL en ninguno de los dos', async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const { rows } = await pool.query(`
        SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_name = 'supplier_product_mapping' AND column_name IN ('alegra_item_id', 'alegra_name')
         ORDER BY column_name`);
      assert.deepEqual(rows, [
        { column_name: 'alegra_item_id', is_nullable: 'NO' },
        { column_name: 'alegra_name', is_nullable: 'NO' }
      ]);
    } finally { await pool.end(); }
  });

  test('y el código escribe la cadena vacía, que en JavaScript vale como "no tiene"', () => {
    const { SIN_FICHA_EN_ALEGRA } = require('../src/modules/productos-revision/relacionPropia');
    assert.equal(SIN_FICHA_EN_ALEGRA, '');
    assert.ok(!SIN_FICHA_EN_ALEGRA);
    const fuente = require('fs').readFileSync(require.resolve('../src/modules/productos-revision/relacionPropia'), 'utf8');
    // En el mapeo, nunca `|| null` para el id de Alegra.
    assert.equal((fuente.match(/producto\.alegra_id \|\| SIN_FICHA_EN_ALEGRA/g) || []).length, 2);
    const migracion = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'migrations', 'independencia', '038_relacion_de_compra_por_producto_propio.sql'), 'utf8');
    assert.doesNotMatch(migracion, /supplier_product_mapping ALTER COLUMN alegra_(item_id|name) DROP NOT NULL/);
  });
});

describe('quién vende qué se cruza por el producto propio', () => {
  const fs = require('fs');
  const path = require('path');
  const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('el maestro de productos y el de proveedores ya no cruzan el mapeo por el id de Alegra', () => {
    for (const archivo of [['productos', 'productos.service.js'], ['proveedores', 'proveedores.maestro.service.js']]) {
      const fuente = sinComentarios(fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', ...archivo), 'utf8'));
      assert.doesNotMatch(fuente, /m\.alegra_item_id/, `${archivo[1]} todavía cruza por el id de Alegra`);
      assert.match(fuente, /m\.producto_id/);
    }
  });
});

describe('la relación ya no acepta ids de Alegra', () => {
  const fs = require('fs');
  const path = require('path');
  const leer = (...partes) => fs.readFileSync(path.join(__dirname, '..', ...partes), 'utf8');
  const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('el controlador pide `productoPropioId` y no lee `alegraItemId` para relacionar', () => {
    const controlador = sinComentarios(leer('src', 'modules', 'productos-revision', 'productos-revision.controller.js'));
    const cuerpoDe = (nombre) => controlador.slice(controlador.indexOf(`async function ${nombre}(`)).split(/\nasync function /)[0];

    for (const funcion of ['crearRelacion', 'editarRelacion', 'getRelacionesDeProducto']) {
      assert.match(cuerpoDe(funcion), /productoPropioId/, `${funcion} no usa productoPropioId`);
      assert.doesNotMatch(cuerpoDe(funcion), /alegra/i, `${funcion} todavía habla de Alegra`);
    }
  });

  test('las rutas que le preguntaban a Alegra por un producto ya no existen', () => {
    const rutas = sinComentarios(leer('src', 'modules', 'productos-revision', 'productos-revision.routes.js'));
    assert.doesNotMatch(rutas, /buscar-alegra|info-alegra/);
    assert.match(rutas, /'\/producto\/:productoPropioId\/relaciones'/);
  });

  test('las dos pantallas mandan el id propio', () => {
    const fuente = (...partes) => sinComentarios(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...partes), 'utf8'));
    const relacionar = fuente('hooks', 'useRelacionarProductos.js');
    const gestionar = fuente('hooks', 'useGestionarRelaciones.js');

    assert.match(relacionar, /productoPropioId:/);
    assert.match(gestionar, /productoPropioId:/);
    assert.match(gestionar, /\/productos-revision\/producto\/\$\{producto\.productoPropioId\}\/relaciones/);
    for (const [nombre, texto] of [['Relacionar', relacionar], ['Gestionar', gestionar]]) {
      assert.doesNotMatch(texto, /nuevoAlegraItemId|buscar-alegra|info-alegra/, `${nombre} todavía usa una ruta o un campo de Alegra`);
    }
  });
});
