/**
 * Ficha de empleado y jornadas (E1 de «Mis ingresos» / «Empleados», 2026-10-30).
 *
 * El usuario: el agente «marca entrada y salida», se le paga por hora
 * trabajada, por quincena; él ve «las horas que trabaja por día» y el
 * administrador «qué hizo, cuántas horas». Las reglas puras van primero; lo
 * demás, contra PostgreSQL local (con la 072 aplicada), en una transacción
 * que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const liquidacion = require('../src/modules/empleados/liquidacion');

describe('las quincenas y las horas, sin base', () => {
  test('del 1 al 15 y del 16 a fin de mes, con meses de 28, 29, 30 y 31 días', () => {
    assert.deepEqual(liquidacion.quincenaDe('2026-10-15'), {
      clave: '2026-10-Q1', mes: '2026-10', numero: 1, desde: '2026-10-01', hasta: '2026-10-15', nombre: '1.ª quincena de octubre 2026' });
    assert.equal(liquidacion.quincenaDe('2026-10-16').hasta, '2026-10-31');
    assert.equal(liquidacion.quincenaDe('2026-11-30').hasta, '2026-11-30');
    assert.equal(liquidacion.quincenaDe('2027-02-20').hasta, '2027-02-28');
    assert.equal(liquidacion.quincenaDe('2028-02-16').hasta, '2028-02-29');
    assert.equal(liquidacion.quincenaDe('2026-09-16').nombre, '2.ª quincena de setiembre 2026');
  });

  test('se recorren hacia atrás y adelante, también entre años; una clave mala no vale', () => {
    const q = liquidacion.quincenaPorClave('2026-01-Q1');
    assert.equal(liquidacion.quincenaAnterior(q).clave, '2025-12-Q2');
    assert.equal(liquidacion.quincenaSiguiente(liquidacion.quincenaPorClave('2026-12-Q2')).clave, '2027-01-Q1');
    assert.equal(liquidacion.quincenaSiguiente(q).clave, '2026-01-Q2');
    for (const mala of ['2026-13-Q1', '2026-10-Q3', '2026-10', '', null, "2026-10-Q1' OR 1=1"]) assert.equal(liquidacion.quincenaPorClave(mala), null, String(mala));
  });

  test('solo cuenta el tramo con salida; varios tramos se suman y el que pasa la medianoche va al día de entrada', () => {
    const t = (fecha, inicio, fin, estado = 'cerrada') => ({ fecha, inicio, fin, estado });
    const dias = liquidacion.horasPorDia([
      t('2026-10-29', '2026-10-29T19:00:00-06:00', '2026-10-30T01:30:00-06:00'),
      t('2026-10-28', '2026-10-28T13:00:00-06:00', '2026-10-28T17:32:00-06:00'),
      t('2026-10-28', '2026-10-28T07:30:00-06:00', '2026-10-28T12:00:00-06:00'),
      t('2026-10-28', '2026-10-28T18:00:00-06:00', null, 'sin_salida'),
      t('2026-10-27', '2026-10-27T08:00:00-06:00', '2026-10-27T10:00:00-06:00', 'anulada')
    ]);
    assert.deepEqual(dias.map(d => [d.fecha, d.minutos, d.tramos.length]), [['2026-10-27', 0, 1], ['2026-10-28', 542, 3], ['2026-10-29', 390, 1]]);
    assert.deepEqual(dias[1].tramos.map(x => x.minutos), [270, 272, 0], 'en orden de hora');
  });

  test('lo ganado por horas se redondea a céntimos', () => {
    assert.equal(liquidacion.montoPorHoras(542, 1800), 16260);
    assert.equal(liquidacion.montoPorHoras(7, 1999), 233.22);
    assert.equal(liquidacion.montoPorHoras(0, 1800), 0);
  });
});

describe('ficha de empleado y jornadas — contra PostgreSQL local', () => {
  let db, empleados, jornadas, ingresos, usuarios, modulos, admin, agente, otro, sinFicha, hoy, ayer;
  const respuesta = () => { const r = {}; r.set = () => r; r.status = (c) => { r.estado = c; return r; }; r.json = (b) => { r.cuerpo = b; return r; }; return r; };
  // Un error de SQL dentro de la transacción de la prueba la dejaría inservible.
  const conPunto = async (fn) => { await db.query('SAVEPOINT prueba'); try { return await fn(); } finally { await db.query('ROLLBACK TO SAVEPOINT prueba'); } };
  const gpsTomado = { estado: 'tomada', latitud: 10.0569, longitud: -84.4351, precision: 12 };
  // La prueba corre en UNA transacción: now() no avanza. Se corre la entrada para atrás.
  const atrasar = (id, horas) => db.query(`UPDATE jornada SET inicio = inicio - make_interval(hours => $2) WHERE id = $1`, [id, horas]);

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
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'jornada') };
    empleados = require('../src/modules/empleados/empleados.service');
    jornadas = require('../src/modules/empleados/jornada.service');
    ingresos = require('../src/modules/ingresos/ingresos.controller');
    usuarios = require('../src/modules/usuarios/usuarios.service');
    modulos = require('../src/modules/usuarios/modulos');
    const fechas = require('../src/utils/fechaCR');
    hoy = fechas.hoyEnCostaRica();
    ayer = fechas.sumarDias(hoy, -1);

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const usuario = async (u, nombre) => (await db.query(
      `INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ($1, $2, 'zz', TRUE, FALSE) RETURNING id`, [u, nombre])).rows[0].id;
    agente = await usuario('zz-empleado-a', 'ZZ Empleado A');
    otro = await usuario('zz-empleado-b', 'ZZ Empleado B');
    sinFicha = await usuario('zz-sin-ficha', 'ZZ Sin ficha');
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('el alta pone las tarifas que decidió el usuario por omisión, y queda en la bitácora', async () => {
    assert.ok((await empleados.usuariosSinFicha()).some(u => u.id === agente));
    const f = await empleados.crear({ usuarioId: agente, pagoHora: 1800 }, admin);
    assert.deepEqual(f.tarifas, { pagoHora: 1800, comisionPorcentaje: 2, incentivoClienteNuevo: 2000, gasolinaDiaria: 5000 });
    assert.equal(f.desde, hoy);
    await empleados.crear({ usuarioId: otro, pagoHora: 1500, gasolinaDiaria: 0 }, admin);
    assert.ok(!(await empleados.usuariosSinFicha()).some(u => u.id === agente));
    const { rows: [b] } = await db.query(`SELECT accion, usuario_id, despues FROM bitacora_cambio WHERE entidad = 'empleado' AND entidad_id = $1`, [String(agente)]);
    assert.equal(b.accion, 'crear'); assert.equal(b.usuario_id, admin); assert.equal(b.despues.pago_hora, 1800);
  });

  test('las tarifas se validan; dos fichas para el mismo usuario, no', async () => {
    for (const malo of [{}, { pagoHora: '' }, { pagoHora: -1 }, { pagoHora: 'x' }, { pagoHora: 1000, comisionPorcentaje: 101 }]) {
      await assert.rejects(empleados.crear({ usuarioId: sinFicha, ...malo }, admin), (e) => e.status === 400, JSON.stringify(malo));
    }
    await conPunto(() => assert.rejects(empleados.crear({ usuarioId: agente, pagoHora: 1 }, admin), (e) => e.status === 409));
  });

  test('cambiar una tarifa queda en la bitácora con el antes y el después', async () => {
    const f = await empleados.actualizar(agente, { pagoHora: 2000 }, admin);
    assert.equal(f.tarifas.pagoHora, 2000);
    const { rows: [b] } = await db.query(
      `SELECT cambios FROM bitacora_cambio WHERE entidad = 'empleado' AND entidad_id = $1 AND accion = 'editar' ORDER BY id DESC LIMIT 1`, [String(agente)]);
    assert.deepEqual(b.cambios, { pago_hora: [1800, 2000] });
  });

  test('«Iniciar jornada»: la hora la pone el servidor, con el GPS; una sola abierta', async () => {
    const j = await jornadas.iniciar(agente, { ...gpsTomado, momento: '2020-01-01T00:00' });
    const { rows: [ahora] } = await db.query('SELECT now() AS n');
    assert.equal(new Date(j.inicio).getTime(), new Date(ahora.n).getTime());
    assert.equal(j.fecha, hoy);
    assert.equal(j.estado, 'abierta');
    assert.equal(j.aMano, false);
    assert.deepEqual(j.gpsInicio, { estado: 'tomada', latitud: 10.0569, longitud: -84.4351, precision: 12 });
    await assert.rejects(jornadas.iniciar(agente, gpsTomado), (e) => e.status === 409 && /Ya tenés la jornada abierta desde las \d{2}:\d{2}/.test(e.message));
    const estado = await jornadas.estadoDe(agente);
    assert.equal(estado.abierta.id, j.id);
  });

  test('«Terminar jornada» la cierra con su GPS (o por qué no lo hay) y cuenta sus horas', async () => {
    const { abierta } = await jornadas.estadoDe(agente);
    await atrasar(abierta.id, 4);
    const j = await jornadas.terminar(agente, { estado: 'negada' });
    assert.equal(j.estado, 'cerrada');
    assert.deepEqual(j.gpsFin, { estado: 'negada', latitud: null, longitud: null, precision: null });
    await assert.rejects(jornadas.terminar(agente, gpsTomado), (e) => e.status === 409 && /No tenés una jornada abierta/.test(e.message));
    const { quincena } = await empleados.ingresosDe(agente);
    const dia = quincena.dias.find(d => d.fecha === hoy);
    assert.equal(dia.minutos, 240);
    assert.equal(quincena.porHoras, 8000);
  });

  test('la que pasó de 16 horas abierta queda «sin salida»: no se cierra, cuenta 0 y deja abrir otra', async () => {
    const j = await jornadas.iniciar(agente, gpsTomado);
    await atrasar(j.id, 17);
    assert.equal((await jornadas.estadoDe(agente)).sinSalida[0].id, j.id, 'se lee sin salida aunque nadie la tocó');
    await assert.rejects(jornadas.terminar(agente, gpsTomado), (e) => e.status === 409 && /quedó sin salida y la corrige el administrador/.test(e.message));
    const { rows: [guardada] } = await db.query('SELECT estado, fin FROM jornada WHERE id = $1', [j.id]);
    assert.deepEqual(guardada, { estado: 'sin_salida', fin: null });
    const nueva = await jornadas.iniciar(agente, gpsTomado);
    assert.equal(nueva.estado, 'abierta');
    await atrasar(nueva.id, 1);
    await jornadas.terminar(agente, gpsTomado);
  });

  test('corregir pone entrada y salida con motivo, y va a la bitácora', async () => {
    const [olvidada] = (await jornadas.estadoDe(agente)).sinSalida;
    await assert.rejects(jornadas.corregir(olvidada.id, { inicio: `${ayer}T08:00`, fin: `${ayer}T12:00` }, admin), (e) => e.status === 400 && /motivo/.test(e.message));
    await assert.rejects(jornadas.corregir(olvidada.id, { inicio: `${ayer}T08:00`, motivo: 'se le olvidó' }, admin), (e) => e.status === 400 && /Salida/.test(e.message));
    const j = await jornadas.corregir(olvidada.id, { inicio: `${ayer}T08:00`, fin: `${ayer}T12:30`, motivo: 'se le olvidó marcar la salida' }, admin);
    assert.equal(j.estado, 'cerrada');
    assert.equal(j.fecha, ayer);
    assert.deepEqual(j.correccion, { motivo: 'se le olvidó marcar la salida', por: (await db.query('SELECT nombre FROM usuario WHERE id = $1', [admin])).rows[0].nombre });
    const { rows: [b] } = await db.query(`SELECT accion, motivo, cambios FROM bitacora_cambio WHERE entidad = 'jornada' AND entidad_id = $1`, [String(j.id)]);
    assert.equal(b.accion, 'editar');
    assert.equal(b.motivo, 'se le olvidó marcar la salida');
    assert.deepEqual(b.cambios.estado, ['sin_salida', 'cerrada']);
  });

  test('un tramo corregido o agregado tiene que poder haber pasado', async () => {
    const mal = (datos, estado = 400, patron) => assert.rejects(jornadas.agregar(agente, { motivo: 'no marcó', ...datos }, admin),
      (e) => e.status === estado && (!patron || patron.test(e.message)), JSON.stringify(datos));
    await mal({ inicio: `${ayer}T12:00`, fin: `${ayer}T12:00` }, 400, /después de la entrada/);
    await mal({ inicio: `${ayer}T01:00`, fin: `${ayer}T18:00` }, 400, /hasta 16 horas/);
    await mal({ inicio: `${hoy}T23:58`, fin: `${hoy}T23:59` }, 400, /futuro/);
    await mal({ inicio: `${ayer}T11:00`, fin: `${ayer}T13:00` }, 409, /Se cruza/);
    await mal({ inicio: 'ayer', fin: `${ayer}T13:00` }, 400, /Entrada/);
    await assert.rejects(jornadas.agregar(sinFicha, { inicio: `${ayer}T13:00`, fin: `${ayer}T14:00`, motivo: 'x x x' }, admin), (e) => e.status === 404);
  });

  test('agregar un tramo que no se marcó: pegado a otro sí, y suma al día', async () => {
    const j = await jornadas.agregar(agente, { inicio: `${ayer}T12:30`, fin: `${ayer}T17:00`, motivo: 'salió sin el teléfono' }, admin);
    assert.deepEqual([j.estado, j.fecha, j.aMano], ['cerrada', ayer, true], 'a mano: la pantalla no le busca GPS');
    const { quincena } = await empleados.ingresosDe(agente, liquidacion.quincenaDe(ayer).clave);
    assert.equal(quincena.dias.find(d => d.fecha === ayer).minutos, 540);
    const { rows: [b] } = await db.query(`SELECT accion, motivo FROM bitacora_cambio WHERE entidad = 'jornada' AND entidad_id = $1`, [String(j.id)]);
    assert.deepEqual(b, { accion: 'crear', motivo: 'salió sin el teléfono' });
  });

  test('anular deja de contarla, se sigue viendo, y no se vuelve a tocar', async () => {
    const j = await jornadas.agregar(agente, { inicio: `${ayer}T18:00`, fin: `${ayer}T19:00`, motivo: 'prueba de anular' }, admin);
    const anulada = await jornadas.corregir(j.id, { anular: true, motivo: 'la marcó por error' }, admin);
    assert.equal(anulada.estado, 'anulada');
    const { quincena } = await empleados.ingresosDe(agente, liquidacion.quincenaDe(ayer).clave);
    const dia = quincena.dias.find(d => d.fecha === ayer);
    assert.equal(dia.minutos, 540);
    assert.ok(dia.tramos.some(t => t.id === j.id && t.estado === 'anulada' && t.minutos === 0));
    await assert.rejects(jornadas.corregir(j.id, { inicio: `${ayer}T18:00`, fin: `${ayer}T19:00`, motivo: 'otra vez' }, admin), (e) => e.status === 409);
  });

  test('a la jornada abierta se le corrige solo la entrada y sigue abierta', async () => {
    const j = await jornadas.iniciar(otro, gpsTomado);
    await atrasar(j.id, 2);
    const { rows: [r] } = await db.query(`SELECT to_char((now() - interval '3 hours') AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD"T"HH24:MI') AS m`);
    const c = await jornadas.corregir(j.id, { inicio: r.m, motivo: 'llegó antes' }, admin);
    assert.equal(c.estado, 'abierta');
    assert.equal((await jornadas.estadoDe(otro)).abierta.id, j.id);
  });

  test('«Mis ingresos» lee SOLO la sesión, aunque la pantalla pida a otro', async () => {
    const res = respuesta();
    await ingresos.resumen({ usuario: { id: String(agente) }, query: { usuarioId: String(otro) } }, res);
    assert.equal(res.cuerpo.data.ficha.usuarioId, agente);
    const sin = respuesta();
    await ingresos.resumen({ usuario: { id: String(sinFicha) }, query: {} }, sin);
    assert.equal(sin.estado, 404);
    assert.match(sin.cuerpo.message, /no está configurado como empleado/);
    const iniciar = respuesta();
    await ingresos.iniciar({ usuario: { id: String(sinFicha) }, body: {} }, iniciar);
    assert.equal(iniciar.estado, 404);
  });

  test('la lista de Empleados trae a cada uno con su quincena y su jornada', async () => {
    const lista = await empleados.listar();
    const a = lista.find(e => e.usuarioId === agente);
    const b = lista.find(e => e.usuarioId === otro);
    assert.equal(a.quincena.periodo.clave, liquidacion.quincenaDe(hoy).clave);
    assert.equal(a.jornada.abierta, null);
    assert.ok(b.jornada.abierta);
  });

  test('una ficha desactivada ya no marca jornada, pero su historia queda', async () => {
    await empleados.actualizar(agente, { activo: false }, admin);
    await assert.rejects(jornadas.iniciar(agente, gpsTomado), (e) => e.status === 404);
    const { quincena } = await empleados.ingresosDe(agente, liquidacion.quincenaDe(ayer).clave);
    assert.ok(quincena.minutos > 0);
    await empleados.actualizar(agente, { activo: true }, admin);
  });

  test('un usuario con jornadas no se borra: se desactiva', async () => {
    await conPunto(() => assert.rejects(usuarios.eliminar(agente, admin), (e) => e.status === 409 && /desactívelo/.test(e.message)));
  });

  test('los permisos: cada prefijo es de su módulo', () => {
    assert.equal(modulos.moduloDeRuta('/ingresos/jornada/iniciar'), 'ingresos');
    assert.equal(modulos.moduloDeRuta('/empleados/5/jornadas'), 'empleados');
    assert.equal(modulos.moduloDeRuta('/Empleados/jornadas/3'), 'empleados');
  });
});

describe('la pantalla', () => {
  const fs = require('fs');
  const { sinComentarios } = require('./dobles/sinComentarios');
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('las horas se leen «7 h 32 min» y la hora es la de Costa Rica', async () => {
    const { duracion, minutosDesde } = await import(path.join(FRONT, 'utils', 'ingresosTexto.js'));
    assert.deepEqual([duracion(452), duracion(45), duracion(480), duracion(0), duracion(-3)], ['7 h 32 min', '45 min', '8 h', '0 min', '0 min']);
    assert.equal(minutosDesde('2026-10-30T13:00:00Z', new Date('2026-10-30T15:31:59Z')), 151);
    const { horaEnCostaRica, momentoLocalCR } = await import(path.join(FRONT, 'utils', 'fechaCR.js'));
    assert.equal(horaEnCostaRica('2026-10-30T13:42:00Z'), '07:42');
    assert.equal(momentoLocalCR('2026-10-30T05:05:00Z'), '2026-10-29T23:05', 'de noche todavía es el día anterior');
  });

  test('«Mis ingresos» no dice de quién leer: el servidor usa la sesión', () => {
    const h = leer('hooks', 'useMisIngresos.js');
    assert.match(h, /api\.get\('\/ingresos', \{ params: periodo \? \{ periodo \} : \{\} \}\)/);
    assert.doesNotMatch(h, /usuarioId/);
  });

  test('marcar la jornada toma el GPS; el reloj de lo que lleva corre en la tarjeta', () => {
    assert.match(leer('hooks', 'useJornada.js'), /const ubicacion = await tomarUbicacion\(\)\s+await api\.post\(`\/ingresos\/jornada\/\$\{accion\}`, \{ ubicacion \}\)/);
    const t = leer('components', 'ingresos', 'TarjetaJornada.jsx');
    assert.match(t, />Iniciar jornada<\/Boton>/);
    assert.match(t, />Terminar jornada<\/Boton>/);
    assert.match(t, /quedó sin salida: no cuenta hasta que el administrador la corrija/);
  });

  test('Preventa recuerda iniciar la jornada solo a quien tiene «Mis ingresos»', () => {
    assert.match(leer('pages', 'Preventa.jsx'), /\{puedeVer\(usuario, '\/ingresos'\) && !agenda\.seleccionId && <RecordatorioJornada \/>\}/);
  });

  test('el punto en el mapa sale de una sola regla para visitas y jornadas', () => {
    assert.match(leer('utils', 'seguimientoAgente.js'), /const mapa = mapaDe\(gps\)/);
    assert.match(leer('components', 'ingresos', 'HorasDeLaQuincena.jsx'), /import \{ mapaDe \} from '\.\.\/\.\.\/utils\/seguimientoAgente'/);
  });

  test('el tramo agregado a mano no se presenta como uno sin GPS', () => {
    const h = leer('components', 'ingresos', 'HorasDeLaQuincena.jsx');
    assert.match(h, /\{!t\.aMano && \(/);
    assert.match(h, /\{t\.aMano \? 'Agregada' : 'Corregida'\} por/);
  });

  test('las horas por día son las mismas para el empleado y para Empleados, que además corrige', () => {
    assert.match(leer('pages', 'MisIngresos.jsx'), /<HorasDeLaQuincena dias=\{q\.dias\} \/>/);
    assert.match(leer('components', 'empleados', 'DetalleEmpleado.jsx'), /<HorasDeLaQuincena dias=\{q\.dias\} onCorregir=\{setTramo\} \/>/);
  });
});
