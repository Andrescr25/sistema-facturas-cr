/**
 * Qué días se mantiene despierto el Evolution API (WhatsApp).
 *
 * POR QUÉ NO ES TODOS LOS DÍAS
 * Ese servicio está en el plan gratuito de Render, que da 750 horas de
 * ejecución al mes. Un ping cada 10 minutos lo mantiene encendido las 24
 * horas, y un solo servicio así se come ~730 horas: la cuota entera.
 *
 * Manteniéndolo solo martes, miércoles y jueves son unos 13 días al mes,
 * ~312 horas, que entra holgado. Los otros días el servicio duerme y se
 * despierta solo cuando alguien manda una orden de verdad — tarda unos 30
 * segundos esa primera vez, y sigue funcionando igual.
 *
 * Va en su propio archivo, fuera de server.js, para poder probar el cálculo
 * del día sin levantar el servidor: equivocarse en la numeración de los días
 * es de los errores más fáciles de cometer y más difíciles de ver (se
 * descubriría un martes cualquiera, cuando el pedido salga lento).
 */

/** Domingo es 0, como en Date.getDay(). */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Martes, miércoles y jueves. */
const DIAS_POR_DEFECTO = [2, 3, 4];

/**
 * Lee la lista de días desde la configuración ("2,3,4").
 * Ante cualquier cosa rara se queda con los días por defecto: mejor gastar
 * horas de más que dejar el WhatsApp dormido un día de pedidos.
 */
function leerDias(valor) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return DIAS_POR_DEFECTO;
  }

  const dias = String(valor)
    .split(',')
    .map(d => Number(String(d).trim()))
    .filter(d => Number.isInteger(d) && d >= 0 && d <= 6);

  return dias.length > 0 ? [...new Set(dias)] : DIAS_POR_DEFECTO;
}

/**
 * ¿Toca mantenerlo despierto ahora?
 *
 * `fecha` se pasa desde afuera para poder probar cualquier día sin tocar el
 * reloj del sistema. En producción es la hora de Costa Rica, porque
 * server.js fija process.env.TZ antes de cargar nada.
 */
function debeMantenerDespierto(fecha, dias = DIAS_POR_DEFECTO) {
  return dias.includes(fecha.getDay());
}

/** "martes, miércoles y jueves" — para el mensaje de arranque. */
function nombrarDias(dias) {
  const nombres = [...dias].sort((a, b) => a - b).map(d => DIAS[d]);
  if (nombres.length === 0) return 'ningún día';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

module.exports = { leerDias, debeMantenerDespierto, nombrarDias, DIAS_POR_DEFECTO, DIAS };
