/**
 * Escribe en Alegra el costo de los productos que lo tienen vacío pero cuyo
 * costo real SÍ conocemos por sus facturas de proveedor (costo_historico).
 *
 * Por qué hace falta: hasta el commit 65dfc24 (23-jul-2026), Revisión de
 * Precios mandaba el costo como `cost` en la raíz del payload. Alegra ignora
 * ese campo en silencio — responde 200 y no aplica nada — así que durante
 * todo ese tiempo el precio se actualizaba y el costo no. Este script repara
 * ese histórico; de aquí en adelante el flujo normal ya escribe bien
 * (inventory.unitCost).
 *
 * Uso:
 *   node scripts/actualizar-costos-alegra.js              → dry-run (no escribe)
 *   node scripts/actualizar-costos-alegra.js --aplicar    → escribe en Alegra
 *   node scripts/actualizar-costos-alegra.js --limite=20  → acota la corrida
 *
 * El dry-run es el modo por defecto A PROPÓSITO: esto escribe en la
 * contabilidad de producción y un costo mal puesto contamina márgenes,
 * sugerencias de precio y valoración de inventario.
 */

const { query } = require('../config/database');
const { obtenerCostosDerivadosPorAlegra } = require('../src/modules/precios/costoDerivado');
const { getProductService } = require('../src/integrations/alegra');
const { IVA_ASUMIDO, RATIO_SOSPECHOSO_ALTO, RATIO_SOSPECHOSO_BAJO } = require('../src/modules/precios/auditoria');

const APLICAR = process.argv.includes('--aplicar');
const limiteArg = process.argv.find(a => a.startsWith('--limite='));
const LIMITE = limiteArg ? parseInt(limiteArg.split('=')[1], 10) : null;

// Alegra es un servicio ajeno y esto puede ser un lote grande: se le da aire
// entre llamadas en vez de dispararlas todas juntas.
const PAUSA_MS = 250;
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// Piso de margen plausible. Vender con pérdida existe (liquidación, error de
// precio), pero un margen de -150% significa vender a un tercio del costo:
// eso no es una decisión de negocio, es un factor de conversión mal puesto.
// Verificado en los dos casos que aparecieron acá — ambos con
// factor_conversion NULL y mapeados a una presentación distinta del proveedor.
//
// El clasificador de auditoría usa un corte por ratio (3x) que sirve para
// PINTAR una tabla; para ESCRIBIR en la contabilidad conviene ser más
// estricto, porque un costo malo contamina márgenes, sugerencias de precio y
// valoración de inventario.
const MARGEN_MINIMO_PLAUSIBLE = -25;

