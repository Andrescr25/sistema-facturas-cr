/**
 * Clasificación ABC de rotación por producto — Fase 1 de la estrategia de
 * precios. Recalcula producto_rotacion desde cero cada corrida (snapshot,
 * no histórico acumulativo) a partir de venta_historico.
 *
 * Método: ABC clásico por facturación acumulada de los últimos 12 meses.
 * Se ordenan los productos por facturación descendente y se acumula el %
 * del total: A = hasta el 80% acumulado (el núcleo que mueve casi toda la
 * venta), B = del 80% al 95%, C = el resto (incluye todo lo que no se
 * vendió en la ventana, que cae naturalmente al final). Es el criterio
 * estándar de inventario, no algo inventado para este sistema.
 *
 * meses_sin_venta se calcula contra la ÚLTIMA venta real en todo el
 * histórico (no solo los 12 meses de la ventana ABC), para no confundir
 * "vende poco" con "nunca se le ha vendido nada" ni con "se dejó de vender
 * hace 3 años".
 *
 * Uso: cd backend && node scripts/calcular-rotacion.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../config/database');

const CORTE_A = 80; // % acumulado de facturación
const CORTE_B = 95;

function mesesEntre(desde, hasta) {
  if (!desde) return null;
  const d = new Date(desde);
  return (hasta.getFullYear() - d.getFullYear()) * 12 + (hasta.getMonth() - d.getMonth());
}

async function main() {
  console.log('📊 Calculando rotación ABC (últimos 12 meses de venta_historico)...\n');

  const res = await query(`
    WITH ventas_12m AS (
      SELECT alegra_item_id,
             SUM(cantidad) AS unidades_12m,
             SUM(cantidad * precio_unitario) AS facturacion_12m,
             COUNT(DISTINCT cliente_id) AS clientes_distintos
      FROM venta_historico
      WHERE fecha_emision >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY alegra_item_id
    ),
    ultima_venta AS (
      SELECT alegra_item_id, MAX(fecha_emision) AS ultima_fecha
      FROM venta_historico
      GROUP BY alegra_item_id
    )
    SELECT p.alegra_id,
           COALESCE(v.unidades_12m, 0) AS unidades_12m,
           COALESCE(v.facturacion_12m, 0) AS facturacion_12m,
           COALESCE(v.clientes_distintos, 0) AS clientes_distintos,
           u.ultima_fecha
    FROM alegra_products_cache p
    LEFT JOIN ventas_12m v ON v.alegra_item_id = p.alegra_id::text
    LEFT JOIN ultima_venta u ON u.alegra_item_id = p.alegra_id::text
    WHERE p.status = 'active'
  `);

  const productos = res.rows.map(r => ({
    alegraItemId: r.alegra_id,
    unidadesMes: Number(r.unidades_12m) / 12,
    facturacion12m: Number(r.facturacion_12m),
    clientesDistintos: Number(r.clientes_distintos),
    mesesSinVenta: mesesEntre(r.ultima_fecha, new Date())
  }));

  const totalFacturacion = productos.reduce((s, p) => s + p.facturacion12m, 0);
  productos.sort((a, b) => b.facturacion12m - a.facturacion12m);

  let acumulado = 0;
  for (const p of productos) {
    if (p.facturacion12m <= 0) {
      p.clase = 'C';
      continue;
    }
    acumulado += p.facturacion12m;
    const pctAcumulado = totalFacturacion > 0 ? (acumulado / totalFacturacion) * 100 : 100;
    p.clase = pctAcumulado <= CORTE_A ? 'A' : pctAcumulado <= CORTE_B ? 'B' : 'C';
  }

  const conteo = { A: 0, B: 0, C: 0 };
  productos.forEach(p => conteo[p.clase]++);

  await query('TRUNCATE TABLE producto_rotacion');

  const LOTE = 200;
  for (let i = 0; i < productos.length; i += LOTE) {
    const lote = productos.slice(i, i + LOTE);
    const placeholders = lote.map((_, idx) => {
      const b = idx * 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    }).join(', ');
    const valores = lote.flatMap(p => [
      p.alegraItemId,
      Math.round(p.unidadesMes * 100) / 100,
      p.clientesDistintos,
      Math.round(p.facturacion12m * 100) / 100,
      p.mesesSinVenta,
      p.clase
    ]);
    await query(`
      INSERT INTO producto_rotacion (alegra_item_id, unidades_mes, clientes_distintos, facturacion_12m, meses_sin_venta, clase)
      VALUES ${placeholders}
    `, valores);
  }

  console.log(`📊 Total de productos activos clasificados: ${productos.length}`);
  console.log(`   Clase A (núcleo, ~80% de la facturación): ${conteo.A}`);
  console.log(`   Clase B (siguiente 15%): ${conteo.B}`);
  console.log(`   Clase C (cola larga, incluye sin ventas en 12 meses): ${conteo.C}`);
  console.log(`\n✅ producto_rotacion actualizada.`);
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
