#!/usr/bin/env node
/** Solo SQL READ ONLY; guarda conteos/huellas, nunca filas ni credenciales. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { fueraDeGit } = require('./lib/ensayo-corte');
const { capturarEstado, compararHistoria, verificarCero } = require('./lib/auditoria-operacion');

async function main() {
  const args = {};
  for (const argumento of process.argv.slice(2)) {
    const m = /^--(salida|referencia)=(.+)$/.exec(argumento);
    if (!m || args[m[1]] || !path.isAbsolute(m[2])) throw Error('Argumentos inválidos.');
    args[m[1]] = m[2];
  }
  if (!args.salida) throw Error('Usar --salida=/ruta/privada/nuevo.json [--referencia=/ruta/antes.json]');
  await fueraDeGit(args.salida);
  const padre = path.dirname(args.salida);
  if (await fs.realpath(padre) !== padre || ((await fs.stat(padre)).mode & 0o077)) {
    throw Error('La salida exige carpeta privada0700 sin enlaces.');
  }
  let referencia = null;
  if (args.referencia) {
    const st = await fs.lstat(args.referencia);
    if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077)) throw Error('Referencia privada0600 requerida.');
    referencia = JSON.parse(await fs.readFile(args.referencia, 'utf8'));
    if (referencia.version !== 1) throw Error('Referencia inválida.');
  }
  require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
  const g = require('../../config/aislado');
  g.asegurarBaseLocal();
  // Esta herramienta no permite la excepción de base remota, aunque se haya
  // autorizado en otro proceso. No crear el Pool hasta verificar localhost5434.
  const url = new URL(process.env.DATABASE_URL);
  if (!g.esBaseLocal(url.toString()) || url.port !== '5434') throw Error('La auditoría exige PostgreSQL local5434.');
  const { pool } = require('../../config/database');
  let archivo;
  try {
    archivo = await fs.open(args.salida, 'wx', 0o600);
    const estado = await capturarEstado(pool, referencia);
    const diferencias = referencia ? compararHistoria(referencia, estado) : [];
    const fallos = verificarCero(estado);
    await archivo.writeFile(JSON.stringify({ ...estado, diferencias, fallos }, null, 2) + '\n');
    console.log(JSON.stringify({ soloLectura: true, tablas: Object.keys(estado.tablas).length,
      diferencias: diferencias.length, fallos: fallos.length }));
    process.exitCode = diferencias.length || fallos.length ? 2 : 0;
  } finally {
    await archivo?.close();
    await pool.end();
  }
}
if (require.main === module) main().catch(() => {
  console.error('Auditoría incompleta; no se modificaron datos.');
  process.exitCode = 1;
});
module.exports = { main };
