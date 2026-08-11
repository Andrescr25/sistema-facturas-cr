/**
 * Backfill único — histórico completo de compras por cliente, para el
 * Catálogo Público personalizado.
 *
 * Recorre TODAS las facturas de venta en Alegra (sin filtro de fecha) y
 * puebla venta_historico vía sincronizarHistorialCompras() del módulo
 * catalogo-publico. Es idempotente (UNIQUE en alegra_invoice_id +
 * alegra_item_id) — se puede volver a correr sin duplicar nada si se corta
 * a la mitad.
 *
 * Uso: cd backend && node scripts/backfill-historial-compras.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const catalogoPublicoService = require('../src/modules/catalogo-publico/catalogo-publico.service');

(async () => {
  const inicio = Date.now();
  console.log('🚀 Backfill de historial de compras — arrancando (backfill completo, sin filtro de fecha)...\n');

  try {
    // Fecha explícita y muy anterior — a propósito, NO se deja que
    // sincronizarHistorialCompras() infiera el `desde` a partir de lo que ya
    // hay en la tabla: si el backfill se cortó a mitad de camino y se
    // reintenta, la tabla ya no está vacía y ese modo "incremental" saltaría
    // hacia adelante (agarrando MAX(fecha_emision), que es la más reciente)
    // en vez de retomar el histórico completo hacia atrás.
    const resultado = await catalogoPublicoService.sincronizarHistorialCompras({ desde: '2000-01-01' });
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\n✅ Backfill completo en ${segundos}s: ${resultado.facturas} facturas, ${resultado.lineas} líneas.`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante el backfill:', error.response?.data || error.message);
    console.error('   Es idempotente — se puede volver a correr y continúa sin duplicar lo ya guardado.');
    process.exit(1);
  }
})();
