#!/usr/bin/env node
/** GET a Alegra; escribe el archivo histórico y sus vínculos en la base LOCAL.
 * Requiere migración 040 y notas ya copiadas. No reimporta sus cabeceras.
 */
const path=require('node:path');
const {mensajeSeguro}=require('./conciliar-ventas');
const {cargarHistorico}=require('./lib/historico-debitos-ingreso');
async function main() {
  if(process.argv.length>2) throw new (require('./lib/conciliacion-ventas').ErrorConciliacion)('Uso: node scripts/independencia/cargar-debitos-ingreso.js');
  require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true});
  require('../../config/aislado').asegurarBaseLocal();
  const {pool}=require('../../config/database');
  try {
    const client=require('./lib/lectura-alegra').getInstance();
    console.log(JSON.stringify(await cargarHistorico({pool,client,avisar:console.log})));
  } finally {await pool.end();}
}
if(require.main===module) main().catch(e=>{console.error(`Carga de débitos no confirmada: ${mensajeSeguro(e)}`);process.exitCode=1;});
