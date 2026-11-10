/**
 * Tipo de personal: agente de ventas o bodega (2026-11-09, migración 079).
 *
 * El usuario: «mañana contrataré a un bodeguero; desde los permisos de usuarios
 * poner el tipo de personal. El agente de ventas tiene gasolina, incentivo,
 * comisión… en cambio bodega solo tiene horas y horas extras». Decidió: es
 * extra lo que pase de 8 h en un día (ajustable por empleado), a tiempo y medio.
 *
 * Contra PostgreSQL local (con la 079), en una transacción que se deshace. Las
 * jornadas van en el mes ANTERIOR al de hoy, para que la quincena esté cerrada.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const liquidacion = require('../src/modules/empleados/liquidacion');

describe('las horas extra, sin base', () => {
  test('lo que pasa de la jornada de cada día es extra; dos tramos que juntos la pasan también', () => {
    const dias = liquidacion.conExtra([
      { fecha: '2026-10-01', minutos: 600, tramos: [] },
      { fecha: '2026-10-02', minutos: 540, tramos: [] },
      { fecha: '2026-10-03', minutos: 360, tramos: [] }
    ], 8);
    assert.deepEqual(dias.map(d => [d.normales, d.extra]), [[480, 120], [480, 60], [360, 0]]);
    assert.deepEqual(liquidacion.conExtra([{ fecha: 'x', minutos: 420, tramos: [] }], 6).map(d => d.extra), [60], 'jornada de 6 h');
  });

  test('la extra a tiempo y medio, a céntimos', () => {
    assert.equal(liquidacion.RECARGO_EXTRA, 1.5);
    assert.equal(liquidacion.montoPorExtra(120, 2000), 6000);
    assert.equal(liquidacion.montoPorExtra(30, 2201), 1650.75);
    assert.deepEqual(liquidacion.TIPOS, ['ventas', 'bodega']);
  });
});

describe('bodega y ventas — contra PostgreSQL local', () => {
  let db, empleados, jornadas, usuarios, admin, bodeguero, agente, mes;
  const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`;
  const jornada = (u, d, desde, hasta) => jornadas.agregar(u, { inicio: `${dia(d)}T${desde}`, fin: `${dia(d)}T${hasta}`, motivo: 'ZZ prueba' }, admin);

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
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'tipopersonal') };
    empleados = require('../src/modules/empleados/empleados.service');
    jornadas = require('../src/modules/empleados/jornada.service');
    usuarios = require('../src/modules/usuarios/usuarios.service');
    const fechas = require('../src/utils/fechaCR');
    mes = fechas.sumarDias(`${fechas.hoyEnCostaRica().slice(0, 7)}-01`, -1).slice(0, 7);
    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const usuario = async (u) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $1, 'zz', TRUE, FALSE) RETURNING id`, [u])).rows[0].id;
    bodeguero = await usuario('zz-bodeguero');
    agente = await usuario('zz-agente-tipo');
    await empleados.crear({ usuarioId: bodeguero, tipo: 'bodega', pagoHora: 2000 }, admin);
    await empleados.crear({ usuarioId: agente, pagoHora: 2000 }, admin);
    await db.query('UPDATE empleado SET desde = $2 WHERE usuario_id = ANY($1::int[])', [[bodeguero, agente], dia(1)]);
    for (const u of [bodeguero, agente]) {
      await jornada(u, 2, '07:00', '17:00');                                  // 10 h
      await jornada(u, 3, '07:00', '12:00'); await jornada(u, 3, '13:00', '17:00'); // 5 + 4 = 9 h
      await jornada(u, 4, '08:00', '14:00');                                  // 6 h
    }
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('una ficha nueva es de ventas con jornada de 8 h; el tipo no acepta otra cosa', async () => {
    const f = await empleados.fichaDe(agente);
    assert.deepEqual([f.tipo, f.tarifas.tipo, f.tarifas.horasJornada], ['ventas', 'ventas', 8]);
    assert.equal((await empleados.fichaDe(bodeguero)).tipo, 'bodega');
    await assert.rejects(empleados.actualizar(agente, { tipo: 'chofer' }, admin), (e) => e.status === 400 && /Tipo de personal/.test(e.message));
    await assert.rejects(empleados.actualizar(agente, { horasJornada: 0 }, admin), (e) => e.status === 400);
  });

  test('bodega: 22 h normales y 3 h extra a tiempo y medio, sin comisión, clientes ni gasolina', async () => {
    const { quincena: q } = await empleados.ingresosDe(bodeguero, `${mes}-Q1`);
    assert.equal(q.tipo, 'bodega');
    assert.equal(q.minutos, 25 * 60);
    assert.deepEqual([q.extra.minutos, q.extra.monto, q.extra.horasJornada], [180, 9000, 8]);
    assert.equal(q.porHoras, 44000);
    assert.deepEqual([q.gasolina.monto, q.gasolina.dias.length, q.clientesNuevos.monto, q.comision.monto], [0, 0, 0, 0]);
    assert.equal(q.total, 53000);
    assert.deepEqual(q.dias.map(d => d.extra), [120, 60, 0]);
  });

  test('ventas no cambia: todas las horas a tarifa normal, más gasolina por día', async () => {
    const { quincena: q } = await empleados.ingresosDe(agente, `${mes}-Q1`);
    assert.equal(q.tipo, 'ventas');
    assert.deepEqual([q.extra.minutos, q.extra.monto], [0, 0]);
    assert.equal(q.porHoras, 50000);
    assert.equal(q.gasolina.dias.length, 3);
    assert.equal(q.total, 50000 + q.gasolina.monto + q.clientesNuevos.monto);
  });

  test('una jornada de 9 h por ficha: lo de más es extra', async () => {
    await empleados.actualizar(bodeguero, { horasJornada: 9 }, admin);
    const { quincena: q } = await empleados.ingresosDe(bodeguero, `${mes}-Q1`);
    assert.deepEqual([q.extra.minutos, q.extra.monto, q.porHoras], [60, 3000, 48000]);
    await empleados.actualizar(bodeguero, { horasJornada: 8 }, admin);
  });

  test('Usuarios y permisos ve el tipo de personal de cada uno, y nada en quien no lleva planilla', async () => {
    const lista = await usuarios.listar();
    const de = (id) => lista.find(u => u.id === id).planilla;
    assert.deepEqual([de(bodeguero).tipo, de(bodeguero).pagoHora, de(bodeguero).horasJornada, de(bodeguero).activo], ['bodega', 2000, 8, true]);
    assert.equal(de(agente).tipo, 'ventas');
    assert.equal(de(admin), null);
  });

  test('Empleados lista a cada uno con sus horas extra', async () => {
    const lista = await empleados.listar();
    const b = lista.find(e => e.usuarioId === bodeguero);
    assert.equal(b.tipo, 'bodega');
    assert.ok('extra' in b.quincena);
  });
});

/**
 * La planilla desde Usuarios y permisos (frontend/src/utils/planillaUsuario.js):
 * ESM sin imports; se lee, se le quitan los `export` y se evalúa.
 */
