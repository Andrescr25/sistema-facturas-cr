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
 *
 * Hoy todos los que llaman acá pasan un Date, así que el error estaba
 * latente. Se vio en la rama de la migración, donde un recordatorio le decía
 * a un cliente "vencida hace 6 días" cuando eran 5.
 */
const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaEnCostaRica(momento) {
  if (typeof momento === 'string' && SOLO_DIA.test(momento.trim())) return momento.trim();
  const d = momento instanceof Date ? momento : new Date(momento);
  if (Number.isNaN(d.getTime())) return null;
  return FORMATO.format(d);
}

/**
 * El día de una columna DATE tal como la entrega la base ("AAAA-MM-DD"), o
 * null si no es una fecha.
 *
 * El driver de Postgres devuelve un DATE como un objeto Date puesto a la
 * medianoche LOCAL del servidor, no como texto. Dos formas de leerlo mal:
 *  - `String(fecha).slice(0, 10)` da "Mon Oct 12". El 2026-10-13 eso tumbó
 *    el cambio de cliente de una factura: al sumarle los días del plazo salía
 *    «Invalid time value»; las pruebas usaban una fecha de texto y pasaban.
 *  - `diaEnCostaRica(fecha)` lo trata como un instante: en un servidor en UTC
 *    la medianoche es todavía el día anterior en Costa Rica.
 * Lo correcto es leer sus partes locales, que es como el driver lo armó. Un
 * texto que ya es un día (con o sin hora detrás) se devuelve recortado.
 */
function diaDeBase(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    const dos = (n) => String(n).padStart(2, '0');
    return `${valor.getFullYear()}-${dos(valor.getMonth() + 1)}-${dos(valor.getDate())}`;
  }
  const texto = String(valor ?? '').trim().slice(0, 10);
  return SOLO_DIA.test(texto) ? texto : null;
}

/**
 * Suma días a un día de calendario ("AAAA-MM-DD") y devuelve otro día.
 * Trabaja en UTC de punta a punta: así no arrastra husos ni cambios de hora.
 */
function sumarDias(dia, dias) {
  const [a, m, d] = String(dia).split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + Number(dias || 0));
  return base.toISOString().slice(0, 10);
}

/** Cuántos días van de un día de calendario a otro (negativo si ya pasó). */
function diasEntre(desde, hasta) {
  const aUtc = (dia) => { const [a, m, d] = String(dia).split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86400000);
}

/** Hoy en Costa Rica ("AAAA-MM-DD"). */
function hoyEnCostaRica(momento = new Date()) {
  return diaEnCostaRica(momento);
}

/**
 * La hora de AHORA en Costa Rica, para escribirla en SQL en una columna
 * `timestamp` SIN zona horaria.
 *
 * NO usar CURRENT_TIMESTAMP ni now() a secas en esas columnas: la base se
 * usa por el pooler de Supabase en modo transacción, y el `SET TIME ZONE`
 * que hace cada conexión al abrirse no queda pegado. Medido el 2026-10-01:
 * 1 de cada 5 consultas corría con la sesión en UTC, y lo guardado ahí
 * quedaba 6 horas adelantado (una factura "enviada a impresión" a las 17:25
 * cuando eran las 14:58). `now()` es un instante absoluto; pasarlo a la zona
 * por nombre da la misma hora en cualquier sesión.
 */
const AHORA_CR_SQL = "(now() AT TIME ZONE 'America/Costa_Rica')";

module.exports = { hoyEnCostaRica, diaEnCostaRica, diaDeBase, sumarDias, diasEntre, AHORA_CR_SQL };
