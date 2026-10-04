#!/usr/bin/env node
/**
 * Solo GET y PostgreSQL READ ONLY. No confundir con reconciliar-compras.js:
 * ese otro escribe desde XML. Este auditor no carga ni corrige documentos.
 * 0: sin diferencias en el alcance; 2: diferencias/vínculos pendientes;
 * 1: lectura incompleta. JSON privado fuera del repositorio, archivo nuevo.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const {argumentos,mensajeSeguro}=require('./conciliar-ventas');
const {ejecutar}=require('./lib/conciliacion-compras');

async function main() {
  const {p,salida}=argumentos(process.argv.slice(2));
  require('dotenv').config({path:path.join(__dirname,'../../.env'),quiet:true});
  require('../../config/aislado').asegurarBaseLocal();
  const {pool}=require('../../config/database');
  let archivo;
  try {
    archivo=await fs.open(salida,'wx',0o600);
    const client=require('../../src/integrations/alegra/alegra.client').getInstance();
    const informe=await ejecutar({pool,client,p,avisar:console.log});
    await archivo.writeFile(JSON.stringify(informe,null,2)+'\n');
    console.log(JSON.stringify({periodo:p,sin_diferencias:informe.sin_diferencias,resumen:informe.resumen,salida}));
    process.exitCode=informe.sin_diferencias?0:2;
  } catch(e) {
    if(archivo){await archivo.close();archivo=null;await fs.unlink(salida);}
    throw e;
  } finally {if(archivo)await archivo.close();await pool.end();}
}
if(require.main===module)main().catch(e=>{
  console.error(`Conciliación de compras incompleta: ${mensajeSeguro(e)} No se certificaron datos.`);
  process.exitCode=1;
});
