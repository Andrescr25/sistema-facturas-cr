/**
 * Motor de precios — Fase 2 de la estrategia de precios. Reemplaza el
 * markup fijo `costo / 0.80` (frontend/src/utils/revisionPreciosUtils.js)
 * por un margen meta que sale del histórico real de cada categoría
 * (config_precios), ajustado por rotación y exclusividad, con un piso de
 * seguridad del que nunca baja.
 *
 * Todo el margen en este módulo está expresado "sobre precio de venta"
 * (no markup sobre costo) — mismo criterio que ya usaba la fórmula vieja,
 * para no romper la lectura de nadie acostumbrado a esos números:
 * margen 20% sobre venta = costo / (1 - 0.20), NO costo × 1.20.
 */

const AJUSTE_ROTACION = { A: -3, B: 0, C: 5 };
const AJUSTE_EXCLUSIVIDAD = 3; // pocos clientes distintos lo compran
const CLIENTES_MAX_EXCLUSIVIDAD = 3;
const MARGEN_MAXIMO = 60; // tope de seguridad — ver p90 real medido (~35-60%) en el catálogo

// Margen que necesita el cliente (la pulpería) para que le convenga
// revendernos en vez de comprarle directo al retailer con el que se lo
// compara. Asumido, no medido — no hay forma de conocer el margen real de
// cada pulpería desde acá. Documentado como tal a propósito de que se
// pueda ajustar después si hace falta.
const MARGEN_PULPERIA_ASUMIDO = 20;

const UMBRAL_REDONDEO_CHICO = 1000;
const UMBRAL_REDONDEO_MEDIO = 10000;

/**
 * Margen meta final para un producto: parte del margen medido de su
 * categoría y lo ajusta según qué tan rápido rota y qué tan exclusivo es,
 * sin nunca bajar del margen mínimo de la categoría (piso de seguridad) ni
 * superar MARGEN_MAXIMO.
 *
 * Por qué la rotación mueve el margen en esa dirección: un producto clase A
 * lo compran muchos clientes seguido — conocen su precio, es donde te
 * comparan, conviene margen ajustado y ganar por volumen. Uno clase C se
 * vende poco y el cliente no tiene referencia de precio: ahí está el margen.
 */
function calcularMargenMeta({ margenMetaCategoria, margenMinimoCategoria, claseRotacion, clientesDistintos }) {
  let ajuste = AJUSTE_ROTACION[claseRotacion] || 0; // B, null o clase desconocida: sin ajuste

  if (clientesDistintos != null && clientesDistintos > 0 && clientesDistintos <= CLIENTES_MAX_EXCLUSIVIDAD) {
    ajuste += AJUSTE_EXCLUSIVIDAD;
  }

  const meta = Number(margenMetaCategoria) + ajuste;
  return Math.min(Math.max(meta, Number(margenMinimoCategoria)), MARGEN_MAXIMO);
}

/**
 * Redondeo psicológico escalado por magnitud — versión ampliada de
 * redondearPrecio() (frontend/src/utils/revisionPreciosUtils.js, que solo
 * redondea a múltiplos de 5). Un precio de ₡47.860 no necesita la misma
 * granularidad que uno de ₡84.
 */
function redondeoPsicologico(precio) {
  if (precio < UMBRAL_REDONDEO_CHICO) return Math.round(precio / 5) * 5;
  if (precio < UMBRAL_REDONDEO_MEDIO) return Math.round(precio / 25) * 25;
  return Math.round(precio / 100) * 100;
}

/**
 * Techo de precio derivado del precio de venta al público de la
 * competencia (Fase 3). Somos distribuidor, no competimos de frente contra
 * un retailer — si le vendo a la pulpería a mi_precio y ella necesita
 * MARGEN_PULPERIA_ASUMIDO% para que le convenga revender, mi_precio no
 * puede pasar de precio_competencia / (1 + margen/100): si lo supera, la
 * pulpería no puede competir con ese mismo retailer comprándome a mí, y no
 * me compra. Devuelve null si no hay precio de competencia (nada que limitar).
 */
function calcularTechoCompetencia(precioCompetencia, margenPulperia = MARGEN_PULPERIA_ASUMIDO) {
  const precio = Number(precioCompetencia) || 0;
  if (precio <= 0) return null;
  return precio / (1 + margenPulperia / 100);
}

/**
 * Precio sugerido para un producto.
 *
 * @param {object} datos
 * @param {number} datos.costoSinIva - costo real unitario, SIN IVA (ya con
 *        descuento y factor de conversión aplicados — ver
 *        backend/src/modules/precios/costo.js)
 * @param {number} datos.margenMetaCategoria - de config_precios
 * @param {number} datos.margenMinimoCategoria - de config_precios
 * @param {string|null} datos.claseRotacion - 'A'|'B'|'C'|null (producto_rotacion)
 * @param {number|null} datos.clientesDistintos - producto_rotacion
 * @param {number|null} [datos.precioTechoCompetencia] - Fase 3, opcional.
 *        Si viene y el precio calculado lo supera, se limita a ese techo
 *        sin bajar nunca del piso (margen mínimo) — un techo de competencia
 *        muy bajo no puede forzar una venta a pérdida.
 * @returns {{precioSugerido: number, margenObjetivo: number, margenResultante: number}|null}
 *          null si no hay costo confiable — no tiene sentido sugerir nada.
 */
function calcularPrecioSugerido({
  costoSinIva,
  margenMetaCategoria,
  margenMinimoCategoria,
  claseRotacion,
  clientesDistintos,
  precioTechoCompetencia
}) {
  const costo = Number(costoSinIva) || 0;
  if (costo <= 0) return null;

  const margenObjetivo = calcularMargenMeta({ margenMetaCategoria, margenMinimoCategoria, claseRotacion, clientesDistintos });
  let precio = costo / (1 - margenObjetivo / 100);

  if (precioTechoCompetencia && precio > precioTechoCompetencia) {
    const precioPiso = costo / (1 - Number(margenMinimoCategoria) / 100);
    precio = Math.max(precioTechoCompetencia, precioPiso);
  }

  precio = redondeoPsicologico(precio);
  const margenResultante = precio > 0 ? ((precio - costo) / precio) * 100 : 0;

  return {
    precioSugerido: precio,
    margenObjetivo: Math.round(margenObjetivo * 10) / 10,
    margenResultante: Math.round(margenResultante * 10) / 10
  };
}

module.exports = {
  calcularMargenMeta,
  redondeoPsicologico,
  calcularTechoCompetencia,
  calcularPrecioSugerido,
  MARGEN_PULPERIA_ASUMIDO,
  AJUSTE_ROTACION,
  AJUSTE_EXCLUSIVIDAD,
  CLIENTES_MAX_EXCLUSIVIDAD,
  MARGEN_MAXIMO
};
