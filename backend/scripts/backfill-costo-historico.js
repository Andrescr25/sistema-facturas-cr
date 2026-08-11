/**
 * Backfill de costo_historico — Fase 1 de la estrategia de precios.
 *
 * productos_factura_proveedor ya tiene, línea por línea, el costo real de
 * cada compra (con descuento e IVA real, ver backend/src/modules/precios/costo.js)
 * pero solo como facturas sueltas, no como serie consultable por producto.
 * Este script la convierte en la serie temporal costo_historico.
 *
 * Reejecutable: ON CONFLICT (producto_factura_id) actualiza en vez de
 * duplicar — así, si se corrige un factorConversion en
 * supplier_product_mapping, correr esto de nuevo refleja el costo correcto
 * sin tener que truncar nada primero.
 *
 * Uso: cd backend && node scripts/backfill-costo-historico.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../lib/prisma');
const { query } = require('../config/database');
const { calcularCostoUnitarioPropio } = require('../src/modules/precios/costo');

const PAGE = 500;
const FILAS_POR_INSERT = 150;
const COLUMNAS = 8; // alegra_item_id, producto_factura_id, proveedor_cedula, proveedor_nombre, fecha, costo_unitario, factor_conversion, origen

async function insertarLote(filas) {
  for (let i = 0; i < filas.length; i += FILAS_POR_INSERT) {
    const lote = filas.slice(i, i + FILAS_POR_INSERT);
    const placeholders = lote
      .map((_, idx) => {
        const base = idx * COLUMNAS;
        const cols = Array.from({ length: COLUMNAS }, (_, c) => `$${base + c + 1}`);
        return `(${cols.join(', ')})`;
      })
      .join(', ');
    const valores = lote.flat();

    let ultimoError;
    for (let intento = 1; intento <= 3; intento++) {
      try {
        await query(`
          INSERT INTO costo_historico
            (alegra_item_id, producto_factura_id, proveedor_cedula, proveedor_nombre, fecha, costo_unitario, factor_conversion, origen)
          VALUES ${placeholders}
          ON CONFLICT (producto_factura_id) DO UPDATE SET
            alegra_item_id = EXCLUDED.alegra_item_id,
            proveedor_cedula = EXCLUDED.proveedor_cedula,
            proveedor_nombre = EXCLUDED.proveedor_nombre,
            fecha = EXCLUDED.fecha,
            costo_unitario = EXCLUDED.costo_unitario,
            factor_conversion = EXCLUDED.factor_conversion;
        `, valores);
        ultimoError = null;
        break;
      } catch (error) {
        ultimoError = error;
        console.log(`   ⚠️ Error insertando lote (intento ${intento}/3): ${error.message}`);
        await new Promise((r) => setTimeout(r, 800 * intento));
      }
    }
    if (ultimoError) throw ultimoError;
  }
}

(async () => {
  const inicio = Date.now();
  console.log('🚀 Backfill de costo_historico — arrancando...\n');

  let skip = 0;
  let total = 0;
  let sinFecha = 0;

  try {
    while (true) {
      const lineas = await prisma.productoFactura.findMany({
        where: { alegraItemId: { not: null }, precioUnitario: { gt: 0 } },
        include: {
          factura: { select: { fechaEmision: true, proveedorNombre: true, proveedorCedula: true } },
          mapeo: { select: { factorConversion: true } }
        },
        skip,
        take: PAGE,
        orderBy: { id: 'asc' }
      });
      if (lineas.length === 0) break;

      const filas = [];
      for (const l of lineas) {
        if (!l.factura?.fechaEmision) { sinFecha++; continue; }
        const { costoUnitario, factor } = calcularCostoUnitarioPropio(l, l.mapeo?.factorConversion);
        if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) continue;
        filas.push([
          l.alegraItemId,
          l.id,
          l.factura.proveedorCedula || null,
          l.factura.proveedorNombre || null,
          l.factura.fechaEmision.toISOString().split('T')[0],
          Math.round(costoUnitario * 10000) / 10000,
          factor,
          'factura_proveedor'
        ]);
      }

      if (filas.length > 0) await insertarLote(filas);
      total += filas.length;
      skip += PAGE;
      console.log(`   ${total} filas procesadas...`);
    }

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\n✅ Backfill completo en ${segundos}s: ${total} filas de costo_historico.`);
    if (sinFecha > 0) console.log(`   (${sinFecha} líneas omitidas por no tener fecha de factura)`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error durante el backfill:', error.message);
    console.error('   Es reejecutable (ON CONFLICT actualiza) — se puede volver a correr.');
    process.exit(1);
  }
})();
