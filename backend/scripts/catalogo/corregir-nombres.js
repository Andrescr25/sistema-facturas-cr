/**
 * Plan revisado { productos: [{id,marcaId,antes,despues}], marcas: [...] }.
 * Vista previa: node scripts/catalogo/corregir-nombres.js plan.json
 * Aplicar: agregar --aplicar USUARIO_ID RESPALDO_NUEVO.json
 * El entorno lo decide config/aislado.js. Nunca se abre producción para probar.
 */
const fs = require('node:fs/promises');
const { corregirNombres } = require('../../src/modules/productos/nombresCatalogo.service');
const { pool } = require('../../config/database');

async function main() {
  const [archivo, modo, usuario, respaldo] = process.argv.slice(2);
  if (!archivo || (modo && modo !== '--aplicar') || (modo && (!usuario || !respaldo))) {
    throw new Error('Uso: corregir-nombres.js PLAN.json [--aplicar USUARIO_ID RESPALDO_NUEVO.json]');
  }
  const plan = JSON.parse(await fs.readFile(archivo, 'utf8'));
  const cambios = await corregirNombres(plan, usuario, {
    aplicar: modo === '--aplicar',
    guardarRespaldo: datos => fs.writeFile(respaldo, JSON.stringify(datos, null, 2), { flag: 'wx', mode: 0o600 })
  });
  console.log(JSON.stringify({ aplicado: modo === '--aplicar', productos: cambios.productos.length, marcas: cambios.marcas.length }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
