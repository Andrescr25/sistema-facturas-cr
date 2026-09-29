/**
 * WhatsApp adentro del sistema, con Baileys (2026-09-29): antes era Evolution
 * API en un servicio aparte de Render gratis que se suspendía.
 *
 * LO QUE SE CUIDA
 *  - Apagado por omisión: sin WHATSAPP_PROVEEDOR=interno no toca la base. El
 *    backend local usa la base de producción y no debe disputarle la sesión
 *    al servidor de Render.
 *  - La sesión sobrevive en la base, con los Buffer intactos, y una llave
 *    en null se BORRA (Baileys lo usa para descartar llaves viejas).
 *  - Una sola copia del servidor conectada (el turno): si WhatsApp avisa que
 *    otra conexión tomó el lugar, no se pelea.
 *  - Si el teléfono desvincula, se borra la sesión y no se reintenta.
 *  - Antes de mandar se pregunta si el número tiene WhatsApp.
 *  - Mientras no esté vinculado adentro, todo sigue saliendo por Evolution.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutas = ['sesionDb', 'turno', 'conexion', 'whatsapp.client', 'index'].map((n) =>
  require.resolve(`../src/integrations/whatsapp/${n}`));

let consultas;
let filas; // la tabla whatsapp_sesion en memoria

function montar({ proveedor } = {}) {
  for (const r of [rutaDb, ...rutas]) delete require.cache[r];
  if (proveedor) process.env.WHATSAPP_PROVEEDOR = proveedor; else delete process.env.WHATSAPP_PROVEEDOR;
  consultas = [];
  filas = new Map();
  // Esta base local ES producción: nada de este archivo llega a la real.
  const query = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    consultas.push(texto);
    if (/^INSERT INTO whatsapp_sesion/.test(texto)) {
      for (let i = 0; i < params.length; i += 2) filas.set(params[i], params[i + 1]);
      return { rows: [] };
    }
    if (/^SELECT valor FROM whatsapp_sesion WHERE clave = 'creds'/.test(texto)) {
      return { rows: filas.has('creds') ? [{ valor: filas.get('creds') }] : [] };
    }
    if (/^SELECT clave, valor FROM whatsapp_sesion/.test(texto)) {
      return { rows: params[0].filter((c) => filas.has(c)).map((c) => ({ clave: c, valor: filas.get(c) })) };
    }
    if (/^DELETE FROM whatsapp_sesion WHERE clave = ANY/.test(texto)) {
      params[0].forEach((c) => filas.delete(c));
      return { rows: [] };
    }
    if (/^DELETE FROM whatsapp_sesion$/.test(texto)) { filas.clear(); return { rows: [] }; }
    if (/whatsapp_turno/.test(texto)) return { rows: /^UPDATE whatsapp_turno SET dueno = \$1/.test(texto) ? [{ dueno: params[0] }] : [] };
    if (/^CREATE TABLE/.test(texto)) return { rows: [] };
    throw new Error(`consulta inesperada: ${texto}`);
  };
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query } };
  return {
    sesion: require(rutas[0]),
    turno: require(rutas[1]),
    conexion: require(rutas[2]),
    cliente: require(rutas[3])
  };
}

let baileys;
beforeEach(async () => { baileys = baileys || await import('baileys'); });
afterEach(() => { delete process.env.WHATSAPP_PROVEEDOR; });

/** Un socket de Baileys de mentira: registra lo que se le pide. */
function socketFalso({ tieneWhatsApp = true } = {}) {
  const s = {
    enviados: [], consultados: [], pedidosDeCodigo: [], salio: false, cerrado: false,
    user: { id: '50662984143:12@s.whatsapp.net', name: 'Tachi' },
    onWhatsApp: async (jid) => { s.consultados.push(jid); return [{ exists: tieneWhatsApp, jid }]; },
    sendMessage: async (jid, contenido) => { s.enviados.push({ jid, contenido }); return { key: { id: `m${s.enviados.length}` } }; },
    requestPairingCode: async (numero) => { s.pedidosDeCodigo.push(numero); return 'ABCD1234'; },
    logout: async () => { s.salio = true; },
    end: () => { s.cerrado = true; }
  };
  return s;
}

const cierre = (codigo) => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode: codigo } } } });

describe('apagado por omisión', () => {
  test('sin WHATSAPP_PROVEEDOR=interno no toca la base ni conecta', async () => {
    const { conexion } = montar();
    await conexion.iniciar();
    assert.equal(consultas.length, 0);
    assert.equal(conexion.estado().habilitado, false);
    await assert.rejects(() => conexion.vincular('50688887777'), (e) => e.codigo === 'APAGADO');
  });
});

