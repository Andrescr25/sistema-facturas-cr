/**
 * Lo que el papel de un comprobante electrónico ACEPTADO dice además de lo que
 * dice una factura de venta (2026-10-24).
 *
 * POR QUÉ. Hacienda pide que la representación gráfica «deberá mostrar el
 * contenido de los comprobantes electrónicos, de forma legible»
 * (MH-DGT-RES-0027-2024, art. 5; Decreto 44739-H, art. 2 inciso 24). No hay
 * una lista de campos: la regla es que el papel diga lo mismo que el XML
 * firmado. El de antes dejaba afuera el proveedor de sistemas y el plazo en
 * días, y mostraba la fecha fiscal cruda.
 *
 * DE DÓNDE SALE. Todo, del XML aceptado (`lectura.service.js`,
 * `contenidoDelXml`), no de la base: si la factura cambiara después, el papel
 * sigue diciendo lo que Hacienda aceptó.
 *
 * LO QUE NO VA.
 *  - El código QR: el mismo artículo lo pide, pero el Transitorio III de la
 *    resolución lo suspende hasta que la DGT lo comunique.
 *  - Un recuadro «Resumen del comprobante electrónico» (gravado, exento,
 *    venta neta, IVA por código): se probó y el usuario lo quitó al verlo
 *    (2026-10-24). Los totales de siempre quedan.
 *  - Debajo de cada línea, «Unid · Subtotal ₡… · Total con IVA ₡…» (y el motivo
 *    del descuento): el usuario lo quitó por «ruido» (2026-10-24). La unidad y
 *    el motivo siguen en el XML; el papel deja la línea como la de venta.
 *
 * La factura de venta no pasa por acá: todo depende de `papel.fiscal`.
 */

const { fechaLarga } = require('../../utils/marcaPdf');

/** «2026-10-23T14:05:11-06:00» → «23 de octubre de 2026, 2:05 p. m.», con la hora que se firmó. */
function fechaFiscalLegible(fecha) {
  const m = String(fecha || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return String(fecha || '');
  const h = Number(m[2]);
  return `${fechaLarga(m[1])}, ${h % 12 || 12}:${m[3]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Los datos bajo la clave, a la derecha del encabezado. */
function datosFiscalesEncabezado(fiscal) {
  return [
    ['Fecha de emisión:', fechaFiscalLegible(fiscal.fecha)],
    ['Estado:', 'Aceptada por Hacienda'],
    ...(fiscal.proveedorSistemas ? [['Proveedor de sistemas:', fiscal.proveedorSistemas]] : [])
  ];
}

/** La condición firmada: «Crédito a 30 días» lleva el plazo en días del XML. */
function condicionFiscal(fiscal, textoPropio) {
  if (fiscal.condicionVenta === '01') return 'Contado';
  if (fiscal.condicionVenta === '02') return fiscal.plazoCredito ? `Crédito a ${fiscal.plazoCredito} días` : 'Crédito';
  return textoPropio;
}

/** El medio de pago con su código de Hacienda: «SINPE Móvil (06)». */
function medioFiscal(fiscal, textoPropio) {
  const codigos = [...new Set((fiscal.mediosPago || []).map(m => m.tipo).filter(Boolean))];
  if (!codigos.length) return textoPropio;
  return `${textoPropio || 'Medio de pago'} (${codigos.join(', ')})`;
}

module.exports = {
  fechaFiscalLegible, datosFiscalesEncabezado, condicionFiscal, medioFiscal
};
