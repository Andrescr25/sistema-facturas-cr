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

/** Sin espacios ni guiones, salvo el pasaporte, que se guarda como viene. */
function limpiar(valor, tipo) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const s = String(valor).trim();
  return (tipo === 'EXTRANJERO' ? s : s.replace(/[\s-]/g, '')).slice(0, 20);
}

/** ¿El número tiene el largo que corresponde a su tipo? */
function calza(tipo, identificacion) {
  if (!identificacion || !LARGOS[tipo]) return true;
  return LARGOS[tipo].includes(String(identificacion).length);
}

/** Cómo se dice cada tipo en la pantalla. */
const NOMBRES = {
  CF: 'cédula física',
  CJ: 'cédula jurídica',
  DIMEX: 'DIMEX',
  NITE: 'NITE',
  EXTRANJERO: 'pasaporte',
  NO_CONTRIBUYENTE: 'no contribuyente'
};

module.exports = { TIPOS, LARGOS, NOMBRES, limpiar, calza };
