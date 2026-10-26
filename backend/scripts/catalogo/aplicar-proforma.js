/**
 * PLAN ANTES RESULTADO: revisión sin escrituras.
 * Agregar --ensayar RESPALDO para aplicar en PostgreSQL local y ROLLBACK.
 * Agregar --aplicar RESPALDO para confirmar la operación autorizada.
 * Usuario y plan son explícitos; los archivos privados no se suben al repo.
 */
const fs = require('node:fs/promises');
const real = require('../../config/database');
const { esBaseLocal } = require('../../config/aislado');
const { baseEnTransaccion } = require('../../src/utils/baseEnTransaccion');

async function main() {
  const [archivoPlan, archivoAntes, archivoResultado, usuario, modo, archivoRespaldo] = process.argv.slice(2);
  if (!archivoPlan || !archivoAntes || !archivoResultado || !usuario || (modo && !['--ensayar', '--aplicar'].includes(modo)) || (modo && !archivoRespaldo)) {
    throw new Error('Uso: aplicar-proforma.js PLAN ANTES RESULTADO USUARIO [--ensayar|--aplicar RESPALDO_NUEVO]');
  }
  if (modo === '--ensayar' && !esBaseLocal(process.env.DATABASE_URL)) throw new Error('El ensayo requiere una copia local.');
  const plan = JSON.parse(await fs.readFile(archivoPlan, 'utf8')), antes = JSON.parse(await fs.readFile(archivoAntes, 'utf8'));
  const c = await real.pool.connect();
  try {
    await c.query('BEGIN');
    const ruta = require.resolve('../../config/database');
    // Sólo este proceso de mantenimiento comparte conexión. Los servicios
    // conservan validaciones, bitácora e historial y no confirman a medias.
    require.cache[ruta].exports = baseEnTransaccion(c, 'proforma_catalogo');
    const servicio = require('../../src/modules/productos/proformaCatalogo.service');
    servicio.validarPlan(plan);
    if (!modo) {
      await c.query('ROLLBACK');
      console.log(JSON.stringify({ previsto: plan.productos.length, actualizar: Object.keys(plan.actualizarPorMedida).length, crear: plan.productos.length - Object.keys(plan.actualizarPorMedida).length, retirar: plan.retirar.length }));
      return;
    }
    const resultado = await servicio.aplicarPlan(plan, antes, usuario, datos => fs.writeFile(archivoRespaldo, JSON.stringify(datos, null, 2), { flag: 'wx', mode: 0o600 }));
    await fs.writeFile(archivoResultado, JSON.stringify({ aplicado: false, confirmacionPendiente: modo === '--aplicar', proforma: plan.proforma, productos: resultado }, null, 2), { flag: 'wx', mode: 0o600 });
    await c.query(modo === '--aplicar' ? 'COMMIT' : 'ROLLBACK');
    if (modo === '--aplicar') await fs.writeFile(archivoResultado, JSON.stringify({ aplicado: true, proforma: plan.proforma, productos: resultado }, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ aplicado: modo === '--aplicar', productos: resultado.length, creados: resultado.filter(p => p.creado).length, retirados: plan.retirar.length }));
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally { c.release(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => real.pool.end());
