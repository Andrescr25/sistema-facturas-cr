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
  errorSalidaBloqueada
};
