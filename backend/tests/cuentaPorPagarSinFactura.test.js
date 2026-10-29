const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Pagos a Proveedores con una factura cargada a mano (2026-10-29).
 *
 * El usuario abrió Pagos a Proveedores y la lista no cargó: 500, «Error
 * obteniendo cuentas por pagar». La causa: la factura de compra a mano a
 * CRÉDITO crea su cuenta por pagar sin factura del buzón (`factura_id` NULL), y
 * la lista la leía con Prisma, cuyo cliente generado declara `facturaId`
 * obligatorio (P2032). Bastaba UNA cuenta así para que fallara la pantalla
 * entera. Mismo caso de docs/grafo/leccion/el-doble-de-prisma-no-valida-tipos.md.
 *
 * Esta prueba crea la cuenta con el MISMO código que usa la compra a mano
 * (`crearCuentaACredito` / `crearCuentaDeContado`) y la lee con el servicio de
 * la pantalla. Corre en una transacción que se deshace.
 */

const rutaServicio = path.join(__dirname, '..', 'services', 'pagosProveedoresService.js');
const BACK = path.join(__dirname, '..');
const CEDULA = 'ZZ-CED-SINFACTURA';

describe('una cuenta por pagar sin factura del buzón no tumba la lista — contra PostgreSQL local', () => {
  let pool, conexion, servicio, liberar;
  let cuentaCredito, cuentaContado, cuentaConFactura, facturaId;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) {
      if (r.includes(`${path.sep}src${path.sep}`) || r.includes(`${path.sep}services${path.sep}`)) delete require.cache[r];
    }
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'cxp') };
    servicio = require(rutaServicio);
    liberar = require('../src/modules/compras/liberarCuentaPorPagar');

    const proveedor = { proveedor_nombre: 'zz-proveedor sin factura', proveedor_cedula: CEDULA };
    const compra = (total) => ({ id: null, proveedor_id: null, fecha_emision: '2026-10-20', total });

    // Las dos que crea la factura cargada a mano: sin factura del buzón.
    cuentaCredito = await liberar.crearCuentaACredito(conexion, { ...proveedor, numero_consecutivo: 'ZZ-MANUAL-CREDITO' }, compra(5000), 30);
    cuentaContado = await liberar.crearCuentaDeContado(conexion, { ...proveedor, id: null, numero_consecutivo: 'ZZ-MANUAL-CONTADO' }, compra(3000));

    // Y una normal, con factura y productos, para ver que lo de siempre sigue igual.
    facturaId = (await conexion.query(
      `INSERT INTO facturas_proveedores (clave, numero_consecutivo, fecha_emision, proveedor_nombre, proveedor_cedula,
                                         total_productos, total_factura, archivo_xml)
       VALUES ('zz-clave-cxp-0001', 'ZZ-BUZON-0001', '2026-10-10', 'zz-proveedor con factura', $1, 2, 8000, '<x/>') RETURNING id`,
      [CEDULA])).rows[0].id;
    for (const [n, descripcion] of [[2, 'segunda línea'], [1, 'primera línea']]) {
      await conexion.query(
        `INSERT INTO productos_factura_proveedor (factura_id, numero_linea, codigo_proveedor, descripcion, cantidad,
                                                  unidad_medida, precio_unitario, impuesto, total_linea)
         VALUES ($1, $2, 'ZZ-COD', $3, 2, 'Unid', 1000, 13, 4000)`, [facturaId, n, descripcion]);
    }
    cuentaConFactura = (await conexion.query(
      `INSERT INTO cuentas_por_pagar (factura_id, proveedor_nombre, proveedor_cedula, numero_consecutivo, condicion_venta,
                                      plazo_credito, fecha_emision, fecha_vencimiento, monto_total, saldo_pendiente, estado, liberada)
       VALUES ($1, 'zz-proveedor con factura', $2, 'ZZ-BUZON-0001', '02', 30, '2026-10-10', '2026-11-09', 8000, 8000, 'PENDIENTE', TRUE)
       RETURNING id`, [facturaId, CEDULA])).rows[0].id;
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('la factura cargada a mano deja la cuenta sin factura (el caso que rompía la lista)', () => {
    assert.ok(cuentaCredito.id && cuentaContado.id);
    assert.equal(cuentaCredito.factura_id, null);
    assert.equal(cuentaContado.factura_id, null);
  });

  test('la lista carga y trae las tres: las dos sin factura y la normal', async () => {
    const { data } = await servicio.listarCuentas({ proveedor: CEDULA });

    assert.deepEqual(data.map(c => c.numeroConsecutivo).sort(), ['ZZ-BUZON-0001', 'ZZ-MANUAL-CONTADO', 'ZZ-MANUAL-CREDITO']);
  });

  test('sin factura: facturaId null, sin productos y el número de la propia cuenta', async () => {
    const { data } = await servicio.listarCuentas({ proveedor: CEDULA });
    const credito = data.find(c => c.numeroConsecutivo === 'ZZ-MANUAL-CREDITO');

    assert.equal(credito.facturaId, null);
    assert.deepEqual(credito.productos, []);
    assert.equal(credito.numeroFacturaProveedor, 'ZZ-MANUAL-CREDITO');
    assert.equal(credito.montoTotal, 5000);
    assert.equal(credito.saldoPendiente, 5000, 'el saldo sigue saliendo de la vista, no de la columna');
    assert.equal(credito.condicionVenta, '02');
    assert.equal(credito.plazoCredito, 30);
    assert.equal(credito.deContado, false);
  });

  test('la de contado nace pendiente y se ve como CONTADO, no como vencida', async () => {
    const { data, resumen } = await servicio.listarCuentas({ proveedor: CEDULA });
    const contado = data.find(c => c.numeroConsecutivo === 'ZZ-MANUAL-CONTADO');

    assert.equal(contado.deContado, true);
    assert.equal(contado.estado, 'CONTADO');
    assert.equal(resumen.deContado.cantidad, 1);
  });

  test('la normal sigue trayendo su factura y sus líneas, en el orden de la factura', async () => {
    const { data } = await servicio.listarCuentas({ proveedor: CEDULA });
    const normal = data.find(c => c.id === cuentaConFactura);

    assert.equal(normal.facturaId, facturaId);
    assert.deepEqual(normal.productos.map(p => p.descripcion), ['primera línea', 'segunda línea']);
    assert.equal(typeof normal.productos[0].cantidad, 'number', 'los montos llegan como número, no como texto');
    assert.equal(normal.productos[0].totalLinea, 4000);
    assert.equal(normal.numeroFacturaProveedor, 'ZZ-BUZON-0001');
  });

  test('las fechas son las mismas que daba Prisma: el instante guardado, leído como UTC', async () => {
    const { data } = await servicio.listarCuentas({ proveedor: CEDULA });
    const normal = data.find(c => c.id === cuentaConFactura);

    assert.equal(new Date(normal.fechaEmision).toISOString(), '2026-10-10T00:00:00.000Z');
    assert.equal(new Date(normal.fechaVencimiento).toISOString(), '2026-11-09T00:00:00.000Z');
  });

  test('de la que vence primero a la que vence después', async () => {
    const { data } = await servicio.listarCuentas({ proveedor: CEDULA });
    const venc = data.map(c => new Date(c.fechaVencimiento).getTime());

    assert.deepEqual(venc, [...venc].sort((a, b) => a - b));
  });

  test('la búsqueda de texto y el proveedor siguen filtrando, también las que no tienen factura', async () => {
    const porNumero = await servicio.listarCuentas({ proveedor: CEDULA, search: 'manual-cre' });
    assert.deepEqual(porNumero.data.map(c => c.numeroConsecutivo), ['ZZ-MANUAL-CREDITO']);

    const porNombre = await servicio.listarCuentas({ search: 'zz-proveedor con factura' });
    assert.deepEqual(porNombre.data.map(c => c.numeroConsecutivo), ['ZZ-BUZON-0001']);

    const otro = await servicio.listarCuentas({ proveedor: 'ZZ-CED-QUE-NO-EXISTE' });
    assert.deepEqual(otro.data, []);
  });

  test('un % o un _ en la búsqueda no es comodín', async () => {
    const { data } = await servicio.listarCuentas({ proveedor: CEDULA, search: '%' });
    assert.deepEqual(data, []);
  });

  test('el filtro de proveedores de la pantalla incluye al de una cuenta sin factura', async () => {
    const proveedores = await servicio.listarProveedoresConCuentas();

    assert.ok(proveedores.some(p => p.cedula === CEDULA));
  });

  test('anotar una cuenta sin factura funciona (antes devolvía la fila con Prisma y fallaba igual)', async () => {
    const r = await servicio.actualizarCuenta(cuentaCredito.id, { notas: 'pagar el viernes' });

    assert.equal(r.notas, 'pagar el viernes');
    assert.equal(r.facturaId, null);
    assert.equal(typeof r.diasRestantes, 'number');
    const { data } = await servicio.listarCuentas({ proveedor: CEDULA });
    assert.equal(data.find(c => c.id === cuentaCredito.id).notas, 'pagar el viernes');
  });

  test('anotar una cuenta que no existe responde 404, no 500', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'no-es-un-uuid']) {
      await assert.rejects(() => servicio.actualizarCuenta(id, { notas: 'x' }), (e) => e.status === 404);
    }
  });

  test('el saldo y el estado siguen sin poder editarse a mano', async () => {
    await assert.rejects(() => servicio.actualizarCuenta(cuentaCredito.id, { saldoPendiente: 1 }), (e) => e.status === 400);
  });
});

describe('la lectura de cuentas por pagar no vuelve a depender de Prisma', () => {
  const leer = (...p) => fs.readFileSync(path.join(BACK, ...p), 'utf8');

  test('el servicio de Pagos a Proveedores no usa el cliente de Prisma', () => {
    const fuente = leer('services', 'pagosProveedoresService.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(fuente, /lib\/prisma|this\.prisma|prisma\./);
  });

  test('ninguna lectura de cuentas_por_pagar pasa por Prisma: una fila con factura NULL la rompería', () => {
    const leidos = [];
    const recorrer = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (/\.js$/.test(e.name) && /\.cuentaPorPagar\.(findMany|findFirst|findUnique|update|updateMany)\b/.test(fs.readFileSync(ruta, 'utf8'))) {
          leidos.push(path.relative(BACK, ruta));
        }
      }
    };
    for (const d of ['src', 'services', 'routes', 'lib']) if (fs.existsSync(path.join(BACK, d))) recorrer(path.join(BACK, d));

    assert.deepEqual(leidos, [], 'Prisma declara `facturaId` obligatorio y la factura a mano no tiene: usá `pg`');
  });
});