describe('la sesión en la base', () => {
  test('los Buffer vuelven iguales, y una llave en null se borra', async () => {
    const { sesion } = montar({ proveedor: 'interno' });
    const { state, saveCreds } = await sesion.usarSesionDb(baileys);
    await saveCreds();
    const llave = { public: Buffer.from([1, 2, 3]), private: Buffer.from([9, 8, 7]) };
    await state.keys.set({ 'pre-key': { 5: llave, 6: llave } });
    const leido = await state.keys.get('pre-key', ['5', '7']);
    assert.ok(Buffer.isBuffer(leido['5'].public) && leido['5'].public.equals(llave.public));
    assert.equal(leido['7'], null);

    await state.keys.set({ 'pre-key': { 5: null } });
    assert.equal(filas.has('pre-key-5'), false);
    assert.equal(filas.has('pre-key-6'), true);

    const otra = await sesion.usarSesionDb(baileys);
    assert.ok(otra.state.creds.noiseKey.private.equals(state.creds.noiseKey.private), 'la identidad sobrevive a un reinicio');
  });

  test('"vinculado" es que la sesión esté registrada', async () => {
    const { sesion } = montar({ proveedor: 'interno' });
    assert.equal(await sesion.hayVinculo(), false);
    filas.set('creds', JSON.stringify({ registered: true }));
    assert.equal(await sesion.hayVinculo(), true);
    await sesion.borrarSesion();
    assert.equal(await sesion.hayVinculo(), false);
  });
});

describe('el turno: una sola copia conectada', () => {
  test('se toma si es propio, si nadie lo tiene o si venció', () => {
    const { turno } = montar();
    assert.match(turno.SQL_TABLA, /CREATE TABLE IF NOT EXISTS whatsapp_turno/);
    const fuente = require('fs').readFileSync(rutas[1], 'utf8');
    assert.match(fuente, /WHERE id = 1 AND \(dueno = \$1 OR dueno IS NULL OR vence_en < now\(\)\)/);
  });
});

describe('la conexión', () => {
  test('al abrir queda conectada, con el número del teléfono', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    const sock = socketFalso();
    conexion._usar({ modulo: baileys, socket: sock, conTurno: true });
    await conexion._manejarConexion(sock, { connection: 'open' });
    const e = conexion.estado();
    assert.equal(e.conectado, true);
    assert.equal(e.numero, '50662984143');
    assert.equal(e.nombre, 'Tachi');
  });

  test('si el teléfono la desvincula, se borra la sesión y no se reintenta', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    filas.set('creds', JSON.stringify({ registered: true }));
    const sock = socketFalso();
    const { socket } = conexion._usar({ modulo: baileys, socket: sock, conTurno: true });
    await conexion._manejarConexion(sock, cierre(baileys.DisconnectReason.loggedOut));
    assert.equal(filas.size, 0);
    assert.equal(conexion.estado().vinculado, false);
    assert.match(conexion.estado().ultimoError, /desvinculó/);
    assert.equal(socket(), null);
  });

  test('si otra conexión tomó el lugar, no se pelea', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    const sock = socketFalso();
    conexion._usar({ modulo: baileys, socket: sock, conTurno: true });
    await conexion._manejarConexion(sock, cierre(baileys.DisconnectReason.connectionReplaced));
    assert.match(conexion.estado().ultimoError, /tomó el lugar/);
    assert.equal(consultas.filter((q) => /whatsapp_sesion/.test(q)).length, 0, 'ni reconecta ni borra nada');
  });

  test('los eventos de un socket viejo no tocan el estado', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    const viejo = socketFalso();
    conexion._usar({ modulo: baileys, socket: socketFalso(), conTurno: true });
    await conexion._manejarConexion(viejo, cierre(baileys.DisconnectReason.loggedOut));
    assert.equal(conexion.estado().ultimoError, null);
  });
});

