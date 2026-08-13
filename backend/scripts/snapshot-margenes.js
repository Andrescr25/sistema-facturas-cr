/**
 * Foto semanal del margen de todo el catálogo.
 *
 * Se ejecuta solo (domingos 2am, ver server.js) y también a mano:
 *   node scripts/snapshot-margenes.js
 *
 * Correrlo dos veces el mismo día no duplica: la tabla tiene UNIQUE
 * (fecha, alegra_item_id) y el INSERT hace UPSERT.
 */

require('dotenv').config();
const { tomarSnapshotMargenes, obtenerTendenciaMargenes } = require('../src/modules/rentabilidad/rentabilidad.service');

(async () => {
  const inicio = Date.now();
  try {
    const r = await tomarSnapshotMargenes();
    console.log(`📸 Snapshot de márgenes ${r.fecha}: ${r.productos} productos en ${((Date.now() - inicio) / 1000).toFixed(1)}s`);

    const { serie } = await obtenerTendenciaMargenes();
    const hoy = serie[serie.length - 1];
    if (hoy) {
      console.log(`   margen ponderado por facturación: ${hoy.margenPonderado}% · mediana ${hoy.margenMediana}%`);
      console.log(`   ${hoy.conCosto} de ${hoy.productos} con costo · ${hoy.margenNegativo} en margen negativo · ${hoy.sinCosto} sin costo`);
    }
    if (serie.length > 1) {
      const previo = serie[serie.length - 2];
      const delta = (hoy.margenPonderado - previo.margenPonderado).toFixed(2);
      console.log(`   contra ${previo.fecha}: ${delta > 0 ? '+' : ''}${delta} puntos`);
    } else {
      console.log('   (primera foto — la comparación aparece a partir de la segunda)');
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Error tomando el snapshot:', error.message);
    process.exit(1);
  }
})();
