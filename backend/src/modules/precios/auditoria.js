/**
 * Clasificación de calidad de dato de costo, por producto — Fase 1 de la
 * estrategia de precios (ver plan). Función pura para que la use tanto el
 * script de backfill/auditoría (backend/scripts/auditar-costos.js) como el
 * futuro endpoint del tablero de rentabilidad, sin duplicar la lógica.
 *
 * El `cost` de Alegra (alegra_products_cache.cost) viene CON IVA; el
 * `price` viene SIN IVA — asimetría confirmada en revision-precios.service.js.
 * La tarifa de IVA real no está persistida por producto todavía (Costa Rica
 * tiene 0/1/2/4/8/13%, no solo 13%) — se asume IVA_ASUMIDO como el resto del
 * código ya hace, documentado como limitación conocida a resolver después.
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
const IVA_ASUMIDO = 13; // TODO(fase 1.2): persistir la tarifa real de IVA por producto

const CLASIFICACION = {
  SIN_COSTO: 'SIN_COSTO',
  UNIDAD_SOSPECHOSA: 'UNIDAD_SOSPECHOSA',
  MARGEN_NEGATIVO: 'MARGEN_NEGATIVO',
  OK: 'OK'
};

/**
 * @param {object} datos
 * @param {number} datos.price - precio de venta actual, SIN IVA (alegra_products_cache.price)
 * @param {number} datos.cost - costo actual en Alegra, CON IVA (alegra_products_cache.cost)
 * @param {number|null} datos.costoDerivado - costo_unitario más reciente en costo_historico
 *        (ya normalizado a unidad propia, CON IVA), o null si no hay ninguna factura relacionada.
 * @returns {{clasificacion: string, costoSinIva: number|null, margenReal: number|null, costoSugerido: number|null, diffPorcentaje: number|null}}
 */
function clasificarProducto({ price, cost, costoDerivado }) {
  const precioVenta = Number(price) || 0;
  const costoAlegra = Number(cost) || 0;
  const derivado = costoDerivado != null && Number.isFinite(Number(costoDerivado)) && Number(costoDerivado) > 0
    ? Number(costoDerivado)
    : null;

  if (costoAlegra <= 0) {
    return {
      clasificacion: CLASIFICACION.SIN_COSTO,
      costoSinIva: null,
      margenReal: null,
      costoSugerido: derivado,
      diffPorcentaje: null
    };
  }

  const costoSinIva = costoAlegra / (1 + IVA_ASUMIDO / 100);
  const ratioCostoPrecio = precioVenta > 0 ? costoSinIva / precioVenta : Infinity;

  // Regla dura del ratio (en los dos sentidos): independiente de si hay una
  // segunda fuente que lo confirme o no (y aunque la haya, puede compartir
  // el mismo error — ver caso CINTA MOTEX en el comentario de arriba).
  if (ratioCostoPrecio > RATIO_SOSPECHOSO_ALTO || (precioVenta > 0 && ratioCostoPrecio < RATIO_SOSPECHOSO_BAJO)) {
    return {
      clasificacion: CLASIFICACION.UNIDAD_SOSPECHOSA,
      costoSinIva,
      margenReal: null,
      costoSugerido: derivado,
      diffPorcentaje: null
    };
  }

  // Cruce de fuentes: costo de Alegra vs. el derivado de las facturas reales.
  if (derivado !== null) {
    const diffPorcentaje = (Math.abs(costoAlegra - derivado) / derivado) * 100;
    if (diffPorcentaje > TOLERANCIA_CRUCE_PORCENTAJE) {
      return {
        clasificacion: CLASIFICACION.UNIDAD_SOSPECHOSA,
        costoSinIva,
        margenReal: null,
        costoSugerido: derivado,
        diffPorcentaje
      };
    }
  }

  const margenReal = precioVenta > 0 ? ((precioVenta - costoSinIva) / precioVenta) * 100 : null;

  if (precioVenta <= costoSinIva) {
    return {
      clasificacion: CLASIFICACION.MARGEN_NEGATIVO,
      costoSinIva,
      margenReal,
      costoSugerido: derivado,
      diffPorcentaje: null
    };
  }

  return {
    clasificacion: CLASIFICACION.OK,
    costoSinIva,
    margenReal,
    costoSugerido: derivado,
    diffPorcentaje: null
  };
}

module.exports = {
  clasificarProducto,
  CLASIFICACION,
  RATIO_SOSPECHOSO_ALTO,
  RATIO_SOSPECHOSO_BAJO,
  TOLERANCIA_CRUCE_PORCENTAJE,
  IVA_ASUMIDO
};
