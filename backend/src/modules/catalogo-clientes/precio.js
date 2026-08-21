/**
 * Precio de venta al público, con impuesto incluido.
 *
 * VIVE APARTE PORQUE LO USAN DOS MÓDULOS: el catálogo (lo que el cliente ve)
 * y el portal (lo que se congela en el pedido y termina en la factura). Si
 * cada uno lo calculara por su lado, basta con que uno redondee distinto
 * para que el cliente vea ₡37.800 y su pedido diga ₡37.800,0029 — que fue
 * exactamente lo que pasó cuando estaban duplicados.
 *
 * Alegra guarda `price` SIN impuesto y con muchos decimales, porque el
 * precio de góndola es el que LO INCLUYE: 33451,32743 × 1,13 = ₡37.800
 * exacto. Se redondea a 2 decimales, que es la unidad mínima con la que se
 * factura.
 *
 * Tasa NULL = producto que aún no pasó por una sincronización con la columna
 * tax_percentage. Se devuelve el precio tal cual: mejor mostrar de menos que
 * inventarle un impuesto que quizá no le aplica.
 */
function precioConImpuesto(precioBase, tasaPorcentaje) {
  const base = Number(precioBase) || 0;
  const tasa = tasaPorcentaje === null || tasaPorcentaje === undefined
    ? 0
    : Number(tasaPorcentaje) || 0;
  return Math.round(base * (1 + tasa / 100) * 100) / 100;
}

/**
 * El camino inverso, para mandarle a Alegra el precio SIN impuesto: Alegra
 * le suma el impuesto del producto al facturar, así que enviar el precio con
 * IVA haría que lo sume dos veces y la factura saldría un 13% más cara.
 */
function precioSinImpuesto(precioConIva, tasaPorcentaje) {
  const conIva = Number(precioConIva) || 0;
  const tasa = tasaPorcentaje === null || tasaPorcentaje === undefined
    ? 0
    : Number(tasaPorcentaje) || 0;
  return Math.round((conIva / (1 + tasa / 100)) * 10000) / 10000;
}

module.exports = { precioConImpuesto, precioSinImpuesto };