describe('la planilla en Usuarios y permisos, sin base', () => {
  const FUENTE = require('fs').readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'planillaUsuario.js'), 'utf8');
  const { planillaInicial, faltaEnPlanilla, cambioDePlanilla } = new Function(
    `${FUENTE.replace(/^export /gm, '')}\n return { planillaInicial, faltaEnPlanilla, cambioDePlanilla };`)();

  test('quien no tiene ficha, o la tiene inactiva, arranca en «No lleva planilla»', () => {
    assert.equal(planillaInicial({ planilla: null }).tipo, 'ninguno');
    assert.equal(planillaInicial({ planilla: { tipo: 'bodega', activo: false } }).tipo, 'ninguno');
    assert.equal(planillaInicial({ planilla: { tipo: 'bodega', activo: true, pagoHora: 2000, horasJornada: 9 } }).horasJornada, 9);
  });

  test('pide el pago por hora; a bodega, una jornada de 1 a 24 h', () => {
    assert.equal(faltaEnPlanilla({ tipo: 'ninguno' }), '');
    assert.match(faltaEnPlanilla({ tipo: 'ventas', pagoHora: '' }), /por hora/);
    assert.match(faltaEnPlanilla({ tipo: 'bodega', pagoHora: 2000, horasJornada: 0 }), /1 a 24/);
    assert.equal(faltaEnPlanilla({ tipo: 'bodega', pagoHora: 2000, horasJornada: 8 }), '');
  });

  test('da de alta, actualiza o desactiva la ficha; sin ficha y sin planilla, nada', () => {
    const bodega = { tipo: 'bodega', pagoHora: '2000', horasJornada: '8', comisionPorcentaje: 2, incentivoClienteNuevo: 2000, gasolinaDiaria: 5000 };
    assert.equal(cambioDePlanilla({ tipo: 'ninguno' }, null), null);
    assert.deepEqual(cambioDePlanilla({ tipo: 'ninguno' }, { activo: true }), { accion: 'actualizar', datos: { activo: false } });
    assert.equal(cambioDePlanilla({ tipo: 'ninguno' }, { activo: false }), null);
    const alta = cambioDePlanilla(bodega, null);
    assert.equal(alta.accion, 'crear');
    assert.deepEqual([alta.datos.tipo, alta.datos.pagoHora, alta.datos.horasJornada], ['bodega', 2000, 8]);
    assert.equal(cambioDePlanilla(bodega, { activo: false }).datos.activo, true, 'volver a darle planilla la reactiva');
  });
});
