/**
 * Costo unitario real a partir de una línea de factura de proveedor (XML de
 * Hacienda Costa Rica, persistida en ProductoFactura). Único lugar donde se
 * calcula esto — antes vivía triplicado, con la misma lógica copiada en:
 *   - revision-precios/revision-precios.service.js (actualizarPrecio → Alegra)
 *   - services/proveedorAsignacionService.js (elegir proveedor más barato)
 *   - productos-revision/productos-revision.service.js (mostrar costo por proveedor)
 *
 * En el XML de Hacienda, `precioUnitario` viene SIN IVA. El IVA real de la
 * línea NO se asume — se deriva de impuesto/totalLinea (impuestosAlegra.js),
 * porque Costa Rica tiene tarifas 0/1/2/4/8/13%, no solo 13%.
 */

const { calcularPorcentajeIva } = require('../../../utils/impuestosAlegra');

/**
 * Costo con IVA, en las UNIDADES DEL PROVEEDOR (antes de aplicar el factor
 * de conversión). Útil para mostrar "cuánto pagamos por proveedor" tal como
 * viene en su factura, sin mezclar la unidad propia.
 *
 * @param {object} linea - { precioUnitario, descuento, cantidad, impuesto, totalLinea }
 */
function calcularCostoUnitarioProveedor({ precioUnitario, descuento, cantidad, impuesto, totalLinea }) {
  const precioUnitarioSinIva = parseFloat(precioUnitario) || 0;
  const descuentoMonto = parseFloat(descuento) || 0;
  const cantidadNum = parseFloat(cantidad) || 1;

  const montoTotalSinDescuento = precioUnitarioSinIva * cantidadNum;
  const descuentoPorcentaje = montoTotalSinDescuento > 0
    ? (descuentoMonto / montoTotalSinDescuento) * 100
    : 0;

  const costoSinIvaConDescuento = precioUnitarioSinIva * (1 - descuentoPorcentaje / 100);
  const porcentajeIva = calcularPorcentajeIva({ impuesto, totalLinea });
  const costoConIva = costoSinIvaConDescuento * (1 + porcentajeIva / 100);

  return { costoConIva, costoSinIvaConDescuento, porcentajeIva, descuentoPorcentaje };
}

/**
 * Costo real por UNIDAD PROPIA — el que hay que comparar contra el precio de
 * venta y el que se escribe en Alegra (inventory.unitCost). Aplica el
 * factorConversion del mapeo proveedor↔producto: factor = unidadesPropias /
 * unidadDelProveedor (ej. proveedor vende caja de 24, nosotros por unidad
 * suelta → factor 24). Sin mapeo o factor 0/NaN, se asume 1:1.
 *
 * @param {object} linea - misma forma que calcularCostoUnitarioProveedor
 * @param {number|string|null} factorConversion
 */
function calcularCostoUnitarioPropio(linea, factorConversion) {
  const base = calcularCostoUnitarioProveedor(linea);
  const factor = parseFloat(factorConversion) || 1;
  return { ...base, factor, costoUnitario: base.costoConIva / factor };
}

module.exports = {
  calcularCostoUnitarioProveedor,
  calcularCostoUnitarioPropio
};
