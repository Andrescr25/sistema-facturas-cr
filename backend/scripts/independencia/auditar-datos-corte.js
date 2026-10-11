#!/usr/bin/env node
/** JSON privado con fichas pendientes. Solo SQL READ ONLY; no consulta Alegra. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { fueraDeGit } = require('./lib/ensayo-corte');
const { leerDatos } = require('./lib/datos-corte');
async function main() {
  const m = process.argv.length === 3 && /^--salida=(.+)$/.exec(process.argv[2]);
  if (!m || !path.isAbsolute(m[1])) throw new Error('Usar --salida=/ruta/privada/nuevo.json');
  const salida = path.resolve(m[1]); await fueraDeGit(salida);
  if (await fs.realpath(path.dirname(salida)) !== path.dirname(salida)) throw new Error('Carpeta privada sin enlaces simbólicos.');
  require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
  require('../../config/aislado').asegurarBaseLocal();
  const { pool } = require('../../config/database');
  let archivo;
  try {
    archivo = await fs.open(salida, 'wx', 0o600);
    const datos = await leerDatos(pool); await archivo.writeFile(JSON.stringify(datos, null, 2) + '\n');
    console.log(JSON.stringify({ resumen: datos.resumen, salida, soloLectura: true }));
    process.exitCode = Object.values(datos.resumen).some(r => r.fichas) ? 2 : 0;
  } catch (e) { if (archivo) { await archivo.close(); archivo = null; await fs.unlink(salida); } throw e; }
  finally { if (archivo) await archivo.close(); await pool.end(); }
}
if (require.main === module) main().catch(() => { console.error('Auditoría de fichas incompleta; no se modificaron datos.'); process.exitCode = 1; });
