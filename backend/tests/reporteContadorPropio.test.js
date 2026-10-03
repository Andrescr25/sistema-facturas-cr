const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * El Reporte del Contador leyendo las tablas PROPIAS (sección 13 del
 * checklist): `factura`, `nota_credito` y `compra`, en vez de `/invoices`,
 * `/credit-notes` y `/bills` de Alegra.
 *
 * Tres partes:
 *  1. Las reglas puras: cómo se arma una línea y cómo se despeja la tarifa de
 *     una compra, que es lo que Alegra traía mal.
 *  2. Contra PostgreSQL local, dentro de una transacción que se deshace: qué
 *     documentos entran al mes y cuáles no.
 *  3. Un barrido: el módulo ya no conoce a Alegra.
 */

const RAIZ = path.join(__dirname, '..');
const { lineaDeVenta, tarifaDeCompra, rangoDelMes } = require('../src/modules/reporte-contador/desdeElSistema');

const TARIFAS = [
  { tarifa: 0.5, tipo: 'reducido' }, { tarifa: 1, tipo: 'reducido' }, { tarifa: 2, tipo: 'reducido' },
  { tarifa: 4, tipo: 'reducido' }, { tarifa: 8, tipo: 'transitorio' }, { tarifa: 13, tipo: 'general' }
];

describe('una línea de venta propia, en el formato del reporte', () => {
  const fila = (o = {}) => ({
    numero: '001000014869', fecha: '2026-08-31', electronica: false, contraparte: 'KEPESCA',
    concepto: 'VASO # 14', cantidad: '3.0000', precio_unitario: '2243.15044', descuento_monto: '0.00',
    tarifa: '13.000', impuesto_monto: '874.83', impuesto_tipo: 'general', ...o
  });

  test('base e impuesto se redondean por línea, y el impuesto es el del documento', () => {
    const l = lineaDeVenta(fila(), 'Factura');
    assert.equal(l.baseGravable, 6729);          // 3 × 2243,15044 = 6729,45
    // 6729,45 × 13 % = 874,83: sale del documento, no de volver a multiplicar.
    assert.equal(l.impuesto, 875);
    assert.equal(l.tarifa, '13%');
    assert.equal(l.tipoTarifa, 'GENERAL');
    assert.equal(l.nombreImpuesto, 'IVA');
    assert.equal(l.acreditable, 'Sí');
    assert.equal(l.esEmitida, false);
    assert.equal(l.tipoDocumento, 'Factura');
  });

  test('si el documento cobró un colón distinto de base × tarifa, vale el documento', () => {
    // Una factura de un pedido del portal separa base e IVA del precio final:
    // 2 × ₡37.800 → IVA 8.697,35, no 8.697,34.
    const l = lineaDeVenta(fila({ cantidad: '2', precio_unitario: '33451.32743', impuesto_monto: '8697.35' }), 'Factura');
    assert.equal(l.baseGravable, 66903);
    assert.equal(l.impuesto, 8697);
  });

  test('el descuento baja la base y queda escrito aparte', () => {
    const l = lineaDeVenta(fila({ cantidad: '1', precio_unitario: '3000', descuento_monto: '300', impuesto_monto: '351' }), 'Factura');
    assert.equal(l.precioTotal, 3000);
    assert.equal(l.descuento, 300);
    assert.equal(l.baseGravable, 2700);
    assert.equal(l.impuesto, 351);
  });

  test('cada tipo de impuesto propio tiene su tipo de tarifa y su nombre', () => {
    const de = (impuesto_tipo, tarifa) => lineaDeVenta(fila({ impuesto_tipo, tarifa }), 'Factura');
    assert.deepEqual([de('reducido', '1').tipoTarifa, de('reducido', '1').nombreImpuesto, de('reducido', '1').tarifa], ['REDUCED', 'IVA reducido', '1%']);
    assert.deepEqual([de('exento', '0').tipoTarifa, de('exento', '0').nombreImpuesto, de('exento', '0').tarifa], ['EXEMPT', 'IVA exento', '0%']);
    assert.deepEqual([de('transitorio', '8').tipoTarifa, de('transitorio', '8').nombreImpuesto], ['TRANSIENT', 'IVA transitorio']);
    assert.equal(de('reducido', '0.500').tarifa, '0.5%');
    // La tarifa 0 % SIN derecho a crédito es la única que no es acreditable.
    assert.equal(de('sin_credito', '0').acreditable, 'No');
    assert.equal(de('exento', '0').acreditable, 'Sí');
  });

  test('la electrónica se lee de la factura, no del largo del número', () => {
    assert.equal(lineaDeVenta(fila({ electronica: true }), 'Factura').esEmitida, true);
    assert.equal(lineaDeVenta(fila({ numero: '00100001010000002463', electronica: false }), 'Factura').esEmitida, false);
  });
});

