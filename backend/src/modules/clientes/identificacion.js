/**
 * Identificaciones de Costa Rica: los tipos que maneja el sistema y cuántos
 * dígitos tiene cada uno.
 *
 * Vive aparte porque la misma regla la usan la traducción de los contactos de
 * Alegra y la pantalla de clientes. Escrita dos veces, se corrige una sola.
 *
 * El extranjero (pasaporte) no se toca: puede traer letras y no tiene largo
 * fijo. El "no contribuyente" tampoco.
 */

const TIPOS = ['CF', 'CJ', 'DIMEX', 'NITE', 'EXTRANJERO', 'NO_CONTRIBUYENTE'];
const LARGOS = { CF: [9], CJ: [10], DIMEX: [11, 12], NITE: [10] };

// Estos cuatro son NÚMEROS. Sin esta regla pasaba "1ABCD6789" como cédula
// física —tiene nueve caracteres— y el error solo aparecería el día que esa
// factura se le mande a Hacienda.
const SOLO_NUMEROS = ['CF', 'CJ', 'DIMEX', 'NITE'];

// Una cédula jurídica empieza con 3. Las 20 que hay cargadas lo cumplen, y es
// la forma del documento: 3-101-123456. No se pone la misma regla para DIMEX
// ni NITE porque de esos no hay con qué comprobarla —dos fichas DIMEX y
// ninguna NITE— e inventar una rechazaría clientes de verdad.
const PREFIJOS = { CJ: '3' };

/** Cómo se dice cada tipo en la pantalla. */
const NOMBRES = {
  CF: 'cédula física',
  CJ: 'cédula jurídica',
  DIMEX: 'DIMEX',
  NITE: 'NITE',
  EXTRANJERO: 'pasaporte',
  NO_CONTRIBUYENTE: 'no contribuyente'
};

/** Sin espacios ni guiones, salvo el pasaporte, que se guarda como viene. */
function limpiar(valor, tipo) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const s = String(valor).trim();
  return (tipo === 'EXTRANJERO' ? s : s.replace(/[\s-]/g, '')).slice(0, 20);
}

/**
 * ¿El número calza con su tipo? Devuelve `null` si está bien, o el motivo
 * escrito para que lo lea quien está llenando la ficha.
 *
 * NO se valida el primer dígito de una cédula física: las 188 cargadas
 * empiezan con 1, 2, 4, 5, 6, 8 y 9, así que la regla de "provincia del 1 al
 * 7" que uno esperaría dejaría ocho clientes reales sin poder guardarse.
 */
function motivoQueNoCalza(tipo, identificacion) {
  if (!identificacion || !tipo) return null;
  const s = String(identificacion);

  if (SOLO_NUMEROS.includes(tipo) && !/^\d+$/.test(s)) {
    return `una ${NOMBRES[tipo]} son solo números, y esa trae "${s.replace(/\d/g, '').slice(0, 10)}".`;
  }
  if (LARGOS[tipo] && !LARGOS[tipo].includes(s.length)) {
    return `una ${NOMBRES[tipo]} tiene ${LARGOS[tipo].join(' o ')} dígitos, y esa tiene ${s.length}.`;
  }
  if (PREFIJOS[tipo] && !s.startsWith(PREFIJOS[tipo])) {
    return `una ${NOMBRES[tipo]} empieza con ${PREFIJOS[tipo]}, y esa empieza con ${s[0]}.`;
  }
  return null;
}

/** ¿El número tiene el largo que corresponde a su tipo? */
function calza(tipo, identificacion) {
  return motivoQueNoCalza(tipo, identificacion) === null;
}

module.exports = { TIPOS, LARGOS, NOMBRES, PREFIJOS, limpiar, calza, motivoQueNoCalza };
