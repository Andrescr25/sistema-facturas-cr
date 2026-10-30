/**
 * Rotación y ubicación exacta desde la visita (2026-10-29).
 *
 * El usuario: «ocupo que el agente pueda editar la rotación, pueda asignarle
 * ubicación con punto exacto en el mapa». El agente no tiene Clientes: desde
 * Preventa corrige SOLO esos dos datos, y solo en clientes de sus rutas. Pasa
 * por la misma edición de Clientes (validación y bitácora). Contra PostgreSQL
 * local, en una transacción que se deshace.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

describe('corregir la ficha desde la visita — contra PostgreSQL local', () => {
  let db, ficha, preventa, seguimiento, agente, rutaA, rutaB, cliente, ajeno;
  const quien = () => ({ usuarioId: agente, rutasPermitidas: [rutaA] });

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
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(db, 'ficha') };
    ficha = require('../src/modules/preventa/fichaDesdeVisita');
    preventa = require('../src/modules/preventa/preventa.controller');
    seguimiento = require('../src/modules/seguimiento/seguimiento.service');

    agente = (await db.query(`INSERT INTO usuario (usuario, nombre, password_hash, activo, es_admin) VALUES ('zz-agente-ficha', 'ZZ Agente ficha', 'zz', TRUE, FALSE) RETURNING id`)).rows[0].id;
    const ruta = async (n) => (await db.query(`INSERT INTO ruta_cliente (nombre, activo) VALUES ($1, TRUE) RETURNING id`, [n])).rows[0].id;
    rutaA = await ruta('ZZ Ruta ficha A'); rutaB = await ruta('ZZ Ruta ficha B');
    await db.query('INSERT INTO usuario_ruta (usuario_id, ruta_id) VALUES ($1, $2)', [agente, rutaA]);
    const nuevo = async (nombre, r) => (await db.query(
      `INSERT INTO cliente (nombre, activo, ruta_id, orden_ruta, rotacion_dias) VALUES ($1, TRUE, $2, 1, 15) RETURNING id`, [nombre, r])).rows[0].id;
    cliente = await nuevo('ZZ Cliente ficha', rutaA);
    ajeno = await nuevo('ZZ Cliente de otra ruta', rutaB);
  });

  after(async () => { if (db) { await db.query('ROLLBACK'); await db.end(); } });

  test('cambia la rotación, y queda en la bitácora con quién y el antes y después', async () => {
    const c = await ficha.corregirFicha(cliente, { rotacionDias: 22 }, quien());
    assert.equal(c.rotacion_dias, 22);
    const { rows: [b] } = await db.query(
      `SELECT usuario_id, cambios FROM bitacora_cambio WHERE entidad = 'cliente' AND entidad_id = $1 ORDER BY id DESC LIMIT 1`, [String(cliente)]);
    assert.equal(b.usuario_id, agente);
    assert.deepEqual(b.cambios.rotacion_dias, [15, 22]);
  });

  test('marca el punto exacto: se guarda como enlace de Maps con las coordenadas, que Waze y el seguimiento leen', async () => {
    const c = await ficha.corregirFicha(cliente, { ubicacion: { latitud: 10.0569, longitud: -84.4351 } }, quien());
    assert.equal(c.ubicacion_maps, 'https://www.google.com/maps?q=10.056900,-84.435100');
    const { coordenadasDe, enlacesParaLlegar } = await import(path.join(FRONT, 'utils', 'visitaPreventa.js'));
    assert.deepEqual(coordenadasDe(c.ubicacion_maps), { lat: 10.0569, lng: -84.4351 });
    assert.equal(enlacesParaLlegar(c.ubicacion_maps).waze, 'https://waze.com/ul?ll=10.0569,-84.4351&navigate=yes');
  });

  test('lo que no vale se rechaza: rotación fuera de 1–365, punto fuera de Costa Rica, nada para cambiar', async () => {
    const mal = (datos, estado = 400) => assert.rejects(ficha.corregirFicha(cliente, datos, quien()), (e) => e.status === estado, JSON.stringify(datos));
    for (const rotacionDias of [0, 366, 'x', null, '', 7.5]) await mal({ rotacionDias });
    await mal({ ubicacion: { latitud: 0, longitud: 0 } });
    await mal({ ubicacion: { latitud: 40.4, longitud: -3.7 } });
    await mal({ ubicacion: { latitud: 10 } });
    await mal({ ubicacion: null });
    await mal({});
    await assert.rejects(ficha.corregirFicha(999999999, { rotacionDias: 7 }, quien()), (e) => e.status === 404);
  });

  test('el agente solo toca clientes de sus rutas (403), también por el controlador', async () => {
    await assert.rejects(ficha.corregirFicha(ajeno, { rotacionDias: 7 }, quien()), (e) => e.status === 403);
    const res = {}; res.set = () => res; res.status = (c) => { res.estado = c; return res; }; res.json = (b) => { res.cuerpo = b; return res; };
    await preventa.corregirFicha({ usuario: { id: agente }, permisos: { esAdmin: false, modulos: new Set(['preventa']) },
      params: { id: String(ajeno) }, body: { rotacionDias: 7 } }, res);
    assert.equal(res.estado, 403);
    const { rows: [c] } = await db.query('SELECT rotacion_dias FROM cliente WHERE id = $1', [ajeno]);
    assert.equal(c.rotacion_dias, 15, 'no cambió nada');
  });

  test('la agenda ya lo trae con la rotación nueva y la ubicación', async () => {
    const { clientes } = await require('../src/modules/preventa/preventa.service').agenda({ rutaId: String(rutaA) });
    const c = clientes.find(x => x.id === cliente);
    assert.equal(c.rotacion.dias, 22);
    assert.equal(c.ubicacion_maps, 'https://www.google.com/maps?q=10.056900,-84.435100');
  });

  test('el seguimiento muestra lo que corrigió, sin contarlo como visita', async () => {
    const d = await seguimiento.dia({ usuarioId: agente });
    const fichas = d.recorrido.filter(p => p.tipo === 'ficha');
    assert.equal(fichas.length, 2);
    assert.deepEqual(fichas[0].ficha.rotacion, { antes: 15, despues: 22 });
    assert.deepEqual(fichas[1].ficha.ubicacion, { antes: null, despues: 'https://www.google.com/maps?q=10.056900,-84.435100' });
    assert.equal(d.resumen.fichasCorregidas, 2);
    assert.equal(d.resumen.clientesVisitados, 0);
  });
});

describe('la pantalla', () => {
  test('la visita ofrece cambiar la rotación y marcar o corregir el punto en el mapa', () => {
    const d = leer('components', 'preventa', 'DetalleVisita.jsx');
    assert.match(d, /onClick=\{\(\) => setEditando\('rotacion'\)\}[^>]*>Cambiar rotación<\/Boton>/);
    assert.match(d, /\{llegar\.maps \? 'Corregir en el mapa' : 'Marcar en el mapa'\}/);
  });

  test('el mapa se carga aparte, con OpenStreetMap y su atribución, y el marcador se arrastra', () => {
    assert.match(leer('components', 'preventa', 'ModalUbicacionCliente.jsx'), /const MapaUbicacion = lazy\(\(\) => import\('\.\/MapaUbicacion'\)\)/);
    const m = leer('components', 'preventa', 'MapaUbicacion.jsx');
    assert.match(m, /L\.tileLayer\('https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png'/);
    assert.match(m, /attribution: '&copy; OpenStreetMap'/);
    assert.match(m, /draggable: true/);
    assert.match(m, /m\.on\('click'/);
    const pkg = JSON.parse(fs.readFileSync(path.join(FRONT, '..', 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies.leaflet, '^1.9.4');
  });

  test('«Usar mi ubicación» pone el punto con el GPS; sin GPS lo dice y se marca a mano', () => {
    const u = leer('components', 'preventa', 'ModalUbicacionCliente.jsx');
    assert.match(u, /const u = await tomarUbicacion\(\)/);
    assert.match(u, /setPunto\(\{ lat: u\.latitud, lng: u\.longitud \}\)/);
    assert.match(u, /Marcá el punto a mano/);
    assert.match(u, /disabled=\{!punto\}/);
  });
});