describe('la tarifa de una compra se despeja de la factura del proveedor', () => {
  const de = (bruto, descuento, impuesto) => tarifaDeCompra({ bruto, descuento, impuesto }, TARIFAS);

  test('cada tarifa legal sale de sus montos', () => {
    assert.deepEqual(de(6353, 0, 63.53), { tarifa: 1, tipoTarifa: 'REDUCED', exacta: true });
    assert.deepEqual(de(22737, 0, 454.74), { tarifa: 2, tipoTarifa: 'REDUCED', exacta: true });
    assert.deepEqual(de(10000, 0, 1300), { tarifa: 13, tipoTarifa: 'GENERAL', exacta: true });
    assert.deepEqual(de(10000, 0, 800), { tarifa: 8, tipoTarifa: 'TRANSIENT', exacta: true });
    assert.deepEqual(de(10000, 0, 400), { tarifa: 4, tipoTarifa: 'REDUCED', exacta: true });
  });

  test('el 0,5 % y el 1 % no se confunden', () => {
    assert.equal(de(20000, 0, 100).tarifa, 0.5);
    assert.equal(de(20000, 0, 200).tarifa, 1);
  });

  test('el descuento baja la base antes de despejar', () => {
    assert.equal(de(1000, 200, 104).tarifa, 13);   // 104 / 800
  });

  test('una bonificación paga impuesto sobre el precio sin descontar', () => {
    // 2 × ₡991 regalados (descuento del 100 %) y ₡257,66 de IVA: es 13 %.
    assert.deepEqual(de(1982, 1982, 257.66), { tarifa: 13, tipoTarifa: 'GENERAL', exacta: true });
  });

  test('el redondeo al céntimo en una línea chica no la saca de su tarifa', () => {
    assert.equal(de(1300, 0, 172.5).tarifa, 13);   // 13,27 %
    assert.equal(de(1, 0, 0.13).tarifa, 13);
  });

  test('lo que no es ninguna tarifa legal no se disfraza de una', () => {
    const r = de(30508, 0, 2977.58);               // 9,76 %: IVA con otro cargo adentro
    assert.equal(r.exacta, false);
    assert.equal(r.tarifa, 9.76);
    assert.equal(r.tipoTarifa, '');
  });
});

describe('el mes', () => {
  test('va del día 1 al último, sin pasar por una fecha con zona horaria', () => {
    assert.deepEqual(rangoDelMes(2026, 8), ['2026-08-01', '2026-08-31']);
    assert.deepEqual(rangoDelMes(2026, 2), ['2026-02-01', '2026-02-28']);
    assert.deepEqual(rangoDelMes(2024, 2), ['2024-02-01', '2024-02-29']);
    assert.deepEqual(rangoDelMes(2026, 12), ['2026-12-01', '2026-12-31']);
  });
});

