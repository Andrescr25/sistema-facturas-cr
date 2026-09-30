/**
 * WhatsApp DENTRO del sistema, con Baileys (2026-09-29, decisión del usuario).
 *
 * Antes los mensajes salían por Evolution API, un servicio aparte en Render
 * gratis que se suspendía antes de terminar el mes. Evolution usa Baileys
 * por dentro: esto es lo mismo, sin el servicio del medio, en el servidor que
 * sí se paga.
 *
 * Se enciende con WHATSAPP_PROVEEDOR=interno. Sin esa variable no hace nada
 * —ni tablas, ni conexión—: el backend local de desarrollo (que usa la base
 * de producción) no le disputa la sesión al servidor de Render.
 *
 * EL CICLO
 *  1. Tomar el turno (turno.js): una sola copia del servidor conectada.
 *  2. Con teléfono vinculado, conectar y mantenerse conectado.
 *  3. Sin teléfono vinculado, no conectar hasta que alguien pida vincular
 *     desde Configuración: con el QR (WhatsApp → Dispositivos vinculados →
 *     Vincular un dispositivo, y se apunta la cámara) o con un código de 8
 *     caracteres (… → Vincular con el número de teléfono).
 *
 * EL "NAVEGADOR" TIENE QUE SER UNO QUE WHATSAPP CONOZCA (2026-09-29). Con
 * `Browsers.ubuntu('Sistema Facturas')` Baileys declaraba el dispositivo como
 * "otro cliente web" (companion-reg-client-utils.js) y WhatsApp rechazaba
 * toda vinculación: "No se pudo vincular el dispositivo", código tras
 * código. Con 'Chrome' sale en el teléfono como "Chrome (Ubuntu)".
 *
 * LO QUE NO HACE
 *  - No aparece "en línea" (markOnlineOnConnect: false): si lo hiciera, el
 *    teléfono del dueño dejaría de sonar con cada mensaje que le llega.
 *  - No baja el historial de chats: solo manda.
 */

const os = require('os');
const crypto = require('crypto');
const sesion = require('./sesionDb');
const turno = require('./turno');

const DURACION_TURNO_S = 60;
const CICLO_CON_TURNO_MS = 20000;
const CICLO_SIN_TURNO_MS = 5000;
const ESPERA_CODIGO_MS = 20000;
const PAUSA_TRAS_REEMPLAZO_MS = 60000;
const MENSAJES_RECORDADOS = 200;
// Ver arriba: el segundo valor TIENE que ser un navegador conocido.
const NAVEGADOR = ['Ubuntu', 'Chrome', '22.04.4'];

