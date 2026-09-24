/**
 * Clasificación de calidad de dato de costo, por producto — Fase 1 de la
 * estrategia de precios (ver plan). Función pura para que la use tanto el
 * script de backfill/auditoría (backend/scripts/auditar-costos.js) como el
 * futuro endpoint del tablero de rentabilidad, sin duplicar la lógica.
 *
 * El `cost` de Alegra (alegra_products_cache.cost) viene CON IVA; el
 * `price` viene SIN IVA — asimetría confirmada en revision-precios.service.js.
 * Para pasar el costo a sin-IVA hace falta la tarifa REAL del producto
 * (`alegra_products_cache.tax_percentage`; Costa Rica tiene 0/1/2/4/8/13 %):
 * con el 13 % fijo, un producto al 1 % con margen real de 20 % se leía como
 * 28,5 % (76 productos visibles no van al 13 %, medido 2026-09-23). Quien la
 * tenga la pasa en `tasaIva`; IVA_ASUMIDO queda solo para cuando la tarifa
 * no se sincronizó (NULL no es "exento").
 *
 * Las dos ramas llegaron por separado al mismo arreglo, con nombres distintos:
 * `tasaIva` (developer) y `tarifa` (la migración). Se aceptan los dos.
 *
 * Dos señales, no una sola, porque una sola no alcanza: un caso real
 * (CINTA MOTEX 5500) tenía el costo de Alegra Y el costo derivado de
 * costo_historico de acuerdo entre sí — ambos venían del mismo mapeo con
 * factorConversion mal puesto, así que un cruce de fuentes por sí solo no
 * lo detecta. La regla del ratio costo/precio sí lo agarra.
 *
 * El ratio se revisa en LOS DOS SENTIDOS. Se encontró corriendo la prueba
 * en seco del motor de precios (backend/scripts/simular-precios.js):
 * productos reales con cost=₡1 o ₡13.89 en Alegra (placeholder que nunca se
 * completó) pasaban como costo "confiable" porque nunca son más de 3x el
 * precio — y el motor, persiguiendo el margen meta sobre un costo casi
 * cero, sugería precios cercanos a ₡0. Un margen implícito >90% no es una
 * ganga real: la mediana medida por categoría en todo el catálogo no pasa
 * de ~29%, y el p90 real no pasa de ~61% (ver /api/rentabilidad/resumen).
 */

const RATIO_SOSPECHOSO_ALTO = 3; // costo (sin IVA) > 3x el precio de venta ⇒ casi seguro error de unidad
const RATIO_SOSPECHOSO_BAJO = 0.05; // costo < 5% del precio (margen implícito >95%) ⇒ casi seguro costo mal cargado
const TOLERANCIA_CRUCE_PORCENTAJE = 25; // diferencia entre costo de Alegra y costo derivado de facturas
const IVA_ASUMIDO = 13; // solo si no llega la tarifa real (tasaIva)

/** La tarifa real si se sincronizó; si no (NULL no es "exento"), IVA_ASUMIDO. */
function tasaIvaDe(tasaIva) {
  return tasaIva !== null && tasaIva !== undefined && tasaIva !== '' && Number.isFinite(Number(tasaIva))
    ? Number(tasaIva)
    : IVA_ASUMIDO;
}

const CLASIFICACION = {
  SIN_COSTO: 'SIN_COSTO',
  UNIDAD_SOSPECHOSA: 'UNIDAD_SOSPECHOSA',
  MARGEN_NEGATIVO: 'MARGEN_NEGATIVO',
  OK: 'OK'
};

/**
 * SIN_COSTO significa "no hay costo por ningún lado", no "Alegra no lo tiene".
 *
 * Antes bastaba con que Alegra tuviera cost=0 para clasificar SIN_COSTO,
 * aunque las facturas del proveedor dieran un costo perfectamente bueno. La
 * pantalla terminaba mostrando el costo derivado Y la insignia "Sin costo" en
 * la misma fila — dos afirmaciones ciertas por separado que juntas se leen
 * como un error (14 productos así en producción). De dónde salió el costo es
 * otro eje y viaja aparte, en `origenCosto`.
 *
 * @param {object} datos
 * @param {number} datos.price - precio de venta actual, SIN IVA (alegra_products_cache.price)
 * @param {number} datos.cost - costo actual en Alegra, CON IVA (alegra_products_cache.cost)
 * @param {number|null} datos.costoDerivado - costo de las facturas de proveedor
 *        (ya normalizado a unidad propia, CON IVA), o null si no hay ninguna.
 *        Ver ./costoDerivado.js: es la mediana de las últimas compras válidas.
 * @param {number|string|null} [datos.tasaIva] - tarifa de IVA del producto
 *        (tax_percentage). null/ausente = no sincronizada → IVA_ASUMIDO.
 * @param {boolean} [datos.historialInestable] - las compras recientes de ese
 *        producto se contradicen entre sí (factor de conversión mal puesto en
 *        alguna). Basta para no confiar en el costo, venga de donde venga.
 * @param {number|null} [datos.tarifa] - la tarifa de IVA del producto, en
 *        porcentaje (0, 1, 2, 4, 8, 13). Sin ella se asume IVA_ASUMIDO.
 * @returns {{clasificacion: string, costoSinIva: number|null, margenReal: number|null,
 *   costoSugerido: number|null, diffPorcentaje: number|null, origenCosto: string|null}}
 */