// ---------------------------------------------------------------------------
// Contra la base local. Marzo de 2031 no tiene nada: todo lo que aparezca en
// ese mes lo puso esta prueba, y se va con el ROLLBACK.
// ---------------------------------------------------------------------------
describe('traer el mes del sistema — contra PostgreSQL local', () => {
  let pool, conexion, servicio;
  const ANIO = 2031, MES = 3;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');

    const dobles = [
      ['../config/database', { query: (sql, params) => conexion.query(sql, params) }],
      ['../lib/prisma', {}],
      ['../services/mailer', { enviarCorreo: async () => {}, estaConfigurado: () => false }]
    ];
    for (const [nombre, exports] of dobles) {
      const ruta = require.resolve(nombre);
      require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports };
    }
    for (const m of ['desdeElSistema', 'reporte-contador.service']) {
      delete require.cache[require.resolve(`../src/modules/reporte-contador/${m}`)];
    }
    servicio = require('../src/modules/reporte-contador/reporte-contador.service');

    const impuesto = async (tarifa, tipo) => (await conexion.query(
      'SELECT id FROM impuesto WHERE tarifa = $1 AND tipo = $2 AND activo ORDER BY id LIMIT 1', [tarifa, tipo])).rows[0].id;
    const iva13 = await impuesto(13, 'general');
    const iva1 = await impuesto(1, 'reducido');
    const exento = await impuesto(0, 'exento');

    const factura = async ({ numero, estado = 'emitida', electronica = false, fecha = '2031-03-10', lineas }) => {
      const { rows: [f] } = await conexion.query(`
        INSERT INTO factura (numero, estado, electronica, hacienda_estado, fecha, cliente_nombre, tipo_documento)
        VALUES ($1, $2, $3, $4, $5, 'zz-cliente del contador', 'factura') RETURNING id`,
        [numero, estado, electronica, electronica ? 'aceptada' : null, fecha]);
      let n = 0;
      for (const l of lineas) {
        await conexion.query(`
          INSERT INTO factura_linea (factura_id, numero_linea, nombre, cantidad, precio_unitario,
                                     descuento_monto, impuesto_id, tarifa, impuesto_monto, total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [f.id, ++n, l.nombre, l.cantidad, l.precio, l.descuento || 0, l.impuestoId, l.tarifa, l.impuesto,
            l.cantidad * l.precio - (l.descuento || 0) + l.impuesto]);
      }
      return f.id;
    };

    // Entran: dos emitidas (una electrónica). Una línea exenta entra; la que no
    // tiene impuesto asignado, no.
    await factura({ numero: 'zz-000000000001', lineas: [
      { nombre: 'zz-general', cantidad: 2, precio: 1000, impuestoId: iva13, tarifa: 13, impuesto: 260 },
      { nombre: 'zz-reducido', cantidad: 1, precio: 500, descuento: 100, impuestoId: iva1, tarifa: 1, impuesto: 4 },
      { nombre: 'zz-exento', cantidad: 1, precio: 300, impuestoId: exento, tarifa: 0, impuesto: 0 },
      { nombre: 'zz-sin impuesto', cantidad: 1, precio: 9999, impuestoId: null, tarifa: 0, impuesto: 0 }
    ] });
    await factura({ numero: 'zz-00000000000000000002', electronica: true, lineas: [
      { nombre: 'zz-electrónica', cantidad: 1, precio: 4000, impuestoId: iva13, tarifa: 13, impuesto: 520 }
    ] });
    // NO entran: anulada, borrador y la del mes siguiente.
    await factura({ numero: 'zz-000000000003', estado: 'anulada', lineas: [
      { nombre: 'zz-anulada', cantidad: 1, precio: 7777, impuestoId: iva13, tarifa: 13, impuesto: 1011 }] });
    await factura({ numero: 'zz-000000000004', estado: 'borrador', lineas: [
      { nombre: 'zz-borrador', cantidad: 1, precio: 8888, impuestoId: iva13, tarifa: 13, impuesto: 1155 }] });
    await factura({ numero: 'zz-000000000005', fecha: '2031-04-01', lineas: [
      { nombre: 'zz-abril', cantidad: 1, precio: 6666, impuestoId: iva13, tarifa: 13, impuesto: 867 }] });

    // Una nota de crédito emitida (va aparte) y una anulada (no va).
    const nota = async (numero, estado) => {
      const { rows: [n] } = await conexion.query(`
        INSERT INTO nota_credito (numero, estado, electronica, fecha, cliente_nombre)
        VALUES ($1, $2, FALSE, '2031-03-15', 'zz-cliente del contador') RETURNING id`, [numero, estado]);
      await conexion.query(`
        INSERT INTO nota_credito_linea (nota_credito_id, numero_linea, nombre, cantidad, precio_unitario,
                                        descuento_monto, impuesto_id, tarifa, impuesto_monto, total)
        VALUES ($1, 1, 'zz-devuelto', 1, 1000, 0, $2, 13, 130, 1130)`, [n.id, iva13]);
      await conexion.query(`
        INSERT INTO nota_credito_factura (nota_credito_id, factura_numero, monto)
        VALUES ($1, 'zz-000000000001', 1130)`, [n.id]);
    };
    await nota('zz-nc-0001', 'emitida');
    await nota('zz-nc-0002', 'anulada');

    // Compras: una registrada con todas las clases de línea, y una anulada.
    const { rows: [prov] } = await conexion.query(`INSERT INTO proveedor (nombre) VALUES ('zz-proveedor del contador') RETURNING id`);
    const compra = async (numero, estado, lineas) => {
      const { rows: [c] } = await conexion.query(`
        INSERT INTO compra (proveedor_id, numero_consecutivo, fecha_emision, total, estado)
        VALUES ($1, $2, '2031-03-20', 0, $3) RETURNING id`, [prov.id, numero, estado]);
      let n = 0;
      for (const l of lineas) {
        await conexion.query(`
          INSERT INTO compra_linea (compra_id, numero_linea, descripcion, cantidad, precio_unitario, descuento, impuesto, total_linea)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [c.id, ++n, l.d, l.cantidad, l.precio, l.descuento || 0, l.impuesto, l.cantidad * l.precio - (l.descuento || 0) + l.impuesto]);
      }
    };
    await compra('00100001010000999001', 'registrada', [
      { d: 'zz-compra al 13', cantidad: 10, precio: 1000, impuesto: 1300 },
      { d: 'zz-compra al 1', cantidad: 1, precio: 6353, impuesto: 63.53 },
      { d: 'zz-combustible sin IVA', cantidad: 1, precio: 20000, impuesto: 0 },
      { d: 'zz-bonificación', cantidad: 2, precio: 991, descuento: 1982, impuesto: 257.66 }
    ]);
    await compra('00100001010000999002', 'anulada', [
      { d: 'zz-compra anulada', cantidad: 1, precio: 5555, impuesto: 722.15 }]);
  });

  after(async () => {
    if (conexion) { await conexion.query('ROLLBACK'); conexion.release(); }
    if (pool) await pool.end();
  });

  test('ventas: entran las emitidas, con sus líneas con impuesto; las notas de crédito, aparte', async () => {
    const r = await servicio.importarDelSistema({ anio: ANIO, mes: MES, tipo: 'ventas' });

    // 3 líneas de la primera + 1 de la electrónica + 1 de la nota de crédito.
    assert.equal(r.lineasCargadas, 5);
    // 2000 + 400 + 300 + 4000: ni la anulada, ni el borrador, ni abril, ni la
    // línea sin impuesto, ni la nota de crédito.
    assert.equal(Number(r.baseGravableOriginal), 6700);
    assert.equal(Number(r.impuestoOriginal), 784);
    assert.equal(Number(r.baseDevolucionesOriginal), 1000);
    assert.equal(Number(r.impuestoDevolucionesOriginal), 130);

    const { rows } = await conexion.query(`
      SELECT tipo_documento, numero, documento_asociado, es_emitida, concepto, tarifa, tipo_tarifa,
             base_gravable::int AS base, impuesto::int AS impuesto, fecha::text AS fecha, contraparte
        FROM reporte_contador_linea WHERE periodo_id = $1 ORDER BY orden`, [r.periodoId]);

    // Por fecha y número de documento; las notas de crédito, al final.
    assert.deepEqual(rows.map(l => l.concepto),
      ['zz-electrónica', 'zz-general', 'zz-reducido', 'zz-exento', 'zz-devuelto']);
    assert.deepEqual(rows.map(l => l.tarifa), ['13%', '13%', '1%', '0%', '13%']);
    assert.deepEqual(rows.map(l => l.es_emitida), [true, false, false, false, false]);
    assert.ok(rows.every(l => l.contraparte === 'zz-cliente del contador'));
    // El día no se corre: se guarda el que dice la factura.
    assert.deepEqual([...new Set(rows.slice(0, 4).map(l => l.fecha))], ['2031-03-10']);

    const nc = rows[4];
    assert.equal(nc.tipo_documento, 'Nota de crédito');
    assert.equal(nc.documento_asociado, 'zz-000000000001');
    assert.equal(nc.base, 1000);
  });

  test('compras: la tarifa sale de los montos del proveedor; sin impuesto y anuladas no entran', async () => {
    const r = await servicio.importarDelSistema({ anio: ANIO, mes: MES, tipo: 'compras' });
    assert.equal(r.lineasCargadas, 3);

    const { rows } = await conexion.query(`
      SELECT tipo_documento, numero, es_emitida, contraparte, concepto, tarifa, tipo_tarifa, nombre_impuesto,
             base_gravable::int AS base, impuesto::int AS impuesto
        FROM reporte_contador_linea WHERE periodo_id = $1 ORDER BY orden`, [r.periodoId]);

    assert.deepEqual(rows.map(l => [l.concepto, l.tarifa, l.tipo_tarifa, l.base, l.impuesto]), [
      ['zz-compra al 13', '13%', 'GENERAL', 10000, 1300],
      ['zz-compra al 1', '1%', 'REDUCED', 6353, 64],
      // Regalada: base cero, y el IVA que igual se pagó.
      ['zz-bonificación', '13%', 'GENERAL', 0, 258]
    ]);
    assert.ok(rows.every(l => l.tipo_documento === 'Factura de proveedor' && l.es_emitida === true));
    assert.ok(rows.every(l => l.contraparte === 'zz-proveedor del contador'));
    assert.equal(Number(r.baseGravableOriginal), 16353);
    assert.equal(Number(r.impuestoOriginal), 1622);
  });

  test('una compra propia con dos renglones iguales no se toma por duplicada, ni al traerla ni al repasarla', async () => {
    // El detector de compras nació para Alegra, donde la misma compra quedaba
    // registrada dos veces. Acá `compra` es única por la clave de Hacienda: lo
    // único que encontraría es al proveedor que facturó lo mismo en dos líneas.
    const { rows: [prov] } = await conexion.query(`SELECT id FROM proveedor WHERE nombre = 'zz-proveedor del contador'`);
    const { rows: [c] } = await conexion.query(`
      INSERT INTO compra (proveedor_id, numero_consecutivo, fecha_emision, total, estado)
      VALUES ($1, '00100001010000999003', '2031-03-21', 0, 'registrada') RETURNING id`, [prov.id]);
    for (const n of [1, 2]) {
      await conexion.query(`
        INSERT INTO compra_linea (compra_id, numero_linea, descripcion, cantidad, precio_unitario, descuento, impuesto, total_linea)
        VALUES ($1, $2, 'zz-tornillo repetido', 6, 819, 0, 638.82, 5552.82)`, [c.id, n]);
    }

    const r = await servicio.importarDelSistema({ anio: ANIO, mes: MES, tipo: 'compras' });
    assert.equal(r.altaConfianza, 0);
    const contar = async () => (await conexion.query(`
      SELECT COUNT(*)::int AS lineas, COUNT(*) FILTER (WHERE excluido)::int AS excluidas
        FROM reporte_contador_linea WHERE periodo_id = $1 AND concepto = 'zz-tornillo repetido'`, [r.periodoId])).rows[0];
    assert.deepEqual(await contar(), { lineas: 2, excluidas: 0 });

    const repaso = await servicio.redetectarDuplicados(r.periodoId);
    assert.equal(repaso.altaConfianza, 0);
    assert.deepEqual(await contar(), { lineas: 2, excluidas: 0 });
  });

  test('volver a traer el mes reemplaza el período, no lo duplica', async () => {
    await servicio.importarDelSistema({ anio: ANIO, mes: MES, tipo: 'compras' });
    await servicio.importarDelSistema({ anio: ANIO, mes: MES, tipo: 'compras' });
    const { rows } = await conexion.query(
      `SELECT COUNT(*)::int n FROM reporte_contador_periodo WHERE anio = $1 AND mes = $2 AND tipo = 'compras'`, [ANIO, MES]);
    assert.equal(rows[0].n, 1);
  });

  test('un mes sin nada lo dice, en vez de guardar un período vacío', async () => {
    await assert.rejects(() => servicio.importarDelSistema({ anio: 2032, mes: 1, tipo: 'ventas' }),
      e => e.status === 404 && /No hay ventas/.test(e.message));
    await assert.rejects(() => servicio.importarDelSistema({ anio: ANIO, mes: 13, tipo: 'ventas' }), e => e.status === 400);
    await assert.rejects(() => servicio.importarDelSistema({ anio: ANIO, mes: MES, tipo: 'gastos' }), e => e.status === 400);
  });
});

