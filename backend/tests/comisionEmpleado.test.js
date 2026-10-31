/**
 * Comisión, gasolina y el total de la quincena (E3 de la planilla, 2026-10-30).
 *
 * El usuario: «2 % de ventas netas», «sin IVA, menos devoluciones», por mes;
 * ₡5.000 de gasolina «por cada día trabajado»; se paga por quincena y la
 * comisión entra en la 2.ª. Todo en el mes ANTERIOR al de hoy, para que la
 * prueba no dependa del día en que corre. Contra PostgreSQL local, en una
 * transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const liquidacion = require('../src/modules/empleados/liquidacion');
const { sinComentarios } = require('./dobles/sinComentarios');

describe('la comisión y la gasolina, sin base', () => {
  test('el mes de una quincena, también febrero', () => {
    assert.deepEqual(liquidacion.mesDe(liquidacion.quincenaDe('2027-02-20')),
      { mes: '2027-02', desde: '2027-02-01', hasta: '2027-02-28', nombre: 'febrero 2027' });
  });

  test('2 % a céntimos; si las devoluciones pasan las ventas, 0', () => {
    assert.equal(liquidacion.comisionDe(12345.67, 2), 246.91);
    assert.equal(liquidacion.comisionDe(-1000, 2), 0);
    assert.equal(liquidacion.comisionDe(1000, 0), 0);
  });

  test('gasolina por día con alguna jornada que no se anuló', () => {
    const dia = (fecha, ...estados) => ({ fecha, tramos: estados.map(estado => ({ estado })) });
    assert.deepEqual(liquidacion.diasConGasolina([dia('2026-10-01', 'cerrada'), dia('2026-10-02', 'anulada'), dia('2026-10-03', 'anulada', 'sin_salida')]),
      ['2026-10-01', '2026-10-03']);
  });
});

describe('ventas netas, comisión y total — contra PostgreSQL local', () => {
  let db, empleados, jornadas, facturas, notas, admin, agente, otro, agente2, cliente, producto, mes, mesAntes;
  const dia = (n, m = mes) => `${m}-${String(n).padStart(2, '0')}`;
  // 1.000 sin IVA (1.130 con IVA) por factura.
  const vender = (usuario, fecha) => facturas.crearFactura({
    clienteId: cliente, clienteNombre: 'ZZ Cliente comisión', fecha,
    items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }]
  }, usuario);
  const devolver = async (factura, fecha, cantidad = null) => {
    const n = await notas.crearNotaCredito({ facturaId: factura.id, motivo: 'devolucion', motivoTexto: 'ZZ devolución',
      ...(cantidad ? { lineas: [{ numeroLinea: 1, cantidad }] } : {}) }, admin);
    await db.query('UPDATE nota_credito SET fecha = $2 WHERE id = $1', [n.id, fecha]);
    return n;
  };
  const quincena = async (usuario, clave) => (await empleados.ingresosDe(usuario, clave)).quincena;

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query("SET TIME ZONE 'America/Costa_Rica'");
    await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'comision') };
    empleados = require('../src/modules/empleados/empleados.service');
    jornadas = require('../src/modules/empleados/jornada.service');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    notas = require('../src/modules/facturacion/notaCredito.service');
    const fechas = require('../src/utils/fechaCR');
    const hoy = fechas.hoyEnCostaRica();
    mes = fechas.sumarDias(`${hoy.slice(0, 7)}-01`, -1).slice(0, 7);
    mesAntes = fechas.sumarDias(`${mes}-01`, -1).slice(0, 7);

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const usuario = async (u) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $1, 'zz', TRUE, FALSE) RETURNING id`, [u])).rows[0].id;
    agente = await usuario('zz-agente-comision');
    otro = await usuario('zz-otro-comision');
    agente2 = await usuario('zz-agente-devoluciones');
    cliente = (await db.query(`INSERT INTO cliente (nombre, activo) VALUES ('ZZ Cliente comisión', TRUE) RETURNING id`)).rows[0].id;
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-COMISION', 'ZZ-COMISION', 1000, 700, $1) RETURNING id`, [impuesto.id])).rows[0].id;
    for (const u of [agente, agente2]) await empleados.crear({ usuarioId: u, pagoHora: 1200 }, admin);
    await db.query(`UPDATE empleado SET desde = $2 WHERE usuario_id = $1`, [agente, dia(3)]);
    await db.query(`UPDATE empleado SET desde = $2 WHERE usuario_id = $1`, [agente2, dia(1, mesAntes)]);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('ventas sin IVA de lo que facturó él, emitido y desde su ficha', async () => {
    await vender(agente, dia(2));                     // antes de su ficha: no
    const f1 = await vender(agente, dia(5));
    await vender(agente, dia(20));
    await vender(otro, dia(6));                       // de otro: no
    const anulada = await vender(agente, dia(7));
    await db.query(`UPDATE factura SET estado = 'anulada' WHERE id = $1`, [anulada.id]);
    const { comision } = await quincena(agente, `${mes}-Q2`);
    assert.deepEqual({ ventas: comision.ventas, facturas: comision.facturas, devoluciones: comision.devoluciones }, { ventas: 2000, facturas: 2, devoluciones: 0 });
    assert.equal(comision.monto, 40);
    await devolver(f1, dia(25), 0.5);
  });

  test('una devolución parcial resta sin IVA en el mes de la nota', async () => {
    const { comision } = await quincena(agente, `${mes}-Q2`);
    assert.deepEqual({ devoluciones: comision.devoluciones, notas: comision.notas, netas: comision.netas, monto: comision.monto },
      { devoluciones: 500, notas: 1, netas: 1500, monto: 30 });
  });

  test('una nota repartida entre dos facturas resta lo que le toca a cada una', async () => {
    const { rows: [f2] } = await db.query(`SELECT id FROM factura WHERE creado_por = $1 AND fecha = $2`, [agente, dia(20)]);
    const { rows: [nf] } = await db.query(`SELECT nf.id, nf.nota_credito_id FROM nota_credito_factura nf JOIN factura f ON f.id = nf.factura_id WHERE f.creado_por = $1`, [agente]);
    // La nota de 565 (500 sin IVA): 452 a una factura y 113 a la otra.
    await db.query('UPDATE nota_credito_factura SET monto = 452 WHERE id = $1', [nf.id]);
    await db.query('INSERT INTO nota_credito_factura (nota_credito_id, factura_id, monto) VALUES ($1, $2, 113)', [nf.nota_credito_id, f2.id]);
    const { comision } = await quincena(agente, `${mes}-Q2`);
    assert.equal(comision.devoluciones, 500);
    assert.equal(comision.notas, 1);
  });

  test('la nota anulada no resta', async () => {
    await db.query(`UPDATE nota_credito SET estado = 'anulada' WHERE creado_por = $1 AND id IN (SELECT nota_credito_id FROM nota_credito_factura nf JOIN factura f ON f.id = nf.factura_id WHERE f.creado_por = $2)`, [admin, agente]);
    assert.equal((await quincena(agente, `${mes}-Q2`)).comision.devoluciones, 0);
    await db.query(`UPDATE nota_credito SET estado = 'emitida' WHERE creado_por = $1 AND id IN (SELECT nota_credito_id FROM nota_credito_factura nf JOIN factura f ON f.id = nf.factura_id WHERE f.creado_por = $2)`, [admin, agente]);
  });

  test('si en un mes devuelven más de lo que vendió, la comisión es 0 y no toca el mes anterior', async () => {
    const f = await vender(agente2, dia(10, mesAntes));
    await devolver(f, dia(4));
    const antes = (await quincena(agente2, `${mesAntes}-Q2`)).comision;
    assert.deepEqual([antes.netas, antes.monto], [1000, 20]);
    const ahora = (await quincena(agente2, `${mes}-Q2`)).comision;
    assert.deepEqual([ahora.ventas, ahora.devoluciones, ahora.netas, ahora.monto], [0, 1000, -1000, 0]);
  });

  test('la comisión se ve en la 1.ª quincena pero se suma al total en la 2.ª, con horas, clientes y gasolina', async () => {
    await jornadas.agregar(agente, { inicio: `${dia(5)}T08:00`, fin: `${dia(5)}T12:00`, motivo: 'ZZ prueba' }, admin);
    await jornadas.agregar(agente, { inicio: `${dia(18)}T08:00`, fin: `${dia(18)}T10:30`, motivo: 'ZZ prueba' }, admin);
    await jornadas.agregar(agente, { inicio: `${dia(18)}T13:00`, fin: `${dia(18)}T15:00`, motivo: 'ZZ prueba' }, admin);
    const nula = await jornadas.agregar(agente, { inicio: `${dia(19)}T08:00`, fin: `${dia(19)}T09:00`, motivo: 'ZZ prueba' }, admin);
    await jornadas.corregir(nula.id, { anular: true, motivo: 'ZZ no trabajó' }, admin);

    const q1 = await quincena(agente, `${mes}-Q1`);
    assert.equal(q1.comision.enEstaQuincena, false);
    assert.equal(q1.comision.monto, 30, 'se ve cómo va');
    assert.deepEqual([q1.porHoras, q1.gasolina.monto, q1.total], [4800, 5000, 9800], '4 h × 1.200 + 1 día de gasolina, sin comisión');

    const q2 = await quincena(agente, `${mes}-Q2`);
    assert.equal(q2.comision.enEstaQuincena, true);
    assert.deepEqual(q2.gasolina.dias.map(d => d.fecha), [dia(18)], 'el día anulado no lleva gasolina');
    assert.deepEqual([q2.porHoras, q2.gasolina.monto, q2.comision.monto, q2.total], [5400, 5000, 30, 10430]);
  });

  test('la lista de Empleados trae el total de la quincena en curso', async () => {
    const a = (await empleados.listar()).find(e => e.usuarioId === agente);
    assert.equal(typeof a.quincena.total, 'number');
    assert.ok('comision' in a.quincena && 'gasolina' in a.quincena);
  });
});

describe('la pantalla', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('la comisión es la misma para el empleado y para Empleados; cada uno con su resumen', () => {
    for (const archivo of [['pages', 'MisIngresos.jsx'], ['components', 'empleados', 'DetalleEmpleado.jsx']]) {
      assert.match(leer(...archivo), /<ComisionDelMes comision=\{q\.comision\} \/>/, archivo.join('/'));
    }
    assert.match(leer('pages', 'MisIngresos.jsx'), /<TotalQuincena quincena=\{q\} deuda=\{d\.deuda\}/);
    assert.match(leer('components', 'empleados', 'DetalleEmpleado.jsx'), /<ResumenQuincena quincena=\{q\}/);
  });

  test('«Mis ingresos»: arriba la jornada y el total; cada tarjeta abre su detalle, que va en la dirección', () => {
    const m = leer('pages', 'MisIngresos.jsx');
    assert.match(m, /const SECCIONES = \['dias', 'clientes', 'comision', 'pagos'\]/);
    assert.match(m, /setParametros\(seccion \? \{ ver: seccion \} : \{\}\)/);
    for (const s of ['dias', 'clientes', 'comision', 'pagos']) assert.match(m, new RegExp(`onClick=\\{\\(\\) => abrir\\('${s}'\\)\\}`), s);
    assert.match(m, /onClick=\{\(\) => abrir\(null\)\}>Mis ingresos<\/Boton>/);
  });

  test('en la 1.ª quincena la comisión se muestra aparte y dice cuándo se paga', () => {
    const c = leer('components', 'ingresos', 'ComisionDelMes.jsx');
    assert.match(c, /Se paga con la 2\.ª quincena de \$\{comision\.nombre\}/);
  });
});
