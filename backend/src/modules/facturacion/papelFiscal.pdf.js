/**
 * Lo que el papel de un comprobante electrónico ACEPTADO dice además de lo que
 * dice una factura de venta (2026-10-24).
 *
 * POR QUÉ. Hacienda pide que la representación gráfica «deberá mostrar el
 * contenido de los comprobantes electrónicos, de forma legible»
 * (MH-DGT-RES-0027-2024, art. 5; Decreto 44739-H, art. 2 inciso 24). No hay
 * una lista de campos: la regla es que el papel diga lo mismo que el XML
 * firmado. El de antes dejaba afuera la unidad de cada línea, su total con
 * IVA, el motivo del descuento, el resumen de gravado/exento/venta neta, el
 * proveedor de sistemas y el plazo en días, y mostraba la fecha fiscal cruda.
 *
 * DE DÓNDE SALE. Todo, del XML aceptado (`lectura.service.js`,
 * `contenidoDelXml`), no de la base: si la factura cambiara después, el papel
 * sigue diciendo lo que Hacienda aceptó.
 *
 * LO QUE NO VA. El código QR: el mismo artículo lo pide, pero el Transitorio
 * III de la resolución lo suspende hasta que la DGT lo comunique.
 *
 * La factura de venta no pasa por acá: todo depende de `papel.fiscal`.
 */

const { MARCA, colonesExacto, fechaLarga } = require('../../utils/marcaPdf');

const num = (v) => Number(v) || 0;

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
  const codigos = [...new Set((fiscal.resumen?.mediosPago || []).map(m => m.tipo).filter(Boolean))];
  if (!codigos.length) return textoPropio;
  return `${textoPropio || 'Medio de pago'} (${codigos.join(', ')})`;
}

const lineaFiscalDe = (fiscal, numeroLinea) =>
  (fiscal?.lineas || []).find(l => l.numeroLinea === Number(numeroLinea)) || null;

/** Debajo de cada línea: unidad, subtotal, total con IVA y de qué es el descuento. */
function textoLineaFiscal(lx) {
  if (!lx) return null;
  return [
    lx.unidad,
    lx.subTotal !== null ? `Subtotal ${colonesExacto(lx.subTotal)}` : null,
    lx.montoTotalLinea !== null ? `Total con IVA ${colonesExacto(lx.montoTotalLinea)}` : null,
    lx.naturalezaDescuento ? `Descuento: ${lx.naturalezaDescuento}${lx.codigoDescuento ? ` (${lx.codigoDescuento})` : ''}` : null
  ].filter(Boolean).join('  ·  ') || null;
}

/** «13 %» de la tarifa de alguna línea con ese código; sin línea, solo el código. */
function etiquetaIva(fiscal, codigo) {
  const linea = (fiscal.lineas || []).find(l => l.codigoTarifa === codigo && l.tarifa !== null);
  return linea ? `IVA ${Number(linea.tarifa)} % (código ${codigo})` : `IVA código ${codigo}`;
}

/**
 * El resumen del XML, en el orden de `ResumenFactura`. Gravado, exento, venta,
 * descuentos, venta neta, impuesto y comprobante salen siempre; el desglose de
 * servicios/mercancías, exonerado, no sujeto y otros cargos, solo si no dan cero.
 */
function renglonesResumenFiscal(fiscal) {
  const r = fiscal?.resumen;
  if (!r) return [];
  const siHay = (etiqueta, v) => (num(v) !== 0 ? [[etiqueta, colonesExacto(v)]] : []);
  return [
    ...siHay('Servicios gravados', r.servGravados),
    ...siHay('Servicios exentos', r.servExentos),
    ...siHay('Servicios exonerados', r.servExonerados),
    ...siHay('Servicios no sujetos', r.servNoSujetos),
    ...siHay('Mercancías gravadas', r.mercGravadas),
    ...siHay('Mercancías exentas', r.mercExentas),
    ...siHay('Mercancías exoneradas', r.mercExoneradas),
    ...siHay('Mercancías no sujetas', r.mercNoSujetas),
    ['Total gravado', colonesExacto(r.gravado)],
    ['Total exento', colonesExacto(r.exento)],
    ...siHay('Total exonerado', r.exonerado),
    ...siHay('Total no sujeto', r.noSujeto),
    ['Total venta', colonesExacto(r.venta)],
    ['Total descuentos', colonesExacto(r.descuentos)],
    ['Total venta neta', colonesExacto(r.ventaNeta)],
    ...(r.desglose || []).map(d => [etiquetaIva(fiscal, d.codigoTarifa), colonesExacto(d.monto)]),
    ['Total impuesto', colonesExacto(r.impuesto)],
    ...siHay('Otros cargos', r.otrosCargos),
    ['Total comprobante', colonesExacto(r.comprobante)]
  ];
}

/**
 * El recuadro «Resumen del comprobante electrónico», a todo el ancho y en dos
 * columnas, debajo de los totales de siempre. Devuelve dónde sigue la página.
 */
function dibujarResumenFiscal(doc, fiscal, { x, ancho, y, F, limite }) {
  const renglones = renglonesResumenFiscal(fiscal);
  if (!renglones.length) return y;
  const porColumna = Math.ceil(renglones.length / 2);
  const alto = 24 + porColumna * 12 + 8;
  if (y + alto > limite) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.roundedRect(x, y, ancho, alto, 6).fill(MARCA.panel);
  doc.font(F.negrita).fontSize(7.5).fillColor(MARCA.gris)
    .text('RESUMEN DEL COMPROBANTE ELECTRÓNICO', x + 12, y + 9, { characterSpacing: 0.8 });
  const anchoCol = (ancho - 36) / 2;
  renglones.forEach(([etiqueta, valor], i) => {
    const cx = x + 12 + (i < porColumna ? 0 : anchoCol + 12);
    const cy = y + 24 + (i % porColumna) * 12;
    const fuerte = etiqueta === 'Total comprobante';
    doc.font(fuerte ? F.negrita : F.normal).fontSize(7.5).fillColor(fuerte ? MARCA.tinta : MARCA.gris)
      .text(etiqueta, cx, cy, { width: anchoCol - 90, lineBreak: false })
      .text(valor, cx + anchoCol - 90, cy, { width: 90, align: 'right', lineBreak: false });
  });
  return y + alto;
}

module.exports = {
  fechaFiscalLegible, datosFiscalesEncabezado, condicionFiscal, medioFiscal,
  lineaFiscalDe, textoLineaFiscal, renglonesResumenFiscal, dibujarResumenFiscal
};
