/**
 * El descuento de una cotización (2026-11-24). El usuario: «agrégale el campo
 * descuento % a cotizaciones porque la edité y perdió el 5 %».
 *
 * UN SOLO PORCENTAJE PARA TODA LA COTIZACIÓN, que se guarda en CADA línea
 * (`cotizacion_linea.descuento_porcentaje`), igual que el descuento de un
 * producto en la factura. Así el PDF y el enlace muestran el precio ya
 * rebajado, y facturarla copia ese descuento a la factura sin hacer nada
 * más. No hay columna nueva: el de la cotización se lee de sus líneas.
 *
 * EDITAR NO LO BORRA. Si la pantalla no lo manda (una pestaña de antes de este
 * cambio), se conserva el que ya tenía. Antes, editar volvía a armar las
 * líneas con descuento cero, y así se perdió el 5 % de la cotización 6.
 *
 * Poner o cambiar el descuento es cambiar el precio: pide el mismo permiso
 * que en Facturación, «Cambiar precio y descuento» (`precio-factura`). Sin él
 * se puede editar la cotización, pero el descuento se queda como estaba.
 */
const { httpError } = require('../../utils/validacion');

/** El porcentaje pedido, de 0 a 100 con hasta tres decimales (la columna es NUMERIC(6,3)). */
function porcentajeDe(valor) {
  if (valor === undefined || valor === null || valor === '') return 0;
  const n = Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw httpError(400, 'El descuento de la cotización va de 0 a 100 %.');
  }
  return Math.round(n * 1000) / 1000;
}

/**
 * El descuento que tienen las líneas guardadas: el mismo en todas, o `null`
 * si difieren (solo puede pasar en una copiada de Alegra).
 */
function descuentoDeLineas(lineas) {
  const distintos = new Set((lineas || []).map((l) => Number(l.descuento_porcentaje) || 0));
  if (distintos.size === 0) return 0;
  return distintos.size === 1 ? [...distintos][0] : null;
}

/** Sin el permiso, el descuento no se pone ni se cambia. */
function exigirPermiso(nuevo, anterior, puedeDescontar) {
  if (puedeDescontar || nuevo === (anterior ?? 0)) return;
  throw httpError(403, 'Poner o cambiar el descuento necesita el permiso «Cambiar precio y descuento».');
}

module.exports = { porcentajeDe, descuentoDeLineas, exigirPermiso };