const dueno = `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;

let baileys = null;
let sock = null;
let detenido = false;
let temporizador = null;
let reintentos = 0;
let noAntesDe = 0;
let pedidoDeVinculo = null; // { modo: 'qr'|'codigo', numero, resolver, rechazar, timeout }
const recientes = new Map(); // id → mensaje: WhatsApp los pide de nuevo si un reenvío falla

const estado = {
  habilitado: false,
  conTurno: false,
  vinculado: false,
  conectado: false,
  numero: null,
  nombre: null,
  codigo: null,
  qr: null, // el QR vigente mientras se vincula con QR; WhatsApp lo renueva cada ~20 s
  ultimoError: null,
  conectadoDesde: null
};

const silencioso = {
  level: 'silent',
  child() { return this; },
  trace() {}, debug() {}, info() {}, warn() {},
  error(...a) { if (process.env.WHATSAPP_DEBUG) console.error('[WhatsApp]', ...a); },
  fatal(...a) { console.error('[WhatsApp]', ...a); }
};

function habilitado() {
  return process.env.WHATSAPP_PROVEEDOR === 'interno';
}

function falla(codigo, mensaje, status = 503) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  e.status = status;
  return e;
}

async function cargarBaileys() {
  if (!baileys) baileys = await import('baileys');
  return baileys;
}

// ---------------------------------------------------------------- conexión

async function conectar({ forzar = false } = {}) {
  if (sock || detenido || !estado.conTurno) return;
  if (Date.now() < noAntesDe) return;
  const b = await cargarBaileys();
  const { state, saveCreds } = await sesion.usarSesionDb(b);
  estado.vinculado = sesion.sesionCompleta(state.creds);
  // Sin vínculo y sin nadie pidiéndolo, conectar solo generaría códigos QR
  // que nadie mira. `forzar`: el reinicio que WhatsApp pide justo después de
  // escribir el código, cuando la sesión todavía no dice "registrada".
  if (!estado.vinculado && !pedidoDeVinculo && !forzar) return;

  let version;
  try { ({ version } = await b.fetchLatestBaileysVersion()); } catch { /* la que trae la librería */ }

  sock = b.default({
    version,
    auth: { creds: state.creds, keys: b.makeCacheableSignalKeyStore(state.keys, silencioso) },
    browser: NAVEGADOR,
    logger: silencioso,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    getMessage: async (key) => recientes.get(key.id)?.message
  });
  const este = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u) => manejarConexion(este, u).catch((e) => {
    estado.ultimoError = e.message;
  }));
}

async function manejarConexion(este, { connection, lastDisconnect, qr }) {
  if (este !== sock) return; // eventos de un socket que ya se reemplazó

  if (qr && pedidoDeVinculo?.modo === 'qr') {
    // Cada QR nuevo reemplaza al anterior: la pantalla pregunta seguido.
    estado.qr = qr;
    clearTimeout(pedidoDeVinculo.timeout);
    pedidoDeVinculo.resolver({ qr });
  } else if (qr && pedidoDeVinculo && !estado.codigo) {
    const pedido = pedidoDeVinculo;
    try {
      const codigo = await sock.requestPairingCode(pedido.numero);
      estado.codigo = codigo;
      // El código ya está en pantalla: se deja de contar el plazo para
      // obtenerlo, pero el pedido sigue abierto hasta que lo escriban en el
      // teléfono (o hasta que WhatsApp lo dé por vencido y cierre).
      clearTimeout(pedido.timeout);
      pedido.resolver(codigo);
    } catch (e) {
      pedido.rechazar(falla('CODIGO', `WhatsApp no dio el código de vinculación: ${e.message}`, 502));
      terminarPedido();
    }
  }

  if (connection === 'open') {
    const b = await cargarBaileys();
    estado.conectado = true;
    estado.vinculado = true;
    estado.codigo = null;
    estado.qr = null;
    estado.ultimoError = null;
    estado.conectadoDesde = new Date().toISOString();
    estado.numero = b.jidNormalizedUser(sock.user?.id || '').split('@')[0] || null;
    estado.nombre = sock.user?.name || sock.user?.verifiedName || null;
    reintentos = 0;
    terminarPedido();
    console.log(`📱 WhatsApp conectado (${estado.numero}).`);
  }

  if (connection === 'close') {
    const b = await cargarBaileys();
    const motivo = lastDisconnect?.error?.output?.statusCode;
    const R = b.DisconnectReason;
    estado.conectado = false;
    sock = null;

    if (motivo === R.loggedOut) {
      // El teléfono sacó a este dispositivo (o se desvinculó desde acá).
      await sesion.borrarSesion();
      Object.assign(estado, { vinculado: false, numero: null, nombre: null, codigo: null, qr: null });
      estado.ultimoError = 'El teléfono desvinculó este sistema. Vuelva a vincularlo en Configuración.';
      terminarPedido(falla('DESVINCULADO', estado.ultimoError));
      return;
    }
    if (motivo === R.connectionReplaced) {
      // Otra copia se conectó con esta sesión. No se pelea: el turno decide.
      estado.ultimoError = 'Otra conexión con esta sesión tomó el lugar.';
      noAntesDe = Date.now() + PAUSA_TRAS_REEMPLAZO_MS;
      return;
    }
    if (motivo === R.restartRequired) {
      // Normal justo después de escribir el código en el teléfono.
      await conectar({ forzar: true });
      return;
    }
    if (!estado.vinculado && !(await sesion.hayVinculo())) {
      // Se estaba vinculando y el QR o el código vencieron sin usarse.
      const eraQr = pedidoDeVinculo?.modo === 'qr' || estado.qr;
      estado.codigo = null;
      estado.qr = null;
      estado.ultimoError = eraQr ? 'El QR venció sin escanearse.' : 'El código de vinculación venció sin usarse.';
      terminarPedido(falla('CODIGO_VENCIDO', estado.ultimoError, 408));
      return;
    }
    reintentos++;
    const espera = Math.min(30000, 1000 * 2 ** Math.min(reintentos, 5));
    estado.ultimoError = `Conexión perdida (${motivo ?? 'sin motivo'}); reintentando en ${Math.round(espera / 1000)} s.`;
    setTimeout(() => conectar().catch((e) => { estado.ultimoError = e.message; }), espera);
  }
}

function terminarPedido(error) {
  if (!pedidoDeVinculo) return;
  clearTimeout(pedidoDeVinculo.timeout);
  if (error) pedidoDeVinculo.rechazar(error);
  pedidoDeVinculo = null;
}

function cerrarSocket() {
  if (!sock) return;
  const s = sock;
  sock = null;
  estado.conectado = false;
  try { s.end(undefined); } catch { /* ya estaba cerrado */ }
}

// ------------------------------------------------------------------ turno

async function ciclo() {
  if (detenido) return;
  try {
    const tengo = await turno.tomar(dueno, DURACION_TURNO_S);
    if (tengo && !estado.conTurno) {
      estado.conTurno = true;
      estado.vinculado = await sesion.hayVinculo();
    }
    if (!tengo && estado.conTurno) {
      estado.conTurno = false;
      cerrarSocket();
    }
    if (estado.conTurno && !sock) await conectar();
  } catch (e) {
    // Un tropiezo de la base no suelta la conexión: el turno dura 60 s.
    estado.ultimoError = `No se pudo renovar el turno: ${e.message}`;
  }
  if (!detenido) temporizador = setTimeout(ciclo, estado.conTurno ? CICLO_CON_TURNO_MS : CICLO_SIN_TURNO_MS);
}

async function iniciar() {
  if (!habilitado() || estado.habilitado) return;
  estado.habilitado = true;
  detenido = false;
  await sesion.asegurarTabla();
  await turno.asegurarTabla();
  estado.vinculado = await sesion.hayVinculo();
  console.log(`📱 WhatsApp interno activado (${estado.vinculado ? 'teléfono vinculado' : 'sin teléfono vinculado'}).`);
  await ciclo();
}

/** Al apagarse: cierra SIN desvincular y suelta el turno para la copia nueva. */
async function detener() {
  detenido = true;
  clearTimeout(temporizador);
  cerrarSocket();
  if (estado.habilitado) await turno.soltar(dueno).catch(() => {});
}

// -------------------------------------------------------------- acciones

/**
 * Empieza a vincular un teléfono. Solo la copia con el turno puede hacerlo.
 *   { modo: 'qr' }                  → { qr }: el texto del QR (el primero; los
 *                                     siguientes salen en estado().qr)
 *   { modo: 'codigo', numero }      → el código de 8 caracteres para `numero`
 *                                     (con código de país)
 */
async function vincular({ modo = 'qr', numero = null } = {}) {
  if (!habilitado()) throw falla('APAGADO', 'WhatsApp interno está apagado (falta WHATSAPP_PROVEEDOR=interno en el servidor).');
  if (!estado.conTurno) throw falla('SIN_TURNO', 'El servidor se está reiniciando. Intente en unos segundos.');
  if (estado.vinculado) throw falla('YA_VINCULADO', `Ya hay un teléfono vinculado (${estado.numero || 'conectando'}). Desvincúlelo primero.`, 409);
  if (pedidoDeVinculo) terminarPedido(falla('REEMPLAZADO', 'Se pidió otro código.'));
  if (modo === 'codigo' && !numero) throw falla('SIN_NUMERO', 'Falta el número del teléfono.', 400);
  cerrarSocket();
  await sesion.borrarSesion(); // una vinculación a medias no se reutiliza
  estado.codigo = null;
  estado.qr = null;
  estado.ultimoError = null;
  noAntesDe = 0;

  const resultado = new Promise((resolver, rechazar) => {
    pedidoDeVinculo = {
      modo, numero, resolver, rechazar,
      timeout: setTimeout(() => terminarPedido(falla('SIN_CODIGO', 'WhatsApp no respondió a tiempo. Intente de nuevo.', 504)), ESPERA_CODIGO_MS)
    };
  });
  await conectar();
  return resultado;
}

async function desvincular() {
  if (!habilitado()) throw falla('APAGADO', 'WhatsApp interno está apagado.');
  terminarPedido(falla('CANCELADO', 'Se canceló la vinculación.'));
  if (sock && estado.conectado) {
    try { await sock.logout(); } catch { /* igual se borra abajo */ }
  }
  cerrarSocket();
  await sesion.borrarSesion();
  Object.assign(estado, { vinculado: false, conectado: false, numero: null, nombre: null, codigo: null, qr: null, ultimoError: null });
}

/** Espera hasta `ms` a que la conexión esté abierta. */
async function esperarConexion(ms) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (estado.conectado && sock) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return estado.conectado && !!sock;
}

async function jidDe(numero) {
  const [r] = (await sock.onWhatsApp(`${numero}@s.whatsapp.net`)) || [];
  if (!r?.exists) throw falla('SIN_WHATSAPP', `El número no tiene WhatsApp.`, 400);
  return r.jid;
}

function recordar(enviado) {
  if (!enviado?.key?.id) return;
  recientes.set(enviado.key.id, enviado);
  if (recientes.size > MENSAJES_RECORDADOS) recientes.delete(recientes.keys().next().value);
}

async function enviar(numero, contenido) {
  if (!estado.conectado || !sock) throw falla('SIN_CONEXION', 'WhatsApp no está conectado en este momento.');
  const jid = await jidDe(numero);
  const enviado = await sock.sendMessage(jid, contenido);
  recordar(enviado);
  return enviado;
}

const enviarTexto = (numero, texto) => enviar(numero, { text: texto });

const enviarDocumento = (numero, pdf, nombreArchivo, pie) => enviar(numero, {
  document: pdf,
  mimetype: 'application/pdf',
  fileName: nombreArchivo,
  ...(pie ? { caption: pie } : {})
});

function obtenerEstado() {
  return { ...estado, habilitado: habilitado() };
}

module.exports = {
  habilitado, iniciar, detener, vincular, desvincular, esperarConexion,
  enviarTexto, enviarDocumento, estado: obtenerEstado,
  // para las pruebas
  _NAVEGADOR: NAVEGADOR,
  _manejarConexion: manejarConexion,
  _conectar: conectar,
  _usar: ({ modulo, socket, conTurno } = {}) => {
    if (modulo) baileys = modulo;
    if (socket !== undefined) sock = socket;
    if (conTurno !== undefined) estado.conTurno = conTurno;
    return { estado, socket: () => sock };
  }
};
