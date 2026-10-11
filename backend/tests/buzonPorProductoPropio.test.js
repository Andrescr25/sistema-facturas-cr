const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { baseEnTransaccion, prismaDelBuzon } = require('./dobles/buzonEnTransaccion');

/**
 * El buzón, al recibir una factura, relaciona por `producto.id` (sección 8,
 * parte 3 de Relacionar Productos).
 *
 * Lo que una persona relacionó una vez, el buzón lo reusa solo en las facturas
 * siguientes de ese proveedor. Hasta el 2026-10-04 lo que copiaba a la línea
 * era el id de Alegra del mapeo: un producto creado en el sistema, sin ficha
 * allá, se relacionaba a mano y a la factura siguiente volvía a quedar a
 * medias.
 *
 * Contra PostgreSQL local, en una transacción que se deshace. El correo no se
 * toca: se llama a `saveFactura` con una factura ya leída del XML.
 */

const rutaDb = require.resolve('../config/database');
const rutaPrisma = require.resolve('../lib/prisma');
const RUTAS = [
  '../src/modules/productos-revision/relacionPropia',
  '../services/databaseService',
  '../src/utils/xmlRutaComprobante'
].map(r => require.resolve(r));

describe('el buzón relaciona por el producto propio — contra PostgreSQL local', () => {
  let pool, conexion, buzon, relacion;
  let sinFicha, conFicha, mapeoSinFicha, mapeoConFicha, mapeoHuerfano;

  const CEDULA = 'zz-3101-buzon';
  const PROVEEDOR = 'zz-PROVEEDOR DEL BUZÓN';

  /** Una factura como la entrega el lector de XML, de contado. */
  const factura = (n, lineas) => ({
    clave: `zz-clave-buzon-${n}`.padEnd(50, '0'),
    numeroConsecutivo: `zz-0000000000000000005${n}`,
    fechaEmision: { iso: '2031-06-10T10:00:00-06:00' },
    emisor: { nombre: ` ${PROVEEDOR} `, identificacion: { numero: CEDULA }, correoElectronico: 'zz@zz.example', telefono: { numero: '00000000' } },
    condicionVenta: '01', plazoCredito: '0', otrosCargos: [],
    resumen: { totales: { comprobante: lineas.length * 1130 }, moneda: { codigo: 'CRC' } },
    productos: lineas.map(([codigo, descripcion], i) => ({
      numeroLinea: i + 1, codigo, codigoCabys: '2413900000100', descripcion, cantidad: 1, unidadMedida: 'Unid',
      precioUnitario: 1000, descuento: { monto: 0 }, impuesto: { monto: 130 }, montoTotalLinea: 1130
    }))
  });
  const lineasDe = async (facturaId) => (await conexion.query(`
    SELECT codigo_proveedor AS codigo, estado_relacionado::text AS estado, producto_id, alegra_item_id, mapeo_id
      FROM productos_factura_proveedor WHERE factura_id = $1 ORDER BY numero_linea`, [facturaId])).rows;
  const avanceDe = async (facturaId) => (await conexion.query(
    'SELECT porcentaje_relacionado AS pct, estado_relacionado AS estado FROM facturas_proveedores WHERE id = $1', [facturaId])).rows[0];
  const usosDe = async (mapeoId) => (await conexion.query(
    'SELECT times_used FROM supplier_product_mapping WHERE id = $1', [mapeoId])).rows[0].times_used;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
    doble(rutaDb, baseEnTransaccion(conexion, 'buzon'));
    doble(rutaPrisma, prismaDelBuzon(conexion));
    for (const r of RUTAS) delete require.cache[r];
    relacion = require(RUTAS[0]);
    buzon = new (require(RUTAS[1]))();

    const producto = async (nombre, alegraId) => (await conexion.query(
      'INSERT INTO producto (nombre, alegra_id, precio_sin_iva) VALUES ($1, $2, 1000) RETURNING id', [nombre, alegraId])).rows[0].id;
    sinFicha = await producto('zz-buzón sin ficha', null);
    conFicha = await producto('zz-buzón con ficha', 'zz-930001');

    // Lo que una persona ya relacionó a mano con este proveedor.
    const linea = (codigo, descripcion) => ({ cedula: CEDULA, codigo, nombreProveedor: PROVEEDOR, descripcion });
    mapeoSinFicha = (await relacion.guardarMapeo(linea('zz-BUZON-1', 'zz-CUADERNO'), await relacion.productoPropio(sinFicha))).id;
    mapeoConFicha = (await relacion.guardarMapeo(linea('zz-BUZON-2', 'zz-LAPICERO'), await relacion.productoPropio(conFicha))).id;
    // Y un mapeo viejo cuyo producto ya no existe en el maestro (quedan 4 así).
    mapeoHuerfano = (await conexion.query(`
      INSERT INTO supplier_product_mapping (supplier_name, supplier_cedula, supplier_code, supplier_desc, alegra_item_id, alegra_name)
      VALUES ($1, $2, 'zz-BUZON-3', 'zz-DESCONTINUADO', 'zz-939999', 'zz-ya no existe') RETURNING id`, [PROVEEDOR, CEDULA])).rows[0].id;
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('lo ya relacionado se reusa por el producto propio, tenga o no ficha en Alegra', async () => {
    const guardada = await buzon.saveFactura(factura(1, [
      ['zz-BUZON-1', 'zz-CUADERNO'], ['zz-BUZON-2', 'zz-LAPICERO'], ['zz-BUZON-3', 'zz-DESCONTINUADO'], ['zz-BUZON-4', 'zz-NUNCA VISTO']
    ]), 'zz-factura-1.xml');

    assert.deepEqual(await lineasDe(guardada.id), [
      // Sin ficha en Alegra: antes quedaba "relacionada" con un id vacío y sin producto.
      { codigo: 'zz-BUZON-1', estado: 'RELACIONADO', producto_id: sinFicha, alegra_item_id: null, mapeo_id: mapeoSinFicha },
      // Con ficha: el id de Alegra va de referencia, y sale del producto propio.
      { codigo: 'zz-BUZON-2', estado: 'RELACIONADO', producto_id: conFicha, alegra_item_id: 'zz-930001', mapeo_id: mapeoConFicha },
      // Un mapeo sin producto propio no relaciona nada: la decide una persona.
      { codigo: 'zz-BUZON-3', estado: 'PENDIENTE', producto_id: null, alegra_item_id: null, mapeo_id: null },
      { codigo: 'zz-BUZON-4', estado: 'PENDIENTE', producto_id: null, alegra_item_id: null, mapeo_id: null }
    ]);

    // El avance sale de las líneas, con la misma cuenta que Relacionar Productos.
    assert.deepEqual(await avanceDe(guardada.id), { pct: 50, estado: null });
    // Los dos mapeos reusados cuentan un uso más; el huérfano, no.
    assert.deepEqual([await usosDe(mapeoSinFicha), await usosDe(mapeoConFicha), await usosDe(mapeoHuerfano)], [2, 2, 1]);
    // Lo que recibe el correo para decidir si la factura queda lista: el estado de cada línea.
    assert.deepEqual(guardada.productos.map(l => l.estadoRelacionado), ['RELACIONADO', 'RELACIONADO', 'PENDIENTE', 'PENDIENTE']);
    assert.equal(guardada.proveedorNombre, PROVEEDOR);
  });

  test('si todo calza, la factura nace completa', async () => {
    const guardada = await buzon.saveFactura(factura(2, [['zz-BUZON-1', 'zz-CUADERNO'], ['zz-BUZON-2', 'zz-LAPICERO']]), 'zz-factura-2.xml');
    assert.deepEqual(await avanceDe(guardada.id), { pct: 100, estado: 'RELACIONADO' });
    assert.ok((await lineasDe(guardada.id)).every(l => l.estado === 'RELACIONADO' && l.producto_id));
  });

  test('un código débil con otra descripción sigue sin reusarse', async () => {
    // "01" no identifica nada: si la descripción no se parece, no es el mismo producto.
    const debil = { cedula: CEDULA, codigo: '01', nombreProveedor: PROVEEDOR, descripcion: 'zz-MARTILLO DE UÑA 16 OZ' };
    await relacion.guardarMapeo(debil, await relacion.productoPropio(sinFicha));
    const guardada = await buzon.saveFactura(factura(3, [['01', 'zz-BOLSA DE BASURA JARDIN']]), 'zz-factura-3.xml');
    assert.deepEqual((await lineasDe(guardada.id)).map(l => [l.estado, l.producto_id]), [['PENDIENTE', null]]);
    // Con la misma descripción sí.
    const igual = await buzon.saveFactura(factura(4, [['01', 'zz-MARTILLO DE UÑA 16 OZ']]), 'zz-factura-4.xml');
    assert.deepEqual((await lineasDe(igual.id)).map(l => [l.estado, l.producto_id]), [['RELACIONADO', sinFicha]]);
  });

  test('la misma factura que llega dos veces no se guarda dos veces', async () => {
    const primera = await buzon.saveFactura(factura(5, [['zz-BUZON-1', 'zz-CUADERNO']]), 'zz-factura-5.xml');
    const usos = await usosDe(mapeoSinFicha);
    const segunda = await buzon.saveFactura(factura(5, [['zz-BUZON-1', 'zz-CUADERNO']]), 'zz-factura-5.xml');
    assert.equal(segunda.id, primera.id);
    assert.equal((await lineasDe(primera.id)).length, 1);
    assert.equal(await usosDe(mapeoSinFicha), usos);
  });
});