async function main() {
  console.log(APLICAR ? '⚠️  MODO APLICAR — se va a escribir en Alegra\n' : '🔍 DRY-RUN — no se escribe nada\n');

  // El costo sale de precios/costoDerivado.js: mediana de las últimas compras
  // VÁLIDAS. Antes esto tomaba `ORDER BY fecha DESC LIMIT 1` — la última fila
  // suelta — que es justo lo que hacía que una compra con el factor mal
  // puesto, o una relación ya deshecha, decidiera el costo que se escribe en
  // la contabilidad.
  const derivados = await obtenerCostosDerivadosPorAlegra();

  const res = await query(`
    SELECT p.alegra_id, p.name, p.price, p.cost
    FROM alegra_products_cache p
    WHERE p.status = 'active' AND (p.cost IS NULL OR p.cost = 0)
    ORDER BY p.name ASC;
  `);

  const candidatos = [];
  const descartados = [];

  for (const p of res.rows) {
    const derivado = derivados.get(String(p.alegra_id));
    if (!derivado) continue;
    p.fecha_costo = derivado.fechaUltima;

    const precio = Number(p.price) || 0;
    const costo = derivado.costo;
    if (costo <= 0) continue;

    // Un historial que se contradice a sí mismo no se escribe nunca: es
    // exactamente el síntoma de un factor de conversión mal puesto.
    if (derivado.historialInestable) {
      descartados.push({ ...p, costo, motivo: 'historial de compras inconsistente' });
      continue;
    }

    // El costo derivado viene CON IVA y el precio SIN IVA (asimetría de
    // Alegra), así que hay que igualarlos antes de comparar.
    const costoSinIva = costo / (1 + IVA_ASUMIDO / 100);
    const ratio = precio > 0 ? costoSinIva / precio : Infinity;

    // Mismas guardas que usa el clasificador de auditoría: un costo que
    // triplica el precio, o que es 20 veces menor, casi siempre es un error
    // de unidad. Esos NO se escriben — meterlos a Alegra sería propagar el
    // error a márgenes, sugerencias de precio y valoración de inventario.
    if (precio <= 0) {
      descartados.push({ ...p, motivo: 'sin precio de venta', costo, ratio: null });
      continue;
    }
    if (ratio > RATIO_SOSPECHOSO_ALTO) {
      descartados.push({ ...p, motivo: `costo ${ratio.toFixed(1)}x el precio (unidad sospechosa)`, costo, ratio });
      continue;
    }
    if (ratio < RATIO_SOSPECHOSO_BAJO) {
      descartados.push({ ...p, motivo: `costo ${(ratio * 100).toFixed(1)}% del precio (unidad sospechosa)`, costo, ratio });
      continue;
    }

    const margen = ((precio - costoSinIva) / precio) * 100;
    if (margen < MARGEN_MINIMO_PLAUSIBLE) {
      descartados.push({
        ...p,
        motivo: `dejaría margen ${margen.toFixed(0)}% — revisar factor de conversión`,
        costo,
        ratio
      });
      continue;
    }

    candidatos.push({
      alegraId: p.alegra_id,
      nombre: p.name,
      precio,
      costo: Math.round(costo * 100) / 100,
      margen,
      fechaCosto: p.fecha_costo
    });
  }

  console.log(`Productos sin costo en Alegra pero con costo conocido: ${res.rows.length}`);
  console.log(`  ✅ Se pueden actualizar: ${candidatos.length}`);
  console.log(`  ⛔ Descartados por guardas:  ${descartados.length}\n`);

  if (descartados.length > 0) {
    console.log('DESCARTADOS (revisar a mano, casi siempre es el factor de conversión):');
    descartados.slice(0, 15).forEach(d =>
      console.log(`   ${d.name.slice(0, 38).padEnd(38)} precio ₡${String(Number(d.price)).padStart(9)} · costo ₡${d.costo.toFixed(2).padStart(10)} — ${d.motivo}`));
    if (descartados.length > 15) console.log(`   ... y ${descartados.length - 15} más`);
    console.log('');
  }

  // Los márgenes extremos son la señal de que algo va mal aunque pase las
  // guardas, así que se muestran antes de escribir nada.
  const ordenados = [...candidatos].sort((a, b) => a.margen - b.margen);
  console.log('MÁRGENES MÁS BAJOS que quedarían (los más riesgosos):');
  ordenados.slice(0, 8).forEach(c =>
    console.log(`   ${c.nombre.slice(0, 38).padEnd(38)} precio ₡${String(c.precio).padStart(9)} · costo ₡${String(c.costo).padStart(10)} → margen ${c.margen.toFixed(1)}%`));

  console.log('\nMÁRGENES MÁS ALTOS:');
  ordenados.slice(-5).reverse().forEach(c =>
    console.log(`   ${c.nombre.slice(0, 38).padEnd(38)} precio ₡${String(c.precio).padStart(9)} · costo ₡${String(c.costo).padStart(10)} → margen ${c.margen.toFixed(1)}%`));

  const negativos = candidatos.filter(c => c.margen < 0);
  if (negativos.length > 0) {
    console.log(`\n⚠️  ${negativos.length} quedarían con margen NEGATIVO (se venden bajo costo). Se actualizan igual porque el dato es real, pero conviene revisarlos.`);
  }

  if (!APLICAR) {
    console.log(`\n🔍 Dry-run terminado. Para aplicar:  node scripts/actualizar-costos-alegra.js --aplicar`);
    process.exit(0);
  }

  const aProcesar = LIMITE ? candidatos.slice(0, LIMITE) : candidatos;
  console.log(`\n⚠️  Escribiendo ${aProcesar.length} costos en Alegra...\n`);

  const productService = getProductService();
  let ok = 0;
  const fallidos = [];

  for (const [i, c] of aProcesar.entries()) {
    try {
      // unitCost anidado en inventory: un `cost` suelto en la raíz Alegra lo
      // ignora en silencio (responde 200 sin aplicar) — ese fue justamente
      // el bug que dejó estos productos sin costo.
      const r = await productService.updateProduct(c.alegraId, {
        inventory: { unitCost: c.costo.toString() }
      });
      if (!r.success) throw new Error(r.error || 'respuesta sin success');

      await query('UPDATE alegra_products_cache SET cost = $1 WHERE alegra_id = $2', [c.costo, c.alegraId]);
      ok++;
      if ((i + 1) % 25 === 0) console.log(`   ... ${i + 1}/${aProcesar.length}`);
    } catch (error) {
      fallidos.push({ nombre: c.nombre, error: error.message });
    }
    await esperar(PAUSA_MS);
  }

  console.log(`\n✅ Actualizados: ${ok}`);
  if (fallidos.length > 0) {
    console.log(`❌ Fallidos: ${fallidos.length}`);
    fallidos.slice(0, 10).forEach(f => console.log(`   ${f.nombre}: ${f.error}`));
  }
  process.exit(0);
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
