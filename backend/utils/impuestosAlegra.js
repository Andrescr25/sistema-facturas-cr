// Mapeo de tarifas de IVA de Costa Rica a los IDs de impuesto configurados en Alegra
const MAPEO_IMPUESTOS_ALEGRA = [
  { porcentaje: 0, id: 3, nombre: 'Exento' },
  { porcentaje: 1, id: 6, nombre: 'IVA 1%' },
  { porcentaje: 2, id: 7, nombre: 'IVA 2%' },
  { porcentaje: 4, id: 8, nombre: 'IVA 4%' },
  { porcentaje: 8, id: 9, nombre: 'IVA 8%' },
  { porcentaje: 13, id: 1, nombre: 'IVA 13%' }
];

const TOLERANCIA_PORCENTAJE = 0.5;

/**
 * Calcula el porcentaje real de IVA de una línea de factura a partir del monto
 * de impuesto y el total de línea (ambos como vienen del XML de Hacienda).
 */
function calcularPorcentajeIva({ impuesto, totalLinea }) {
  const montoImpuesto = parseFloat(impuesto) || 0;
  const subtotal = (parseFloat(totalLinea) || 0) - montoImpuesto;

  if (montoImpuesto <= 0 || subtotal <= 0) return 0;

  return (montoImpuesto / subtotal) * 100;
}

/**
 * Determina el impuesto configurado en Alegra que corresponde a una línea de
 * factura, a partir del monto de impuesto real (no asume 13% fijo).
 * Devuelve null si la tarifa no coincide (con tolerancia) con ninguna
 * configurada en Alegra, para no forzar un impuesto incorrecto.
 */
function obtenerImpuestoAlegra({ impuesto, totalLinea }) {
  const porcentajeReal = calcularPorcentajeIva({ impuesto, totalLinea });

  let seleccionado = null;
  let menorDiferencia = Infinity;

  for (const candidato of MAPEO_IMPUESTOS_ALEGRA) {
    const diferencia = Math.abs(porcentajeReal - candidato.porcentaje);
    if (diferencia < menorDiferencia && diferencia < TOLERANCIA_PORCENTAJE) {
      menorDiferencia = diferencia;
      seleccionado = candidato;
    }
  }

  return seleccionado;
}

module.exports = {
  MAPEO_IMPUESTOS_ALEGRA,
  calcularPorcentajeIva,
  obtenerImpuestoAlegra
};