describe('el Reporte del Contador ya no conoce a Alegra', () => {
  const leer = (...partes) => fs.readFileSync(path.join(RAIZ, ...partes), 'utf8');

  test('ningún archivo del módulo importa la integración ni llama a su API', () => {
    const carpeta = path.join(RAIZ, 'src', 'modules', 'reporte-contador');
    for (const archivo of fs.readdirSync(carpeta).filter(f => f.endsWith('.js'))) {
      const fuente = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
      assert.doesNotMatch(fuente, /integrations\/alegra/, `${archivo} importa la integración de Alegra`);
      assert.doesNotMatch(fuente, /getAlegraClient|alegra\.client/, `${archivo} usa el cliente de Alegra`);
      // Una llamada de verdad, no la mención en un comentario.
      assert.doesNotMatch(fuente, /\b(get|post|put|delete|traerPaginado)\(\s*['"`]\/(invoices|credit-notes|bills|items|contacts)/,
        `${archivo} llama a la API de Alegra`);
    }
  });

  test('la pantalla pide el mes al sistema, por la ruta nueva', () => {
    assert.match(leer('src', 'modules', 'reporte-contador', 'reporte-contador.routes.js'), /\/periodos\/importar-sistema/);
    const frente = path.join(RAIZ, '..', 'frontend', 'src');
    const archivos = ['services/reporteContadorService.js', 'hooks/useReporteContador.js',
      'pages/ReporteContador.jsx', 'components/reporte-contador/TarjetaPeriodo.jsx'];
    for (const a of archivos) {
      const fuente = fs.readFileSync(path.join(frente, a), 'utf8');
      assert.doesNotMatch(fuente, /importar-alegra|importarDesdeAlegra|Traer de Alegra/, `${a} sigue pidiéndole el mes a Alegra`);
    }
    assert.match(fs.readFileSync(path.join(frente, 'services/reporteContadorService.js'), 'utf8'), /\/periodos\/importar-sistema/);
  });
});
