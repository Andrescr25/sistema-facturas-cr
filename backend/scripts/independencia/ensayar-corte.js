#!/usr/bin/env node
/**
 * Restaura un dump privado en una base NUEVA tachi_ensayo_* del contenedor
 * local. No reemplaza bases existentes ni conecta a producción. Carga GET,
 * repite, verifica ceros/041/series y concilia sin arrancar el servidor.
 * Código 0: ensayo técnico sin diferencias; 2: diferencias; 1: incompleto.
 * Ningún resultado habilita el corte ni afirma recepción real de mensajes.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { argumentos, revisarArchivos, estado, verificarEstado } = require('./lib/ensayo-corte');
const BACKEND = path.resolve(__dirname, '../..');

async function proceso(comando, args, { entrada, env = process.env, permitidos = [0] } = {}) {
  return new Promise((resolve, reject) => {
    const hijo = spawn(comando, args, { cwd: BACKEND, env, stdio: ['pipe', 'pipe', 'pipe'] });
    // No conservar errores crudos de procesos/transportes. La base se deja
    // para inspección y el manifiesto identifica la fase que no terminó.
    hijo.stdout.resume(); hijo.stderr.resume();
    hijo.on('error', () => reject(new Error('No se pudo iniciar la fase del ensayo.')));
    hijo.stdin.on('error', () => {});
    hijo.on('close', codigo => permitidos.includes(codigo) ? resolve(codigo) : reject(new Error(`Fase incompleta (código ${codigo ?? 'interrumpida'}).`)));
    hijo.stdin.end(entrada);
  });
}

async function main() {
  const o = argumentos(process.argv.slice(2));
  await revisarArchivos(o);
  require('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });
  process.env.BASE_ENSAYO = o.base;
  require('./lib/base-ensayo');
  const { Pool } = require('pg');
  const u = new URL(process.env.DATABASE_URL); u.pathname = '/postgres';
  const admin = new Pool({ connectionString: u.toString(), max: 1 });
  let pool, creado = false, manifiesto;
  const informe = { version: 1, base: o.base, periodo: o.p, pasadas: o.pasadas, fases: [],
    completo: false, corte_autorizado: false, inicio: new Date().toISOString(),
    verificaciones_externas: ['Conteo físico real en producción', 'Origen congelado y última carga',
      'Recepción real de correo y WhatsApp', 'Servidor definitivo y respaldo restaurable',
      'Colas de tablets vacías antes de retirar compatibilidad', 'Datos pendientes y revisión fiscal/Hacienda excluida'] };
  const guardar = () => fs.writeFile(manifiesto, JSON.stringify(informe, null, 2) + '\n', { mode: 0o600 });
  const fase = async (nombre, fn) => {
    informe.fase_actual = nombre; await guardar(); console.log(`→ ${nombre}`);
    const inicio = Date.now(); const codigo = await fn();
    informe.fases.push({ nombre, codigo: codigo ?? 0, ms: Date.now() - inicio }); await guardar();
  };
  try {
    if ((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [o.base])).rowCount) throw new Error('La base de ensayo ya existe; elegir un nombre nuevo.');
    await fs.mkdir(o.destino, { mode: 0o700 });
    manifiesto = path.join(o.destino, 'ensayo.json');
    const dump = await fs.readFile(o.dump);
    informe.origen = { bytes: dump.length, sha256: crypto.createHash('sha256').update(dump).digest('hex') };
    await guardar();
    await admin.query(`CREATE DATABASE ${o.base}`); creado = true;
    await fase('Restaurar copia privada', () => proceso('docker', ['exec', '-i', 'tachi-db-local', 'pg_restore',
      '-U', 'tachi', '-d', o.base, '--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error'], { entrada: dump }));
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    await fase('Verificar esquema de aplicación y excluir conversaciones', async () => {
      const r = (await pool.query(`SELECT to_regclass('public.usuario') IS NOT NULL AS tiene_usuarios,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name ~ '^[A-Z]') AS tablas_conversacion`)).rows[0];
      if (!r.tiene_usuarios || Number(r.tablas_conversacion)) throw new Error('Dump incompleto o incluye tablas privadas de conversaciones.');
    });
    const migraciones = (await fs.readdir(path.join(BACKEND, 'migrations/independencia'))).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
    const enlazar = new Set(['005', '007', '017', '018', '020', '023', '030', '031', '032', '035', '036', '037', '038', '039', '041']);
    const migrar = async (soloDatos = false) => {
      for (const m of migraciones.filter(m => !soloDatos || enlazar.has(m.slice(0, 3)))) {
        informe.migracion_actual = m;
        try { await pool.query(await fs.readFile(path.join(BACKEND, 'migrations/independencia', m), 'utf8')); }
        catch (e) { informe.codigo_sql = /^[A-Z0-9]{5}$/.test(e.code || '') ? e.code : 'desconocido'; throw e; }
      }
      if (soloDatos) {
        // 025 ya congeló lo pagado sin detalle al aplicar el esquema. Aquí
        // solo falta el proveedor que todavía no existía en aquella pasada.
        // No se recrea su vista: 028 la amplió y tiene la definición final.
        await pool.query(`UPDATE cuentas_por_pagar c SET proveedor_id=p.id FROM proveedor p
          WHERE c.proveedor_id IS NULL AND regexp_replace(p.identificacion,'\\D','','g')=regexp_replace(c.proveedor_cedula,'\\D','','g')`);
      }
    };
    await fase('Migraciones completas sobre copia del origen', migrar);
    const env = { ...process.env }; delete env.NODE_OPTIONS; delete env.NODE_TEST_CONTEXT;
    const cli = (nombre, args = [], permitidos = [0]) => proceso(process.execPath,
      ['--require', path.join(__dirname, 'lib/base-ensayo.js'), path.join(__dirname, nombre + '.js'), ...args], { env, permitidos });
    const pasadas = [];
    for (let n = 1; n <= o.pasadas; n++) {
      for (const s of ['cargar-configuracion', 'cargar-productos', 'cargar-contactos']) await fase(`Pasada ${n}: ${s}`, () => cli(s));
      // Las migraciones con datos enlazan maestras ya cargadas: compras del
      // buzón, mapeos y portal quedarían vacíos con un solo pase inicial.
      await fase(`Pasada ${n}: enlaces de datos tras maestras`, () => migrar(true));
      for (const s of ['cargar-facturas', 'cargar-pagos', 'cargar-notas-credito', 'cargar-debitos-ingreso', 'cargar-cotizaciones']) {
        await fase(`Pasada ${n}: ${s}`, () => cli(s, s === 'cargar-pagos' ? ['--pagina=5'] : []));
      }
      await fase(`Pasada ${n}: 041 tras facturas y notas`, async () => {
        // Los pedidos/faltantes antiguos también necesitan las facturas que
        // acabamos de cargar. 041 es la última de esta pasada de enlaces.
        await migrar(true);
        const e = await estado(pool); verificarEstado(e); pasadas.push(e); informe.estados = pasadas;
      });
    }
    informe.carga_repetible = pasadas.length === 2 && JSON.stringify(pasadas[0]) === JSON.stringify(pasadas[1]);
    const resultados = {};
    for (const s of ['ventas', 'cobros', 'notas-credito', 'compras']) {
      await fase(`Conciliar ${s}`, async () => {
        resultados[s] = await cli('conciliar-' + s, [`--desde=${o.p.desde}`, `--hasta=${o.p.hasta}`,
          `--salida=${path.join(o.destino, s + '.json')}`], [0, 2]); return resultados[s];
      });
    }
    informe.conciliaciones = resultados;
    informe.completo = true;
    informe.sin_diferencias = informe.carga_repetible && Object.values(resultados).every(c => c === 0);
    process.exitCode = informe.sin_diferencias ? 0 : 2;
    console.log(JSON.stringify({ completo: true, cargaRepetible: informe.carga_repetible, conciliaciones: resultados,
      corteAutorizado: false, destino: o.destino }));
  } catch (e) {
    if (manifiesto) { informe.error = 'Ensayo interrumpido; revisar la fase actual. No se certificó ni se habilitó el corte.'; }
    console.error(creado ? 'Ensayo incompleto; base desechable conservada para revisión.' : 'No se inició el ensayo: revisar argumentos, rutas privadas y nombre de base nuevo.');
    process.exitCode = 1;
  } finally {
    informe.fin = new Date().toISOString(); if (manifiesto) await guardar();
    if (pool) await pool.end(); await admin.end();
  }
}
if (require.main === module) main().catch(() => { console.error('Ensayo no iniciado: revisar parámetros y entorno local.'); process.exitCode = 1; });
module.exports = { main };
