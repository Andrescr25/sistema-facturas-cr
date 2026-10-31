/**
 * Pagos a un empleado y «el total que le debo» (E4 de la planilla, 2026-10-30;
 * migración 074).
 *
 * El usuario: se paga por quincena, «como salida de caja», y la gasolina
 * «que ahí le salga si ya se lo pagué o no». Todo en el mes ANTERIOR al de hoy
 * (quincenas ya terminadas), para que la prueba no dependa del día. Contra
 * PostgreSQL local (con 072–074 aplicadas), en una transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

describe('pagos a un empleado — contra PostgreSQL local', () => {
  let db, empleados, jornadas, facturas, caja, modulos, admin, agente, cliente, producto, efectivo, sinpe, mes, hoy;
  const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`;
  const quincena = async (n) => (await empleados.ingresosDe(agente, `${mes}-Q${n}`)).quincena;
  const tramo = (d, desde, hasta) => jornadas.agregar(agente, { inicio: `${dia(d)}T${desde}`, fin: `${dia(d)}T${hasta}`, motivo: 'ZZ prueba' }, admin);

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
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'pagosempleado') };
    empleados = require('../src/modules/empleados/empleados.service');
    jornadas = require('../src/modules/empleados/jornada.service');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    caja = require('../src/modules/cuentas-por-cobrar/cierreCaja.service');
    modulos = require('../src/modules/usuarios/modulos');
    const fechas = require('../src/utils/fechaCR');
    hoy = fechas.hoyEnCostaRica();
    mes = fechas.sumarDias(`${hoy.slice(0, 7)}-01`, -1).slice(0, 7);

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    agente = (await db.query(`INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ('zz-agente-pagos', 'ZZ Agente pagos', 'zz', TRUE, FALSE) RETURNING id`)).rows[0].id;
    cliente = (await db.query(`INSERT INTO cliente (nombre, activo) VALUES ('ZZ Cliente pagos', TRUE) RETURNING id`)).rows[0].id;
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-PAGOS', 'ZZ-PAGOS', 1000, 700, $1) RETURNING id`, [impuesto.id])).rows[0].id;
    efectivo = (await db.query(`SELECT id FROM metodo_pago WHERE clave = 'efectivo'`)).rows[0].id;
    sinpe = (await db.query(`SELECT id FROM metodo_pago WHERE clave = 'sinpe_movil'`)).rows[0].id;
    await empleados.crear({ usuarioId: agente, pagoHora: 1200 }, admin);
    await db.query('UPDATE empleado SET desde = $2 WHERE usuario_id = $1', [agente, dia(1)]);
    await tramo(3, '08:00', '12:00');
    await tramo(5, '08:00', '10:00');
    await tramo(18, '08:00', '11:00');
    await facturas.crearFactura({ clienteId: cliente, clienteNombre: 'ZZ Cliente pagos', fecha: dia(4),
      items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }] }, agente);
    // Un día limpio en caja: lo que ya tenga la copia hoy no estorba.
    await db.query(`DELETE FROM cierre_caja WHERE fecha = $1`, [hoy]);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('la gasolina se paga por día: sale de caja y el día queda pagado', async () => {
    const p = await empleados.pagarGasolina(agente, { fechas: [dia(3)], metodoPagoId: efectivo }, admin);
    assert.deepEqual([p.concepto, p.monto], ['gasolina', 5000]);
    const q1 = await quincena(1);
    assert.deepEqual(q1.gasolina.dias.map(d => [d.fecha, d.pagada]), [[dia(3), true], [dia(5), false]]);
    const { rows: [m] } = await db.query(`SELECT sentido, monto, contraparte, metodo_clave, facturas, anulado FROM movimiento_caja WHERE tipo = 'pago_empleado' AND documento_id = $1`, [p.id]);
    assert.deepEqual({ ...m, monto: Number(m.monto) }, { sentido: 'salida', monto: 5000, contraparte: 'ZZ Agente pagos', metodo_clave: 'efectivo', facturas: 'Gasolina', anulado: false });
  });

  test('un día de gasolina no se paga dos veces, ni uno sin jornada', async () => {
    await assert.rejects(empleados.pagarGasolina(agente, { fechas: [dia(3)], metodoPagoId: efectivo }, admin), (e) => e.status === 409 && /ya se pagó/.test(e.message));
    await assert.rejects(empleados.pagarGasolina(agente, { fechas: [dia(4)], metodoPagoId: efectivo }, admin), (e) => e.status === 400 && /no tiene jornada/.test(e.message));
    await assert.rejects(empleados.pagarGasolina(agente, { fechas: [], metodoPagoId: efectivo }, admin), (e) => e.status === 400);
    await assert.rejects(empleados.pagarGasolina(agente, { fechas: [dia(5)] }, admin), (e) => e.status === 400 && /método/.test(e.message));
  });

  test('pagar la quincena paga lo que falta, incluida la gasolina sin pagar, y congela el desglose', async () => {
    let q1 = await quincena(1);
    assert.deepEqual([q1.total, q1.pagos.pagado, q1.pagos.porPagar], [17200, 5000, 12200], '6 h × 1.200 + 2 días de gasolina, uno ya pagado');
    await assert.rejects(empleados.pagarQuincena(agente, { periodo: `${mes}-Q1`, metodoPagoId: sinpe }, admin), (e) => e.status === 400 && /referencia/.test(e.message));
    const p = await empleados.pagarQuincena(agente, { periodo: `${mes}-Q1`, metodoPagoId: sinpe, referencia: 'ZZ-SINPE-Q1' }, admin);
    assert.deepEqual([p.concepto, p.monto], ['quincena', 12200]);
    q1 = await quincena(1);
    assert.deepEqual([q1.pagos.pagada, q1.pagos.pagado, q1.pagos.porPagar], [true, 17200, 0]);
    assert.ok(q1.gasolina.dias.every(d => d.pagada));
    const { rows: [g] } = await db.query('SELECT desglose FROM pago_empleado WHERE id = $1', [p.id]);
    assert.deepEqual(g.desglose.gasolina.dias, [{ fecha: dia(5), monto: 5000 }]);
    assert.equal(g.desglose.tarifas.pagoHora, 1200);
    assert.equal(g.desglose.comision, null, 'la 1.ª quincena no lleva la comisión');
    await assert.rejects(empleados.pagarQuincena(agente, { periodo: `${mes}-Q1`, metodoPagoId: efectivo }, admin), (e) => e.status === 409 && /nada pendiente/.test(e.message));
  });

  test('si después se agrega una hora, lo que falta se paga como ajuste', async () => {
    await tramo(6, '08:00', '09:00');
    const q1 = await quincena(1);
    assert.equal(q1.pagos.porPagar, 6200, '1 h más y su día de gasolina');
    const p = await empleados.pagarQuincena(agente, { periodo: `${mes}-Q1`, metodoPagoId: efectivo }, admin);
    assert.deepEqual([p.concepto, p.monto], ['ajuste', 6200]);
  });

  test('cambiar la tarifa no toca lo pagado: vale para lo que falta', async () => {
    await empleados.actualizar(agente, { pagoHora: 2000 }, admin);
    const q1 = await quincena(1);
    assert.deepEqual([q1.porHoras, q1.pagos.porPagar], [8400, 0], 'la 1.ª se pagó a 1.200');
    const q2 = await quincena(2);
    assert.equal(q2.porHoras, 6000, 'la 2.ª, sin pagar, va a 2.000');
    assert.deepEqual([q2.comision.monto, q2.total], [20, 11020], '3 h × 2.000 + gasolina + 2 % de 1.000');
  });

  test('«le debo» suma lo que falta de cada quincena terminada', async () => {
    const { deuda } = await empleados.ingresosDe(agente);
    const q2 = deuda.quincenas.find(x => x.clave === `${mes}-Q2`);
    assert.equal(q2.debe, 11020);
    assert.equal(deuda.quincenas.find(x => x.clave === `${mes}-Q1`).debe, 0);
    assert.ok(deuda.total >= 11020);
    const lista = await empleados.listar();
    assert.equal(lista.find(e => e.usuarioId === agente).leDebo, deuda.total);
  });

  test('en efectivo, el cierre del día la resta como salida de caja', async () => {
    const p = await empleados.pagarQuincena(agente, { periodo: `${mes}-Q2`, metodoPagoId: efectivo }, admin);
    assert.equal(p.monto, 11020);
    const d = await caja.resumenDelDia(hoy);
    const salidas = d.salidas.filter(s => s.tipo === 'pago_empleado').map(s => s.monto).sort((a, b) => a - b);
    assert.deepEqual(salidas, [5000, 6200, 11020], 'gasolina, ajuste y quincena en efectivo; el SINPE no');
  });

  test('anular devuelve a pendiente lo que cubría, sigue en caja tachado, y va a la bitácora', async () => {
    const { rows: [p] } = await db.query(`SELECT id FROM pago_empleado WHERE usuario_id = $1 AND periodo = $2 AND concepto = 'quincena'`, [agente, `${mes}-Q2`]);
    await assert.rejects(empleados.anularPago(p.id, { motivo: '' }, admin), (e) => e.status === 400);
    const r = await empleados.anularPago(p.id, { motivo: 'ZZ se registró dos veces' }, admin);
    assert.equal(r.diasDevueltos, 1);
    const q2 = await quincena(2);
    assert.deepEqual([q2.pagos.pagada, q2.pagos.porPagar, q2.gasolina.dias[0].pagada], [false, 11020, false]);
    const { rows: [m] } = await db.query(`SELECT anulado FROM movimiento_caja WHERE tipo = 'pago_empleado' AND documento_id = $1`, [p.id]);
    assert.equal(m.anulado, true);
    const { rows: [b] } = await db.query(`SELECT accion, motivo FROM bitacora_cambio WHERE entidad = 'pago_empleado' AND entidad_id = $1 AND accion = 'anular'`, [String(p.id)]);
    assert.equal(b.motivo, 'ZZ se registró dos veces');
    await assert.rejects(empleados.anularPago(p.id, { motivo: 'otra vez' }, admin), (e) => e.status === 409);
    // Se puede volver a pagar.
    assert.equal((await empleados.pagarQuincena(agente, { periodo: `${mes}-Q2`, metodoPagoId: efectivo }, admin)).concepto, 'quincena');
  });

  test('la quincena en curso no se paga antes de su último día', async () => {
    const actual = require('../src/modules/empleados/liquidacion').quincenaDe(hoy);
    await assert.rejects(empleados.pagarQuincena(agente, { periodo: actual.clave, metodoPagoId: efectivo }, admin), (e) => e.status === 409);
  });

  test('anular un pago es solo de administrador', () => {
    assert.equal(modulos.accionDeAdmin('PATCH', '/empleados/pagos/12/anular')?.clave, 'anular-pago-empleado');
    assert.equal(modulos.accionDeAdmin('POST', '/empleados/12/pagos/quincena'), null);
  });
});

describe('la pantalla', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('Caja General y el cierre nombran el pago a un empleado', () => {
    assert.match(leer('components', 'caja-general', 'MovimientosCaja.jsx'), /pago_empleado: 'Planilla:'/);
    assert.match(leer('components', 'cuentas-por-cobrar', 'PanelCierreCaja.jsx'), /pago_empleado: 'Planilla:'/);
  });

  test('«Anular» de un pago solo se dibuja para quien puede', () => {
    assert.match(leer('components', 'empleados', 'PagosEmpleado.jsx'), /puedeAccion\(usuario, 'anular-pago-empleado'\)/);
  });
});
