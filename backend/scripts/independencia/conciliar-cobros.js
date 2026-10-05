#!/usr/bin/env node
/**
 * node scripts/independencia/conciliar-cobros.js --desde=2026-09-01 --hasta=2026-09-30 --salida=/ruta/privada/cobros.json
 * Solo GET y una instantánea local READ ONLY. No carga ni corrige pagos.
 * Salida 0 sin diferencias dentro del alcance, 2 con diferencias, 1 incompleto.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { argumentos, mensajeSeguro } = require('./conciliar-ventas');
const { ejecutar } = require('./lib/conciliacion-cobros');

async function main() {
  const { p, salida } = argumentos(process.argv.slice(2));
  require('dotenv').config({ path:path.join(__dirname,'../../.env'),quiet:true });
  require('../../config/aislado').asegurarBaseLocal();
  const { pool } = require('../../config/database');
  const client = require('./lib/lectura-alegra').getInstance();
  let archivo;
  try {
    archivo = await fs.open(salida,'wx',0o600);
    const informe = await ejecutar({client,pool,p,avisar:console.log});
    await archivo.writeFile(JSON.stringify(informe,null,2)+'\n');
    console.log(JSON.stringify({periodo:p,sin_diferencias:informe.sin_diferencias,cobros:informe.cobros.resumen,incidencias:informe.cobros.incidencias.length,saldos:informe.saldos.resumen,salida}));
    process.exitCode = informe.sin_diferencias ? 0 : 2;
  } catch(e) {
    if(archivo) { await archivo.close();archivo=null;await fs.unlink(salida); }
    throw e;
  } finally { if(archivo) await archivo.close();await pool.end(); }
}

if(require.main===module) main().catch(e=>{
  console.error(`Conciliación de cobros incompleta: ${mensajeSeguro(e)} No se certificaron datos.`);
  process.exitCode=1;
});
