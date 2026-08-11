/**
 * Auditoría de calidad de costo — Fase 1 de la estrategia de precios.
 *
 * Corre el clasificador (backend/src/modules/precios/auditoria.js) sobre
 * TODO el catálogo activo y exporta un reporte. Solo lectura: no escribe
 * nada en Alegra ni en la base — es diagnóstico, no corrección.
 *
 * Uso: cd backend && node scripts/auditar-costos.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const { clasificarProducto, CLASIFICACION } = require('../src/modules/precios/auditoria');

const SALIDA_DIR = path.join(__dirname, 'salida');

function csvEscape(valor) {
  if (valor === null || valor === undefined) return '';
  const str = String(valor);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('🔎 Auditando calidad de costo del catálogo (solo lectura)...\n');

  if (!fs.existsSync(SALIDA_DIR)) fs.mkdirSync(SALIDA_DIR, { recursive: true });

  const productos = await query(`
    SELECT alegra_id, name, category, price, cost
    FROM alegra_products_cache
    WHERE status = 'active'
    ORDER BY category, name
  `);

  // Último costo derivado por producto — una sola query para las ~1954,
  // en vez de una consulta por producto.
  const derivados = await query(`
    SELECT DISTINCT ON (alegra_item_id) alegra_item_id, costo_unitario
    FROM costo_historico
    ORDER BY alegra_item_id, fecha DESC
  `);
  const derivadoPorItem = new Map(derivados.rows.map(r => [r.alegra_item_id, Number(r.costo_unitario)]));

  const filas = [];
  const conteo = { [CLASIFICACION.SIN_COSTO]: 0, [CLASIFICACION.UNIDAD_SOSPECHOSA]: 0, [CLASIFICACION.MARGEN_NEGATIVO]: 0, [CLASIFICACION.OK]: 0 };
  const conteoPorCategoria = new Map();

  for (const p of productos.rows) {
    const costoDerivado = derivadoPorItem.get(String(p.alegra_id)) ?? null;
    const r = clasificarProducto({ price: p.price, cost: p.cost, costoDerivado });

    conteo[r.clasificacion]++;
    const cat = p.category || '(sin categoría)';
    if (!conteoPorCategoria.has(cat)) conteoPorCategoria.set(cat, { total: 0, [CLASIFICACION.SIN_COSTO]: 0, [CLASIFICACION.UNIDAD_SOSPECHOSA]: 0, [CLASIFICACION.MARGEN_NEGATIVO]: 0, [CLASIFICACION.OK]: 0 });
    const c = conteoPorCategoria.get(cat);
    c.total++;
    c[r.clasificacion]++;

    filas.push({
      alegra_id: p.alegra_id,
      nombre: p.name,
      categoria: cat,
      precio: Number(p.price) || 0,
      costo_alegra: Number(p.cost) || 0,
      costo_derivado: costoDerivado ?? '',
      clasificacion: r.clasificacion,
      margen_real_pct: r.margenReal !== null ? Math.round(r.margenReal * 10) / 10 : '',
      costo_sugerido: r.costoSugerido !== null ? Math.round(r.costoSugerido * 100) / 100 : '',
      diff_pct: r.diffPorcentaje !== null ? Math.round(r.diffPorcentaje * 10) / 10 : ''
    });
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const csvPath = path.join(SALIDA_DIR, `auditoria-costos-${fecha}.csv`);
  const jsonPath = path.join(SALIDA_DIR, `auditoria-costos-${fecha}.json`);

  const columnas = Object.keys(filas[0] || {});
  const csv = [columnas.join(','), ...filas.map(f => columnas.map(c => csvEscape(f[c])).join(','))].join('\n');
  fs.writeFileSync(csvPath, csv);
  fs.writeFileSync(jsonPath, JSON.stringify(filas, null, 2));

  console.log(`📊 Total de productos activos: ${productos.rows.length}\n`);
  console.log('Resumen general:');
  Object.entries(conteo).forEach(([clase, n]) => {
    const pct = ((n / productos.rows.length) * 100).toFixed(1);
    console.log(`  ${clase.padEnd(20)} ${String(n).padStart(5)}  (${pct}%)`);
  });

  console.log('\nPor categoría:');
  console.log('  categoria'.padEnd(36), 'total'.padStart(6), 'SIN_COSTO'.padStart(11), 'SOSPECHOSA'.padStart(12), 'NEGATIVO'.padStart(10), 'OK'.padStart(6));
  [...conteoPorCategoria.entries()].sort((a, b) => b[1].total - a[1].total).forEach(([cat, c]) => {
    console.log(
      '  ' + cat.slice(0, 33).padEnd(34),
      String(c.total).padStart(6),
      String(c[CLASIFICACION.SIN_COSTO]).padStart(11),
      String(c[CLASIFICACION.UNIDAD_SOSPECHOSA]).padStart(12),
      String(c[CLASIFICACION.MARGEN_NEGATIVO]).padStart(10),
      String(c[CLASIFICACION.OK]).padStart(6)
    );
  });

  console.log(`\n💾 Reporte completo: ${csvPath}`);
  console.log(`   y en JSON: ${jsonPath}`);
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
