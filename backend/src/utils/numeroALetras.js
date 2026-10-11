/**
 * El monto escrito en palabras, como lo lleva una factura.
 *
 * POR QUÉ VA EN EL PAPEL
 * Es lo que hace que una cifra no se pueda alterar con un lapicero: "₡15.899"
 * se retoca, "quince mil ochocientos noventa y nueve colones" no.
 *
 * LAS TRAMPAS DEL ESPAÑOL, que es donde esto se equivoca:
 *   · 21 es "veintiuno", no "veinte y uno"; 16 es "dieciséis".
 *   · 100 es "cien" pero 101 es "ciento uno".
 *   · 500 es "quinientos", 700 "setecientos", 900 "novecientos" — no siguen
 *     la regla de los demás.
 *   · 1.000 es "mil", no "un mil"; pero 21.000 sí es "veintiún mil".
 *   · Delante de "millones" y de "mil", 1 es "un": "veintiún mil", no
 *     "veintiuno mil".
 */

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];

const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 0–999. `apocope` convierte el "uno" final en "un" (para "veintiún mil"). */
function hasta999(n, apocope = false) {
  if (n === 0) return '';
  if (n === 100) return 'cien';

  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];

  if (centena) partes.push(CENTENAS[centena]);

  if (resto) {
    if (resto < 30) {
      const palabra = UNIDADES[resto];
      partes.push(apocope && (resto === 1 || resto === 21)
        ? palabra.replace(/uno$/, 'ún').replace(/^uno$/, 'un')
        : palabra);
    } else {
      const decena = Math.floor(resto / 10);
      const unidad = resto % 10;
      let palabra = DECENAS[decena];
      if (unidad) {
        const u = apocope && unidad === 1 ? 'un' : UNIDADES[unidad];
        palabra += ` y ${u}`;
      }
      partes.push(palabra);
    }
  }

  return partes.join(' ');
}

/** El número entero en palabras, sin moneda. */
function enteroALetras(n) {
  const entero = Math.floor(Math.abs(Number(n) || 0));
  if (entero === 0) return 'cero';

  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;
  const partes = [];

  if (millones === 1) partes.push('un millón');
  else if (millones > 1) partes.push(`${hasta999(millones, true)} millones`);

  // "mil" va solo: nadie dice "un mil quinientos".
  if (miles === 1) partes.push('mil');
  else if (miles > 1) partes.push(`${hasta999(miles, true)} mil`);

  if (resto) partes.push(hasta999(resto));

  return partes.join(' ');
}

/**
 * El monto como se escribe en la factura.
 * Los céntimos solo salen cuando los hay: "con 50/100".
 */
function montoEnLetras(monto, moneda = 'CRC') {
  const valor = Math.abs(Number(monto) || 0);
  const entero = Math.floor(valor);
  const centimos = Math.round((valor - entero) * 100);

  const nombre = moneda === 'USD' ? 'dólares estadounidenses' : 'colones costarricenses';
  const letras = enteroALetras(entero);
  const conCentimos = centimos > 0 ? ` con ${String(centimos).padStart(2, '0')}/100` : '';

  // Con mayúscula inicial, como se lee en el documento.
  const frase = `${letras}${conCentimos} ${nombre}`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

module.exports = { montoEnLetras, enteroALetras, hasta999 };
