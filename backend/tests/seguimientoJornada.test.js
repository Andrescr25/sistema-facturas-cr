/**
 * La jornada en «Seguimiento de agentes» (E5 de la planilla, 2026-10-30).
 *
 * El usuario quiere al agente «completamente monitoreado» y ver «cuántas
 * horas»: el recorrido del día trae cuándo inició y terminó la jornada, con
 * el GPS de cada marca, en orden con sus facturas. Contra PostgreSQL local
 * (con la 072 aplicada), en una transacción que se deshace. Correr también con
 * TZ=UTC (como Render): el orden no puede depender de la zona del servidor.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

describe('la jornada en el seguimiento — contra PostgreSQL local', () => {
  let db, seguimiento, empleados, jornadas, facturas, admin, agente, cliente, producto, ayer;

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
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'seguimientojornada') };
    seguimiento = require('../src/modules/seguimiento/seguimiento.service');
    empleados = require('../src/modules/empleados/empleados.service');
    jornadas = require('../src/modules/empleados/jornada.service');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    const fechas = require('../src/utils/fechaCR');
    ayer = fechas.sumarDias(fechas.hoyEnCostaRica(), -1);

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    agente = (await db.query(`INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ('zz-agente-recorrido', 'ZZ Agente recorrido', 'zz', TRUE, FALSE) RETURNING id`)).rows[0].id;
    cliente = (await db.query(`INSERT INTO cliente (nombre, activo) VALUES ('ZZ Cliente recorrido', TRUE) RETURNING id`)).rows[0].id;
    const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa = 13 LIMIT 1')).rows[0];
    producto = (await db.query(`INSERT INTO producto (nombre, referencia, precio_sin_iva, costo_con_iva, impuesto_id) VALUES ('ZZ-RECORRIDO', 'ZZ-RECORRIDO', 1000, 700, $1) RETURNING id`, [impuesto.id])).rows[0].id;
    await empleados.crear({ usuarioId: agente, pagoHora: 1000 }, admin);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('un empleado sin rutas también sale en la lista de agentes', async () => {
    assert.ok((await seguimiento.agentes()).some(a => a.id === agente));
  });

  test('entrada, la factura y la salida, en orden de hora y con el GPS de cada marca', async () => {
    const j = await jornadas.iniciar(agente, { estado: 'tomada', latitud: 10.0601, longitud: -84.4299, precision: 9 });
    await db.query(`UPDATE jornada SET inicio = inicio - interval '3 hours' WHERE id = $1`, [j.id]);
    const f = await facturas.crearFactura({ clienteId: cliente, clienteNombre: 'ZZ Cliente recorrido',
      items: [{ productoId: producto, price: 1000, quantity: 1, discount: 0, descuentoBase: 0 }] }, agente);
    await db.query(`UPDATE factura SET creado_en = creado_en - interval '1 hour' WHERE id = $1`, [f.id]);
    await jornadas.terminar(agente, { estado: 'negada' });

    const d = await seguimiento.dia({ usuarioId: agente });
    assert.deepEqual(d.recorrido.map(p => p.tipo === 'jornada' ? p.jornada.evento : p.tipo), ['entrada', 'venta', 'salida']);
    const [entrada, , salida] = d.recorrido;
    assert.match(entrada.hora, /^\d{2}:\d{2}$/);
    assert.deepEqual(entrada.gps, { estado: 'tomada', latitud: 10.0601, longitud: -84.4299, precision: 9 });
    assert.equal(salida.jornada.minutos, 180);
    assert.equal(salida.gps.estado, 'negada');
    assert.deepEqual(d.resumen.jornada, { tramos: 1, minutos: 180, abierta: false, sinSalida: 0 });
    assert.equal(d.resumen.sinGps, 1, 'la salida sin permiso de ubicación cuenta');
    assert.equal(d.resumen.clientesVisitados, 1, 'la jornada no es una visita');
  });

  test('un tramo agregado a mano no trae GPS; uno anulado no sale', async () => {
    await jornadas.agregar(agente, { inicio: `${ayer}T08:00`, fin: `${ayer}T10:00`, motivo: 'ZZ no marcó' }, admin);
    const nula = await jornadas.agregar(agente, { inicio: `${ayer}T11:00`, fin: `${ayer}T12:00`, motivo: 'ZZ por error' }, admin);
    await jornadas.corregir(nula.id, { anular: true, motivo: 'ZZ no trabajó' }, admin);
    const d = await seguimiento.dia({ usuarioId: agente, fecha: ayer });
    assert.equal(d.recorrido.length, 2);
    assert.ok(d.recorrido.every(p => p.tipo === 'jornada' && p.gps === null && p.jornada.aMano));
    assert.equal(d.resumen.jornada.minutos, 120);
    assert.equal(d.resumen.sinGps, 0);
  });
});

describe('la pantalla', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('el recorrido dibuja la jornada aparte, sin cliente', () => {
    const r = leer('components', 'seguimiento', 'RecorridoAgente.jsx');
    assert.match(r, /if \(p\.tipo === 'jornada'\) return <MarcaDeJornada /);
    assert.match(r, /Inició la jornada/);
    assert.match(r, /Terminó la jornada · \$\{duracion\(p\.jornada\.minutos\)\}/);
  });

  test('desde Empleados se abre el día de ese agente', () => {
    assert.match(leer('hooks', 'useSeguimientoAgente.js'), /useState\(\(\) => parametros\.get\('agente'\) \|\| ''\)/);
    assert.match(leer('components', 'empleados', 'DetalleEmpleado.jsx'), /to=\{`\/seguimiento\?agente=\$\{usuarioId\}`\}/);
  });
});
