/**
 * Las rutas que atiende el agente (F2, 2026-10-29).
 *
 * El usuario: el agente «se hará cargo de las rutas poco a poco». En su ficha
 * de Usuarios se le marcan sus rutas; Preventa le muestra solo esas, salvo
 * que tenga «Ver todas las rutas» (`rutas-todas`). Lo hace valer el servidor.
 * Contra PostgreSQL local (con la 069 aplicada, como toda migración: lo exige
 * tablasPropias.test.js), en una transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const MIGRACION = path.join(__dirname, '..', 'migrations', 'independencia', '069_rutas_del_agente.sql');

describe('rutas del agente — contra PostgreSQL local', () => {
  let db, usuarios, preventa, admin, rutaA, rutaB, agente, cajero;
  const respuesta = () => { const r = {}; r.set = () => r; r.status = (c) => { r.estado = c; return r; }; r.json = (b) => { r.cuerpo = b; return r; }; return r; };
  const req = (usuarioId, modulos, query = {}) => ({ usuario: { id: usuarioId }, permisos: { esAdmin: false, modulos: new Set(modulos) }, query });
  const llamar = async (accion, r) => { const res = respuesta(); await preventa[accion](r, res); return res; };

  before(async () => {
    require('dotenv').config({ quiet: true });
    require('../config/aislado').asegurarBaseLocal();
    db = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL });
    await db.connect(); await db.query('BEGIN');
    const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
    const rutaDb = require.resolve('../config/database');
    for (const r of Object.keys(require.cache)) if (r.includes(`${path.sep}src${path.sep}`)) delete require.cache[r];
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'rutasagente') };
    usuarios = require('../src/modules/usuarios/usuarios.service');
    preventa = require('../src/modules/preventa/preventa.controller');

    admin = (await db.query('SELECT id FROM usuario WHERE es_admin ORDER BY id LIMIT 1')).rows[0].id;
    const ruta = async (nombre) => (await db.query(`INSERT INTO ruta_cliente (nombre, activo) VALUES ($1, TRUE) RETURNING id`, [nombre])).rows[0].id;
    rutaA = await ruta('ZZ Ruta A del agente');
    rutaB = await ruta('ZZ Ruta B');
    agente = await usuarios.crear({ usuario: 'zz-agente-f2', nombre: 'ZZ Agente F2', password: 'ZZclave2026', modulos: ['facturacion', 'preventa'], rutas: [rutaA] }, admin);
    cajero = await usuarios.crear({ usuario: 'zz-cajero-f2', nombre: 'ZZ Cajero F2', password: 'ZZclave2026', modulos: ['preventa', 'rutas-todas'] }, admin);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('al crearlo se le guardan sus rutas, y su ficha las trae con nombre', async () => {
    assert.deepEqual(agente.rutas, [{ id: rutaA, nombre: 'ZZ Ruta A del agente' }]);
    const ficha = await usuarios.obtener(agente.id);
    assert.deepEqual(ficha.rutas.map(r => r.id), [rutaA]);
    const enLista = (await usuarios.listar()).find(u => u.id === agente.id);
    assert.deepEqual(enLista.rutas.map(r => r.nombre), ['ZZ Ruta A del agente']);
  });

  test('cambiarle las rutas queda en la bitácora, con quién lo hizo y el antes y después', async () => {
    await usuarios.actualizar(agente.id, { rutas: [rutaA, rutaB] }, admin);
    const { rows: [linea] } = await db.query(
      `SELECT accion, antes, despues, usuario_id FROM bitacora_cambio WHERE entidad = 'usuario' AND entidad_id = $1 ORDER BY id DESC LIMIT 1`, [String(agente.id)]);
    assert.equal(linea.accion, 'editar');
    assert.deepEqual(linea.antes.rutas, [rutaA]);
    assert.deepEqual(linea.despues.rutas, [rutaA, rutaB].sort((a, b) => a - b));
    assert.equal(linea.usuario_id, admin);
    await usuarios.actualizar(agente.id, { rutas: [rutaA] }, admin);
  });

  test('guardar sin cambios no ensucia la bitácora; una ruta que no existe se rechaza', async () => {
    const contar = async () => (await db.query(`SELECT COUNT(*)::int AS n FROM bitacora_cambio WHERE entidad = 'usuario' AND entidad_id = $1`, [String(agente.id)])).rows[0].n;
    const antes = await contar();
    await usuarios.actualizar(agente.id, { rutas: [rutaA] }, admin);
    assert.equal(await contar(), antes);
    await assert.rejects(usuarios.actualizar(agente.id, { rutas: [999999999] }, admin), (e) => e.status === 400);
    await assert.rejects(usuarios.actualizar(agente.id, { rutas: ['x'] }, admin), (e) => e.status === 400);
  });

  test('en Preventa el agente ve solo su ruta', async () => {
    const res = await llamar('rutas', req(agente.id, ['facturacion', 'preventa']));
    assert.deepEqual(res.cuerpo.data.map(r => r.id), [rutaA]);
  });

  test('pedir la agenda de otra ruta, o «sin ruta», se rechaza (403); la suya, se entrega', async () => {
    const otra = await llamar('agenda', req(agente.id, ['preventa'], { rutaId: String(rutaB) }));
    assert.equal(otra.estado, 403);
    assert.match(otra.cuerpo.message, /no está asignada a su usuario/);
    const sinRuta = await llamar('agenda', req(agente.id, ['preventa'], { rutaId: 'sin-ruta' }));
    assert.equal(sinRuta.estado, 403);
    const suya = await llamar('agenda', req(agente.id, ['preventa'], { rutaId: String(rutaA) }));
    assert.equal(suya.cuerpo.success, true);
  });

  test('sin rutas asignadas no ve ninguna (no todas)', async () => {
    const nuevo = await usuarios.crear({ usuario: 'zz-agente-sin-rutas', nombre: 'ZZ', password: 'ZZclave2026', modulos: ['preventa'] }, admin);
    const res = await llamar('rutas', req(nuevo.id, ['preventa']));
    assert.deepEqual(res.cuerpo.data, []);
  });

  test('con «Ver todas las rutas» ve todas, como hasta hoy', async () => {
    const res = await llamar('rutas', req(cajero.id, ['preventa', 'rutas-todas']));
    const ids = res.cuerpo.data.map(r => r.id);
    assert.ok(ids.includes(rutaA) && ids.includes(rutaB));
    const sinRuta = await llamar('agenda', req(cajero.id, ['preventa', 'rutas-todas'], { rutaId: 'sin-ruta' }));
    assert.equal(sinRuta.cuerpo.success, true);
  });

  test('hacerlo administrador le quita las filas de rutas: las ve todas por su rol', async () => {
    const otro = await usuarios.crear({ usuario: 'zz-agente-a-admin', nombre: 'ZZ', password: 'ZZclave2026', modulos: ['preventa'], rutas: [rutaB] }, admin);
    const ahora = await usuarios.actualizar(otro.id, { esAdmin: true }, admin);
    assert.deepEqual(ahora.rutas, []);
  });

  test('la 069 da «Ver todas las rutas» a quien ya tenía Preventa, y se puede correr dos veces', async () => {
    const viejo = (await db.query(`INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ('zz-preventa-069', 'ZZ', 'zz', TRUE, FALSE) RETURNING id`)).rows[0].id;
    await db.query(`INSERT INTO usuario_modulo (usuario_id, modulo) VALUES ($1, 'preventa')`, [viejo]);
    // Solo lo que reparte permisos: la tabla ya está en la copia, y volver a
    // correr su DDL en una transacción larga trababa a las pruebas que corren
    // a la par (deadlock al crear el índice).
    const otorgar = fs.readFileSync(MIGRACION, 'utf8').split(';').map(x => x.trim()).filter(x => /^INSERT INTO usuario_modulo/m.test(x.replace(/^--.*$/gm, '').trim()));
    assert.equal(otorgar.length, 1);
    await db.query(otorgar[0]);
    await db.query(otorgar[0]);
    const { rows } = await db.query(`SELECT modulo FROM usuario_modulo WHERE usuario_id = $1 ORDER BY modulo`, [viejo]);
    assert.deepEqual(rows.map(r => r.modulo), ['preventa', 'rutas-todas']);
  });
});

describe('la pantalla: asignar rutas y lo que ve el agente', () => {
  const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

  test('la ficha del usuario pide rutas solo si ve Preventa y no todas las rutas', () => {
    const modal = leer('components', 'usuarios', 'ModalUsuario.jsx');
    assert.match(modal, /const eligeRutas = !esAdmin && modulos\.includes\('preventa'\) && !modulos\.includes\('rutas-todas'\)/);
    assert.match(modal, /\{eligeRutas && <RutasDelUsuario /);
    assert.match(modal, /const rutasQueVan = eligeRutas \? rutas : \[\]/);
  });

  test('una sola casilla para el tablero y las rutas', () => {
    assert.match(leer('components', 'usuarios', 'TableroPermisos.jsx'), /import Casilla from '\.\/Casilla'/);
    assert.match(leer('components', 'usuarios', 'RutasDelUsuario.jsx'), /import Casilla from '\.\/Casilla'/);
    assert.doesNotMatch(leer('components', 'usuarios', 'TableroPermisos.jsx'), /function Casilla/);
  });

  test('la lista de Usuarios dice qué rutas atiende cada uno', () => {
    assert.match(leer('pages', 'Usuarios.jsx'), /Rutas: \{u\.rutas\.map\(r => r\.nombre\)\.join\(' · '\)\}/);
  });

  test('Preventa: sin «Clientes sin ruta» para el agente, aviso si no tiene rutas, y entra directo si tiene una', () => {
    const filtros = leer('components', 'preventa', 'FiltrosAgenda.jsx');
    assert.match(filtros, /\{todas && <option value="sin-ruta">Clientes sin ruta<\/option>\}/);
    assert.match(filtros, /Todavía no tiene rutas asignadas/);
    assert.match(leer('hooks', 'useAgendaPreventa.js'), /if \(lista\.length === 1\) setRutaId\(actual => actual \|\| String\(lista\[0\]\.id\)\)/);
  });

  test('el permiso sale debajo de Preventa en el tablero', async () => {
    const { porGrupo, PERMISOS_DE_ACCION } = await import(path.join(FRONT, 'utils', 'modulos.js'));
    assert.ok(PERMISOS_DE_ACCION.some(a => a.clave === 'rutas-todas' && a.modulo === 'preventa'));
    const p = porGrupo().flatMap(g => g.modulos).find(m => m.clave === 'preventa');
    assert.deepEqual(p.acciones.map(a => a.nombre), ['Ver todas las rutas']);
  });
});
