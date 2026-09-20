/**
 * Rama independencia-alegra: esta copia del sistema corre AISLADA.
 *
 * El `.env` es el mismo archivo para todas las ramas y apunta a la base de
 * producción, la que usa `main` todos los días. Si esta rama lo leyera tal
 * cual, cada cliente, producto o factura que se cree o edite mientras se
 * desarrolla caería sobre datos reales.
 *
 * Por eso, tres reglas:
 *
 * 1. `.env.aislado` (ignorado por git) se carga con prioridad: lo que diga
 *    ese archivo gana sobre `.env`, sin importar el orden en que se carguen.
 *
 * 2. La base tiene que ser local. Si no lo es, no se conecta y se detiene
 *    diciendo por qué. Se revisa en config/database.js y lib/prisma.js, que
 *    son las dos únicas puertas a la base: da igual si arranca el servidor,
 *    un script o una prueba.
 *
 * 3. Nada sale hacia el mundo real: escrituras a Alegra, mensajes de
 *    WhatsApp y correos quedan bloqueados, y el buzón de facturas de
 *    proveedor no se lee.
 *
 * Las llaves de escape existen para el día del corte y se prenden a
 * propósito, nunca por omisión:
 *   PERMITIR_BASE_REMOTA=true   deja usar una base que no es local
 *   PERMITIR_SALIDAS=true       deja escribir a Alegra, WhatsApp y correo
 *
 * Bajo `node --test` las salidas no se bloquean: las pruebas ya sustituyen
 * axios y los clientes por dobles, y bloquear ahí rompería justamente las
 * que verifican qué se manda. La base, en cambio, se exige local también en
 * pruebas.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ARCHIVO = path.join(__dirname, '..', '.env.aislado');
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

let cargado = false;

/** Carga `.env.aislado` por encima de lo que ya haya en el entorno. */
function cargarEntornoAislado() {
  if (cargado) return;
  cargado = true;
  if (fs.existsSync(ARCHIVO)) {
    dotenv.config({ path: ARCHIVO, override: true, quiet: true });
  }
}

function esBaseLocal(url) {
  try {
    return HOSTS_LOCALES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** ¿Se puede usar esta base? Pura: recibe el entorno para poder probarla. */
function revisarBase(env = process.env) {
  if (env.PERMITIR_BASE_REMOTA === 'true') {
    return { permitida: true, motivo: 'PERMITIR_BASE_REMOTA=true' };
  }
  if (!env.DATABASE_URL) {
    return { permitida: false, motivo: 'no hay DATABASE_URL (falta backend/.env.aislado)' };
  }
  if (!esBaseLocal(env.DATABASE_URL)) {
    let host = '(dirección ilegible)';
    try { host = new URL(env.DATABASE_URL).hostname; } catch { /* se queda ilegible */ }
    return { permitida: false, motivo: `DATABASE_URL apunta a ${host}, que no es una base local` };
  }
  return { permitida: true, motivo: 'base local' };
}

/** Se llama antes de abrir cualquier conexión. Lanza si la base no es local. */
function asegurarBaseLocal() {
  cargarEntornoAislado();
  const r = revisarBase();
  if (!r.permitida) {
    const e = new Error(
      `Rama aislada: no se conecta a la base porque ${r.motivo}. ` +
      'Esta rama solo trabaja contra la copia local (ver backend/.env.aislado ' +
      'y docs/checklist-independencia-alegra.md, sección 0).'
    );
    e.code = 'BASE_NO_AISLADA';
    throw e;
  }
}

/** ¿Hay que frenar lo que sale al mundo real? Pura, igual que revisarBase. */
function salidasBloqueadas(env = process.env) {
  if (env.PERMITIR_SALIDAS === 'true') return false;
  if (env.NODE_TEST_CONTEXT) return false;
  return true;
}

/**
 * ¿Se puede abrir una conexión al buzón de correo desde esta rama?
 *
 * Es OTRA llave, no `PERMITIR_SALIDAS`: el buzón no es un canal de salida
 * —no se manda nada, y `markSeen: false` no lo modifica—, es uno que esta
 * rama COMPARTE con producción. El riesgo real no es filtrar datos hacia
 * afuera, es que el monitoreo automático de acá compita con el de `main`
 * procesando el mismo correo dos veces. Un recuperador de un solo uso, que
 * lee el histórico y escribe solo en la base y el disco de esta rama, es un
 * riesgo bien distinto de encender por accidente el monitoreo continuo — y
 * por eso necesita su propia autorización explícita, no la misma que abre
 * Alegra o WhatsApp.
 *
 * ANTES ESTA GUARDA VIVÍA SOLO EN `emailService.startMonitoring()`: nada la
 * hacía cumplir en `connect()`, así que un código que llamara a `connect()`
 * directamente —sin pasar por `startMonitoring()`— se conectaba sin que
 * nada lo frenara. Ahora las dos funciones la revisan.
 */
function lecturaBuzonPermitida(env = process.env) {
  if (env.PERMITIR_LECTURA_BUZON === 'true') return true;
  if (env.NODE_TEST_CONTEXT) return true;
  return false;
}

/** El error cuando algo intenta abrir el buzón sin la llave de arriba. */
function errorLecturaBuzonBloqueada() {
  const e = new Error(
    'Rama aislada: no se lee el buzón de correo sin PERMITIR_LECTURA_BUZON=true. ' +
    'El buzón es el mismo que usa producción (ver config/aislado.js).'
  );
  e.status = 423;
  e.code = 'LECTURA_BUZON_BLOQUEADA';
  return e;
}

/** El error que devuelve cada canal bloqueado. 423 = recurso bloqueado. */
function errorSalidaBloqueada(accion) {
  const e = new Error(
    `Rama aislada: no se permite ${accion}. ` +
    'Mientras se desarrolla sin Alegra nada sale al mundo real (ver config/aislado.js).'
  );
  e.status = 423;
  e.code = 'SALIDA_BLOQUEADA';
  return e;
}

cargarEntornoAislado();

module.exports = {
  ARCHIVO,
  cargarEntornoAislado,
  esBaseLocal,
  revisarBase,
  asegurarBaseLocal,
  salidasBloqueadas,
  errorSalidaBloqueada,
  lecturaBuzonPermitida,
  errorLecturaBuzonBloqueada
};
