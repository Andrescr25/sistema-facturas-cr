/**
 * Detector de factorConversion en conflicto — Fase 1 de la estrategia de
 * precios. Solo lectura: reporta, no corrige nada.
 *
 * Premisa original del plan ("hay filas idénticas repetidas") NO se
 * sostuvo al verificar: el UNIQUE(supplier_cedula, supplier_code) se
 * respeta, cero duplicados exactos. Lo que sí existe es más sutil y más
 * importante: el MISMO proveedor con distintos supplier_code para el mismo
 * producto (típicamente porque le cambiaron el código con los años) trae
 * factorConversion inconsistente entre esos códigos — casi siempre porque
 * los códigos nuevos nunca se completaron y quedaron en NULL (⇒ asume 1).
 *
 * Este script no decide cuál factor es el correcto — eso es una pregunta de
 * negocio ("ese código es la presentación de caja de 60, o la de 12?") que
 * no se puede inferir solo de los números. Lo que sí hace es priorizar la
 * revisión: para cada código en conflicto, calcula qué costo unitario
 * resultaría con ese factor y si ese costo es o no compatible con el precio
 * de venta actual (mismo criterio del clasificador de auditar-costos.js) —
 * así el humano revisa primero los casos donde un factor da un número
 * absurdo y el otro no.
 *
 * Uso: cd backend && node scripts/detectar-conflictos-mapeo.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const { RATIO_SOSPECHOSO_ALTO, IVA_ASUMIDO } = require('../src/modules/precios/auditoria');

const SALIDA_DIR = path.join(__dirname, 'salida');

function csvEscape(valor) {
  if (valor === null || valor === undefined) return '';
  const str = String(valor);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

async function main() {
  console.log('🔎 Detectando factorConversion en conflicto dentro del mismo proveedor (solo lectura)...\n');
  if (!fs.existsSync(SALIDA_DIR)) fs.mkdirSync(SALIDA_DIR, { recursive: true });

  const grupos = await query(`
    SELECT alegra_item_id, alegra_name, supplier_cedula, supplier_name
    FROM supplier_product_mapping
    GROUP BY alegra_item_id, alegra_name, supplier_cedula, supplier_name
    HAVING COUNT(DISTINCT COALESCE(factor_conversion, 1)) > 1
  `);

  console.log(`Productos con factorConversion en conflicto dentro del mismo proveedor: ${grupos.rows.length}\n`);
  if (grupos.rows.length === 0) { process.exit(0); }

  const filas = [];

  for (const g of grupos.rows) {
    const mapeos = await query(`
      SELECT id, supplier_code, supplier_desc, factor_conversion, times_used, last_used_date
      FROM supplier_product_mapping
      WHERE alegra_item_id = $1 AND supplier_cedula = $2
      ORDER BY last_used_date DESC
    `, [g.alegra_item_id, g.supplier_cedula]);

    const producto = await query(`SELECT price FROM alegra_products_cache WHERE alegra_id::text = $1`, [g.alegra_item_id]);
    const precio = Number(producto.rows[0]?.price) || 0;

    for (const m of mapeos.rows) {
      const factor = parseFloat(m.factor_conversion) || 1;

      // Última compra real hecha con este mapeo específico, si la hay.
      const ultimaCompra = await query(`
        SELECT costo_unitario, fecha FROM costo_historico
        WHERE producto_factura_id IN (
          SELECT id FROM productos_factura_proveedor WHERE mapeo_id = $1
        ) ORDER BY fecha DESC LIMIT 1
      `, [m.id]);

      const costoUnitario = ultimaCompra.rows[0] ? Number(ultimaCompra.rows[0].costo_unitario) : null;
      const costoSinIva = costoUnitario !== null ? costoUnitario / (1 + IVA_ASUMIDO / 100) : null;
      const ratio = costoSinIva !== null && precio > 0 ? costoSinIva / precio : null;
      const pintaMal = ratio !== null && ratio > RATIO_SOSPECHOSO_ALTO;

      filas.push({
        producto: g.alegra_name,
        alegra_item_id: g.alegra_item_id,
        precio_venta: precio,
        proveedor: g.supplier_name,
        supplier_code: m.supplier_code,
        descripcion_proveedor: m.supplier_desc,
        factor_conversion: m.factor_conversion ?? '(sin definir → asume 1)',
        veces_usado: m.times_used,
        ultimo_uso: m.last_used_date ? m.last_used_date.toISOString().slice(0, 10) : '',
        ultima_compra_costo_unitario: costoUnitario !== null ? Math.round(costoUnitario * 100) / 100 : '(nunca se usó en una factura)',
        ratio_costo_precio: ratio !== null ? Math.round(ratio * 100) / 100 : '',
        sospechoso: pintaMal ? 'SÍ — revisar primero' : ''
      });
    }
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const csvPath = path.join(SALIDA_DIR, `conflictos-factor-conversion-${fecha}.csv`);
  const columnas = Object.keys(filas[0]);
  const csv = [columnas.join(','), ...filas.map(f => columnas.map(c => csvEscape(f[c])).join(','))].join('\n');
  fs.writeFileSync(csvPath, csv);

  console.log('Detalle (revisar primero los marcados "SÍ"):\n');
  let productoActual = null;
  filas.forEach(f => {
    if (f.producto !== productoActual) {
      productoActual = f.producto;
      console.log(`\n${f.producto} (₡${f.precio_venta} de venta) — ${f.proveedor}:`);
    }
    console.log(
      `   código ${String(f.supplier_code).padEnd(16)} factor=${String(f.factor_conversion).padEnd(20)}`,
      `usado ${String(f.veces_usado).padStart(3)}x  costo unit. última compra: ${String(f.ultima_compra_costo_unitario).padStart(12)}`,
      f.sospechoso ? '  ⚠️ ' + f.sospechoso : ''
    );
  });

  console.log(`\n💾 Reporte completo: ${csvPath}`);
  console.log('\nEsto NO modifica nada — es para decidir a mano cuál factor es el correcto por código y corregirlo en "Gestionar Relaciones".');
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
