/**
 * Los tipos de identificación de un cliente y lo que revisa el servidor
 * (`backend/src/modules/clientes/identificacion.js`), dicho antes de apretar
 * Guardar. Está escrito dos veces a propósito: el servidor es el que manda
 * —una pantalla no protege una base de datos— y esto es solo para no hacer ir
 * y volver. Lo usan la ficha de Clientes y «Cliente nuevo» de Preventa.
 *
 * No se valida el primer dígito de una cédula física: las cargadas empiezan
 * con 1, 2, 4, 5, 6, 8 y 9, así que "provincia del 1 al 7" dejaría fuera a
 * ocho clientes de verdad.
 */
export const TIPOS_IDENTIFICACION = [
  { valor: 'CF', texto: 'Cédula física', digitos: [9], soloNumeros: true },
  { valor: 'CJ', texto: 'Cédula jurídica', digitos: [10], soloNumeros: true, empiezaCon: '3' },
  { valor: 'DIMEX', texto: 'DIMEX', digitos: [11, 12], soloNumeros: true },
  { valor: 'NITE', texto: 'NITE', digitos: [10], soloNumeros: true },
  { valor: 'EXTRANJERO', texto: 'Pasaporte', digitos: null },
  { valor: 'NO_CONTRIBUYENTE', texto: 'No contribuyente', digitos: null }
]

/** Por qué no calza, o null. `tipo` es un elemento de TIPOS_IDENTIFICACION. */
export function avisoIdentificacion(tipo, identificacion) {
  if (!tipo || !identificacion) return null
  if (tipo.soloNumeros && !/^\d+$/.test(identificacion)) {
    return `Una ${tipo.texto.toLowerCase()} son solo números.`
  }
  if (tipo.digitos && !tipo.digitos.includes(identificacion.length)) {
    return `Una ${tipo.texto.toLowerCase()} tiene ${tipo.digitos.join(' o ')} dígitos; esta tiene ${identificacion.length}.`
  }
  if (tipo.empiezaCon && !identificacion.startsWith(tipo.empiezaCon)) {
    return `Una ${tipo.texto.toLowerCase()} empieza con ${tipo.empiezaCon}.`
  }
  return null
}
