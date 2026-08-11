/**
 * Sincronización de precios de competencia — Fase 3 de la estrategia de
 * precios. Busca un lote acotado de productos propios en EPA, Walmart CR y
 * Mas x Menos, guarda las capturas y empareja lo que se pueda contra el
 * catálogo propio. Respeta 1 petición cada 2s por fuente y se detiene ante
 * el primer bloqueo — pensado para correr de madrugada, no interactivo.
 *
 * Uso:
 *   node scripts/sincronizar-competencia.js                       (30 productos, por facturación)
 *   node scripts/sincronizar-competencia.js --limite=100
 *   node scripts/sincronizar-competencia.js --categoria=Ferretería --limite=50
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../config/database');
const { sincronizarLote } = require('../src/modules/rentabilidad/competencia/sincronizador');
const { emparejarPendientes } = require('../src/modules/rentabilidad/competencia/emparejador');

const LIMITE_DEFAULT = 30;

async function main() {
  const args = process.argv.slice(2);
  const limiteArg = args.find(a => a.startsWith('--limite='));
  const categoriaArg = args.find(a => a.startsWith('--categoria='));
  const limite = limiteArg ? parseInt(limiteArg.split('=')[1], 10) : LIMITE_DEFAULT;
  const categoria = categoriaArg ? categoriaArg.split('=')[1] : null;

  console.log(`🔎 Sincronizando precios de competencia — hasta ${limite} productos${categoria ? ` de "${categoria}"` : ' (priorizando los de mayor facturación)'}...`);
  console.log('   Fuentes: EPA, Walmart CR, Mas x Menos — 1 petición cada 2s por fuente, se detiene si alguna bloquea.\n');

  const params = [];
  let filtroCategoria = '';
  if (categoria) {
    params.push(categoria);
    filtroCategoria = `AND p.category = $${params.length}`;
  }
  params.push(limite);

  const productos = await query(`
    SELECT p.alegra_id AS "alegraItemId", p.name AS nombre
    FROM alegra_products_cache p
    LEFT JOIN producto_rotacion r ON r.alegra_item_id = p.alegra_id::text
    WHERE p.status = 'active' ${filtroCategoria}
    ORDER BY COALESCE(r.facturacion_12m, 0) DESC
    LIMIT $${params.length}
  `, params);

  if (productos.rows.length === 0) {
    console.log('No hay productos que coincidan con el filtro.');
    process.exit(0);
  }

  const inicio = Date.now();
  const resumen = await sincronizarLote(productos.rows, {
    onProgreso: (n, total) => process.stdout.write(`\r   ${n}/${total} productos procesados...`)
  });
  const segundosCaptura = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\n\n✅ Captura completa en ${segundosCaptura}s`);
  console.log(`   Productos procesados: ${resumen.procesados}`);
  console.log(`   Capturas de precio guardadas: ${resumen.capturas}`);
  if (resumen.bloqueos.length > 0) {
    console.log(`   ⚠️ Fuentes bloqueadas durante esta corrida: ${resumen.bloqueos.map(b => `${b.fuente} (${b.status})`).join(', ')}`);
  }

  console.log('\n🔗 Emparejando contra el catálogo propio...');
  const inicioMatch = Date.now();
  const match = await emparejarPendientes();
  const segundosMatch = ((Date.now() - inicioMatch) / 1000).toFixed(1);

  console.log(`✅ Emparejamiento completo en ${segundosMatch}s`);
  console.log(`   Sugerencias para revisión manual: ${match.sugerencias.length}`);
  console.log('   (nada se auto-confirma — cada match hay que aprobarlo desde el Tablero de Rentabilidad)');

  process.exit(0);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