describe('el buzón ya no relaciona por Alegra', () => {
  const leer = (...partes) => fs.readFileSync(path.join(__dirname, '..', ...partes), 'utf8');
  const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('guardar la factura no copia el id de Alegra del mapeo ni consulta un mapeo por línea', () => {
    const servicio = sinComentarios(leer('services', 'databaseService.js'));
    assert.doesNotMatch(servicio, /alegraItemId: mapeo\.alegraItemId/);
    assert.doesNotMatch(servicio, /supplierProductMapping\.findUnique/);
    assert.match(servicio, /mapeosDelProveedor\(proveedorCedula/);
    assert.match(servicio, /mapeo && mapeo\.productoId && mapeoSeguroParaReusar/);
    // Los métodos que nadie llamaba, y que relacionaban por el id de Alegra.
    for (const metodo of ['findSimilarProducts', 'createProductMapping', 'updateProductMapping', 'getFacturasByEstado', 'getEstadisticas']) {
      assert.doesNotMatch(servicio, new RegExp(`async ${metodo}\\(`), `${metodo} volvió`);
    }
  });

  test('el correo no le pide a la caché de Alegra un "parecido" por cada línea pendiente', () => {
    const correo = sinComentarios(leer('services', 'emailService.js'));
    assert.doesNotMatch(correo, /integrations\/alegra|alegraProductService|findSimilarProducts/);
    // Sigue sin crear mapeos por parecido de texto: la primera vez decide una persona.
    assert.doesNotMatch(correo, /createProductMapping/);
  });

  test('las ayudas que colgaban los ids propios DESPUÉS de relacionar por Alegra ya no existen', () => {
    assert.equal(fs.existsSync(path.join(__dirname, '..', 'src', 'modules', 'productos-revision', 'idsPropiosDelMapeo.js')), false);
    const relacion = sinComentarios(leer('src', 'modules', 'productos-revision', 'relacionPropia.js'));
    assert.doesNotMatch(relacion, /ligarProductoDeLineas/);
  });
});
