/** La tabla de cobros usa los importes guardados, con su IVA y descuento. */
export function productosFacturaCobro(lineas = []) {
  return lineas.map(l => ({
    id: l.numeroLinea,
    descripcion: l.nombre || l.descripcion || 'Producto sin descripción',
    codigo: l.referencia,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    descuento: l.descuentoPorcentaje,
    // No recalcular: puede haber descuentos, exoneraciones o redondeos
    // históricos que ya forman parte del importe de la factura.
    total: l.total
  }))
}
