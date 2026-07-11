/**
 * Cálculos puros del factor de conversión entre la cantidad que factura un
 * proveedor y la cantidad equivalente en el sistema propio. Extraído de
 * GestionarRelaciones.jsx.
 */

export function calcularFactorConversion(cantidadProveedor, cantidadMia) {
  return parseFloat(cantidadMia) / parseFloat(cantidadProveedor)
}

// Solo debe llamarse cuando factorConversion existe y es distinto de 1.
export function inferirCantidadesDesdeFactor(factorConversion) {
  if (factorConversion < 1) {
    // Ejemplo: 0.5 significa 1 del proveedor = 0.5 mío (2:1)
    return { cantidadProveedor: Math.round(1 / factorConversion), cantidadMia: 1 }
  }
  // Ejemplo: 2 significa 1 del proveedor = 2 míos (1:2)
  return { cantidadProveedor: 1, cantidadMia: Math.round(factorConversion) }
}
