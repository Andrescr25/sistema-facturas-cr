/**
 * Prueba en seco del motor de precios — Fase 2, paso de verificación del
 * plan. Corre calcularPrecioSugerido() sobre TODO el catálogo activo y
 * compara contra el precio actual. Solo lectura: no escribe nada en Alegra
 * ni en la base. Se corre sobre productos con costo confiable (OK o
 * MARGEN_NEGATIVO en la clasificación de auditoria.js) — sobre SIN_COSTO o
 * UNIDAD_SOSPECHOSA no hay costo del que fiarse para sugerir nada.
 *
 * Uso: cd backend && node scripts/simular-precios.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query } = require('../config/database');
const { clasificarProducto, CLASIFICACION } = require('../src/modules/precios/auditoria');
const { obtenerCostosDerivadosPorAlegra } = require('../src/modules/precios/costoDerivado');
const { calcularPrecioSugerido } = require('../src/modules/precios/motor');
const { obtenerConfigPrecios, resolverConfig } = require('../src/modules/precios/config');
const { SQL_ROTACION_PRECIOS } = require('../src/modules/ventas/rotacion');

async function main() {
  console.log('🧪 Simulando el motor de precios sobre todo el catálogo (solo lectura, no escribe nada)...\n');

  const [productos, derivados, rotaciones, configPrecios] = await Promise.all([
    query(`SELECT alegra_id, name, category, price, cost FROM alegra_products_cache WHERE status = 'active'`),
    obtenerCostosDerivadosPorAlegra(), // mediana de compras válidas, ver precios/costoDerivado.js
    // La misma rotación en el momento que usa Revisión de Precios (12 meses).
    query(`SELECT alegra_item_id, clase, unidades_mes, clientes_distintos FROM (${SQL_ROTACION_PRECIOS}) r`),
    obtenerConfigPrecios()
  ]);

  const derivadoPorItem = derivados; // ya viene como Map indexado por alegra_item_id
  const rotacionPorItem = new Map(rotaciones.rows.map(r => [r.alegra_item_id, { clase: r.clase, unidadesMes: r.unidades_mes !== null ? Number(r.unidades_mes) : null, clientesDistintos: Number(r.clientes_distintos) }]));

  const movimientos = [];
  let sinCostoConfiable = 0;
  let sinCambio = 0;

  for (const p of productos.rows) {
    const derivado = derivadoPorItem.get(String(p.alegra_id)) ?? null;
    const costoDerivado = derivado ? derivado.costo : null;
    const clasificacion = clasificarProducto({
      price: p.price, cost: p.cost, costoDerivado,
      historialInestable: derivado ? derivado.historialInestable : false
    });

    if (clasificacion.clasificacion === CLASIFICACION.SIN_COSTO || clasificacion.clasificacion === CLASIFICACION.UNIDAD_SOSPECHOSA) {
      sinCostoConfiable++;
      continue;
    }

    const categoria = p.category || '';
    const rotacion = rotacionPorItem.get(String(p.alegra_id)) || { clase: null, clientesDistintos: null };
    const { margenMeta, margenMinimo } = resolverConfig(configPrecios, categoria);

    const sugerido = calcularPrecioSugerido({
      costoSinIva: clasificacion.costoSinIva,
      margenMetaCategoria: margenMeta,
      margenMinimoCategoria: margenMinimo,
      unidadesMes: rotacion.unidadesMes,
      clientesDistintos: rotacion.clientesDistintos
    });
    if (!sugerido) continue;

    const precioActual = Number(p.price) || 0;
    const deltaAbs = sugerido.precioSugerido - precioActual;
    const deltaPct = precioActual > 0 ? (deltaAbs / precioActual) * 100 : 0;

    if (Math.abs(deltaPct) < 0.5) { sinCambio++; continue; }

    movimientos.push({
      nombre: p.name,
      categoria: categoria || '(sin categoría)',
      clase: rotacion.clase || '-',
      precioActual,
      precioSugerido: sugerido.precioSugerido,
      margenActual: clasificacion.margenReal,
      margenObjetivo: sugerido.margenObjetivo,
      deltaAbs,
      deltaPct
    });
  }

  movimientos.sort((a, b) => b.deltaPct - a.deltaPct);

  console.log(`📊 Total productos activos: ${productos.rows.length}`);
  console.log(`   Sin costo confiable (excluidos de la simulación): ${sinCostoConfiable}`);
  console.log(`   Con costo confiable, sin cambio sugerido (<0.5%): ${sinCambio}`);
  console.log(`   Con cambio sugerido: ${movimientos.length}\n`);

  const subidas = movimientos.filter(m => m.deltaPct > 0);
  const bajadas = movimientos.filter(m => m.deltaPct < 0);
  console.log(`   Precios que subirían: ${subidas.length} · Precios que bajarían: ${bajadas.length}\n`);

  const fmt = (n) => `₡${Math.round(n).toLocaleString('es-CR')}`;
  const imprimir = (titulo, lista) => {
    console.log(`\n=== ${titulo} ===`);
    lista.slice(0, 15).forEach(m => {
      console.log(
        `${m.deltaPct > 0 ? '↑' : '↓'} ${m.deltaPct.toFixed(1)}%`.padEnd(9),
        m.nombre.slice(0, 34).padEnd(35),
        m.categoria.slice(0, 18).padEnd(19),
        `${fmt(m.precioActual)} → ${fmt(m.precioSugerido)}`.padEnd(24),
        `margen ${m.margenActual?.toFixed(1)}%→${m.margenObjetivo}%`
      );
    });
  };

  imprimir('TOP 15 SUBIDAS MÁS GRANDES', subidas);
  imprimir('TOP 15 BAJADAS MÁS GRANDES', [...bajadas].sort((a, b) => a.deltaPct - b.deltaPct));

  process.exit(0);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
