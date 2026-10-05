#!/usr/bin/env node
/**
 * Solo GET. Guarda PDF/XML originales y huellas en una carpeta privada.
 * --todos --destino=/ruta/privada/ventas
 * o --desde=YYYY-MM-DD --hasta=YYYY-MM-DD --destino=/ruta/privada/ventas
 * 0: lectura archivada completa; 2: archivos pendientes; 1: lectura incompleta.
 * Repetir con el mismo alcance verifica y reutiliza; no sustituye el ensayo del corte.
 */
const path = require('node:path');
const { periodo } = require('./lib/conciliacion-ventas');
const { ErrorArchivo, archivar } = require('./lib/archivo-electronico');

function argumentos(args) {
  const v = {};
  for (const a of args) {
    if (a === '--todos' && !v.todos) { v.todos = true; continue; }
    const m = /^--(desde|hasta|destino|a-la-vez)=(.+)$/.exec(a);
    if (!m || v[m[1]]) throw new ErrorArchivo('Usar --todos o --desde/--hasta, y --destino=/ruta/privada/ventas.');
    v[m[1]] = m[2];
  }
  if (!v.destino || !path.isAbsolute(v.destino) || (v.todos && (v.desde || v.hasta))) throw new ErrorArchivo('Destino absoluto y un solo alcance: --todos o --desde/--hasta.');
  const aLaVez = v['a-la-vez'] == null ? 3 : Number(v['a-la-vez']);
  if (!Number.isInteger(aLaVez) || aLaVez < 1 || aLaVez > 5) throw new ErrorArchivo('Usar --a-la-vez=1 a 5.');
  return { destino: path.resolve(v.destino), p: v.todos ? null : periodo(v.desde, v.hasta), aLaVez };
}

function mensajeSeguro(e) {
  if (e instanceof ErrorArchivo) return e.message;
  return 'Descarga interrumpida. Los originales confirmados se conservan; revisar conexión y carpeta privada.';
}

function clienteLectura() {
  const axios = require('axios');
  const config = require('../../src/integrations/alegra/alegra.config');
  const api = axios.create({ baseURL: config.baseURL, timeout: config.timeout,
    auth: { username: config.credentials.user, password: config.credentials.token },
    maxRedirects: 0, headers: { Accept: 'application/json' } });
  // Sin los logs generales de Axios: los enlaces firmados no se escriben,
  // tampoco en los fallos. Solo se exponen los datos necesarios para reintentar.
  return { async get(ruta, params) {
    try { const r = await api.get(ruta, { params }); return { success: true, data: r.data }; }
    catch (e) { return { success: false, status: e.response?.status, error: e.code,
      data: { code: e.response?.data?.code, headers: e.response?.data?.headers } }; }
  } };
}

async function main() {
  const opciones = argumentos(process.argv.slice(2));
  require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
  require('../../config/aislado').asegurarBaseLocal();
  const m = await archivar({ ...opciones, client: clienteLectura(), avisar: console.log });
  console.log(JSON.stringify({ completo: m.completo, resumen: m.resumen, fallos: m.fallos.length,
    fueraDeLectura: m.fueraDeLectura.length, destino: opciones.destino }));
  process.exitCode = m.completo ? 0 : 2;
}

if (require.main === module) main().catch(e => { console.error(mensajeSeguro(e)); process.exitCode = 1; });
module.exports = { argumentos, mensajeSeguro, clienteLectura };