describe('mandar', () => {
  test('pregunta si el número tiene WhatsApp y manda el PDF como documento', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    const sock = socketFalso();
    conexion._usar({ modulo: baileys, socket: sock, conTurno: true });
    await conexion._manejarConexion(sock, { connection: 'open' });
    const pdf = Buffer.from('%PDF-1.4');
    await conexion.enviarDocumento('50688887777', pdf, 'Factura 5263.pdf', 'Su factura');
    assert.deepEqual(sock.consultados, ['50688887777@s.whatsapp.net']);
    assert.deepEqual(sock.enviados[0].contenido, { document: pdf, mimetype: 'application/pdf', fileName: 'Factura 5263.pdf', caption: 'Su factura' });
  });

  test('un número sin WhatsApp no se intenta', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    const sock = socketFalso({ tieneWhatsApp: false });
    conexion._usar({ modulo: baileys, socket: sock, conTurno: true });
    await conexion._manejarConexion(sock, { connection: 'open' });
    await assert.rejects(() => conexion.enviarTexto('50622221111', 'hola'), (e) => e.codigo === 'SIN_WHATSAPP');
    assert.equal(sock.enviados.length, 0);
  });

  test('el cliente elige el canal de adentro si está conectado, y traduce el error', async () => {
    const { conexion, cliente } = montar({ proveedor: 'interno' });
    const sock = socketFalso({ tieneWhatsApp: false });
    conexion._usar({ modulo: baileys, socket: sock, conTurno: true });
    await conexion._manejarConexion(sock, { connection: 'open' });
    await assert.rejects(
      () => cliente.enviarTexto({ telefono: '2222-1111', mensaje: 'Su saldo', sujeto: 'cliente' }),
      (e) => e.status === 400 && /no tenga WhatsApp/.test(e.message)
    );
    const sockBien = socketFalso();
    conexion._usar({ socket: sockBien });
    const r = await cliente.enviarTexto({ telefono: '8888-7777', mensaje: 'Su saldo' });
    assert.equal(r.via, 'interno');
    assert.deepEqual(sockBien.enviados[0], { jid: '50688887777@s.whatsapp.net', contenido: { text: 'Su saldo' } });
  });

  test('sin vincular adentro y sin Evolution, el error dice dónde vincular', async () => {
    const antes = process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_API_URL;
    try {
      const { cliente } = montar({ proveedor: 'interno' });
      await assert.rejects(() => cliente.enviarTexto({ telefono: '8888-7777', mensaje: 'x' }),
        (e) => e.status === 503 && /Configuración → WhatsApp/.test(e.message));
    } finally {
      if (antes !== undefined) process.env.WHATSAPP_API_URL = antes;
    }
  });
});

describe('vincular', () => {
  /** Baileys de mentira: cada socket nuevo avisa un QR, como el de verdad. */
  function baileysFalso() {
    const creados = [];
    const modulo = {
      ...baileys,
      fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
      makeCacheableSignalKeyStore: (keys) => keys,
      default: () => {
        const s = socketFalso();
        const oyentes = {};
        s.ev = { on: (evento, fn) => { (oyentes[evento] = oyentes[evento] || []).push(fn); } };
        s.emitir = (evento, dato) => (oyentes[evento] || []).forEach((fn) => fn(dato));
        creados.push(s);
        setImmediate(() => s.emitir('connection.update', { connection: 'connecting', qr: `qr-${creados.length}` }));
        return s;
      }
    };
    return { modulo, creados };
  }

  test('pide el código para ese número y lo entrega', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    const { modulo, creados } = baileysFalso();
    conexion._usar({ modulo, socket: null, conTurno: true });
    const codigo = await conexion.vincular('50662984143');
    assert.equal(codigo, 'ABCD1234');
    assert.deepEqual(creados[0].pedidosDeCodigo, ['50662984143']);
    assert.equal(conexion.estado().codigo, 'ABCD1234');
  });

  test('escribir el código tarde igual termina de vincular (el reinicio que pide WhatsApp)', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    const { modulo, creados } = baileysFalso();
    const { socket } = conexion._usar({ modulo, socket: null, conTurno: true });
    await conexion.vincular('50662984143');
    // Mucho después, la persona escribe el código: WhatsApp cierra con 515.
    await conexion._manejarConexion(socket(), cierre(baileys.DisconnectReason.restartRequired));
    assert.equal(creados.length, 2, 'se reconecta aunque la sesión todavía no diga "registrada"');
    await conexion._manejarConexion(socket(), { connection: 'open' });
    assert.equal(conexion.estado().conectado, true);
    assert.equal(conexion.estado().codigo, null);
  });

  test('sin el turno no se vincula: otra copia del servidor lo tiene', async () => {
    const { conexion } = montar({ proveedor: 'interno' });
    conexion._usar({ modulo: baileysFalso().modulo, socket: null, conTurno: false });
    await assert.rejects(() => conexion.vincular('50662984143'), (e) => e.codigo === 'SIN_TURNO');
  });
});