function clasificarProducto({ price, cost, costoDerivado, historialInestable = false, tasaIva = null, tarifa = null }) {
  const precioVenta = Number(price) || 0;
  const costoAlegra = Number(cost) || 0;
  // La tarifa del producto cuando se conoce; si no, la de siempre. Un 0 es una
  // tarifa válida (exento), así que no vale preguntarle si es "falsy".
  const tasa = tasaIvaDe(tasaIva ?? tarifa);
  const derivado = costoDerivado != null && Number.isFinite(Number(costoDerivado)) && Number(costoDerivado) > 0
    ? Number(costoDerivado)
    : null;

  // El costo de Alegra manda cuando existe; si no, el de las facturas.
  const costoBase = costoAlegra > 0 ? costoAlegra : derivado;
  const origenCosto = costoAlegra > 0 ? 'alegra' : (derivado !== null ? 'facturas' : null);

  if (costoBase === null) {
    return {
      clasificacion: CLASIFICACION.SIN_COSTO,
      costoSinIva: null,
      margenReal: null,
      costoSugerido: null,
      diffPorcentaje: null,
      origenCosto: null
    };
  }

  const costoSinIva = costoBase / (1 + tasa / 100);
  const ratioCostoPrecio = precioVenta > 0 ? costoSinIva / precioVenta : Infinity;

  const sospechoso = (diffPorcentaje = null) => ({
    clasificacion: CLASIFICACION.UNIDAD_SOSPECHOSA,
    costoSinIva,
    margenReal: null,
    costoSugerido: derivado,
    diffPorcentaje,
    origenCosto
  });

  // Un historial que se contradice a sí mismo invalida el costo aunque el
  // ratio contra el precio parezca razonable.
  if (historialInestable) return sospechoso();

  // Regla dura del ratio (en los dos sentidos): independiente de si hay una
  // segunda fuente que lo confirme o no (y aunque la haya, puede compartir
  // el mismo error — ver caso CINTA MOTEX en el comentario de arriba).
  if (ratioCostoPrecio > RATIO_SOSPECHOSO_ALTO || (precioVenta > 0 && ratioCostoPrecio < RATIO_SOSPECHOSO_BAJO)) {
    return sospechoso();
  }

  // Cruce de fuentes: solo tiene sentido cuando las DOS existen y son
  // independientes. Si el costo base ya es el derivado, compararlo consigo
  // mismo no aporta nada.
  if (costoAlegra > 0 && derivado !== null) {
    const diffPorcentaje = (Math.abs(costoAlegra - derivado) / derivado) * 100;
    if (diffPorcentaje > TOLERANCIA_CRUCE_PORCENTAJE) return sospechoso(diffPorcentaje);
  }

  const margenReal = precioVenta > 0 ? ((precioVenta - costoSinIva) / precioVenta) * 100 : null;

  if (precioVenta <= costoSinIva) {
    return {
      clasificacion: CLASIFICACION.MARGEN_NEGATIVO,
      costoSinIva,
      margenReal,
      costoSugerido: derivado,
      diffPorcentaje: null,
      origenCosto
    };
  }

  return {
    clasificacion: CLASIFICACION.OK,
    costoSinIva,
    margenReal,
    costoSugerido: derivado,
    diffPorcentaje: null,
    origenCosto
  };
}

module.exports = {
  clasificarProducto,
  CLASIFICACION,
  RATIO_SOSPECHOSO_ALTO,
  RATIO_SOSPECHOSO_BAJO,
  TOLERANCIA_CRUCE_PORCENTAJE,
  IVA_ASUMIDO,
  tasaIvaDe
};
