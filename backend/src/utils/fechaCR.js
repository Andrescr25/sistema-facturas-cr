/**
 * El día del calendario en Costa Rica.
 *
 * POR QUÉ EXISTE
 * `new Date().toISOString().split('T')[0]` da la fecha en UTC, y Costa Rica
 * es UTC−6: a partir de las 6 de la tarde ese valor ya es el día siguiente.
 * Todo lo que se fecha de noche —un abono, una factura salida de una
 * cotización, un ajuste de inventario— quedaba con la fecha de mañana. Acá se
 * trabaja de noche, así que no era un caso raro.
 *
 * Se NOMBRA la zona en vez de confiar en la del servidor: este código corre
 * en Render, en scripts sueltos y en las pruebas, y `TZ` no siempre está
 * puesta.
 *
 * OJO: esto es para DÍAS del calendario. Un `timestamp` con hora completa
 * (`new Date().toISOString()`) es un instante y está bien como está; no hay
 * que "corregirlo".
 */

const FORMATO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit'
});

/**
 * El día de una fecha cualquiera, visto desde Costa Rica ("AAAA-MM-DD").
 *
 * Un texto que YA es un día de calendario se devuelve tal cual. Convertirlo
 * sería un error: JavaScript parsea "2026-09-08" como medianoche UTC y, al
 * formatearlo en UTC−6, devolvía "2026-09-07". Pasar de un día de calendario
 * a un día de calendario es la identidad; la conversión solo tiene sentido
 * para un INSTANTE (un Date con hora).
 */
const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaEnCostaRica(momento) {
  if (typeof momento === 'string' && SOLO_DIA.test(momento.trim())) return momento.trim();
  const d = momento instanceof Date ? momento : new Date(momento);
  if (Number.isNaN(d.getTime())) return null;
  return FORMATO.format(d);
}

/** Hoy en Costa Rica ("AAAA-MM-DD"). */
function hoyEnCostaRica(momento = new Date()) {
  return diaEnCostaRica(momento);
}

module.exports = { hoyEnCostaRica, diaEnCostaRica };
