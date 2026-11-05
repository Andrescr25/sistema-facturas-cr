/** Sustituye unidades sin recalcular precios, impuestos o copias de otras líneas. */
const { armarLineas, dinero } = require('./facturaLineas');
const { httpError } = require('../../utils/validacion');

function lineaNueva(producto, cantidad, descuento) {
  return armarLineas([{ productoId: producto.id, cantidad, precio: producto.precio, descuento }],
    new Map([[String(producto.id), producto]]), l => l.productoId).lineas[0];
}

function sustituirLineas(lineas, productoOriginalId, producto, cantidad, descuento = 0) {
  let restante = cantidad;
  let siguiente = Math.max(0, ...lineas.map(l => Number(l.numero_linea))) + 1;
  const adicionales = [];
  const propuesta = lineas.map(l => {
    if (l.producto_id !== productoOriginalId || restante <= 0) return { ...l };
    const toma = Math.min(Number(l.cantidad), restante);
    restante = dinero(restante - toma);
    const nueva = lineaNueva(producto, toma, descuento);
    if (toma === Number(l.cantidad)) return { ...l, ...nueva, id: l.id, numero_linea: l.numero_linea };
    adicionales.push({ ...nueva, numero_linea: siguiente++ });
    const queda = Number(l.cantidad) - toma;
    // La parte original conserva precio, tarifa y descuento de su factura.
    const descuentoMonto = dinero(queda * Number(l.precio_unitario) * Number(l.descuento_porcentaje) / 100);
    const base = dinero(queda * Number(l.precio_unitario) - descuentoMonto);
    const impuesto = dinero(base * Number(l.tarifa) / 100);
    return { ...l, cantidad: queda, descuento_monto: descuentoMonto, impuesto_monto: impuesto, total: dinero(base + impuesto) };
  });
  if (restante > 0) throw httpError(409, 'La factura ya no tiene esas unidades del producto original. Actualizá el reporte.');
  propuesta.push(...adicionales);
  return {
    lineas: propuesta,
    subtotal: dinero(propuesta.reduce((n, l) => n + Number(l.total) - Number(l.impuesto_monto), 0)),
    descuento: dinero(propuesta.reduce((n, l) => n + Number(l.descuento_monto), 0)),
    impuesto: dinero(propuesta.reduce((n, l) => n + Number(l.impuesto_monto), 0)),
    total: dinero(propuesta.reduce((n, l) => n + Number(l.total), 0))
  };
}

module.exports = { sustituirLineas };
