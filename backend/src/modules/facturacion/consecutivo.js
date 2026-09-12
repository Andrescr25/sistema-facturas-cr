/**
 * El número de la factura propia.
 *
 * DOS DOCUMENTOS NO PUEDEN COMPARTIR NÚMERO. No alcanza con "buscar el último
 * y sumarle uno": dos cajas facturando a la vez leerían el mismo último. Por
 * eso el consecutivo se toma con `FOR UPDATE`, que hace esperar a la segunda
 * hasta que la primera termine, y dentro de la MISMA transacción que guarda la
 * factura: si la factura no se guarda, el número no se gasta.
 *
 * EL NÚMERO NO SE ARMA IGUAL EN LAS DOS SERIES:
 *   no electrónica  serie + consecutivo tal cual    00100001 + 4869
 *   electrónica     serie + consecutivo a 10 dígitos
 * `ancho_consecutivo` (0 = sin relleno) lo dice, en vez de que cada llamador
 * lo adivine.
 *
 * LAS SERIES CONTINÚAN LAS DE ALEGRA. La del día a día venía en 4868 cuando se
 * copió; empezar de nuevo en 1 emitiría números que ya existen.
 */

const { httpError } = require('../../utils/validacion');

/**
 * Toma el siguiente número de una serie y lo deja reservado.
 *
 * ELECTRÓNICA NO ES OTRO TIPO DE DOCUMENTO: la misma factura se emite en papel
 * o electrónica y ante Hacienda sigue siendo una factura. Por eso el tipo y la
 * forma de emisión se piden por separado, y las dos series conviven en la
 * misma terminal.
 *
 * @param {object} cliente  cliente de Postgres DENTRO de una transacción —
 *        no el pool: el número se gasta solo si la factura se guarda.
 * @param {string} tipo  'factura' | 'tiquete' | 'nota_credito'
 * @param {{electronica?: boolean}} [opciones]
 * @returns {Promise<{serie: string, consecutivo: number, numero: string, electronica: boolean}>}
 */
async function tomarConsecutivo(cliente, tipo = 'factura', { electronica = false } = {}) {
  const { rows } = await cliente.query(
    `SELECT id, serie, siguiente, ancho_consecutivo, electronica, activo
       FROM serie_consecutivo
      WHERE tipo_documento = $1 AND electronica = $2
      ORDER BY id
      LIMIT 1
      FOR UPDATE`,
    [tipo, electronica]
  );

  const como = electronica ? 'electrónica' : 'no electrónica';
  const serie = rows[0];
  if (!serie) throw httpError(400, `No hay una serie configurada para "${tipo}" ${como}.`);
  if (!serie.activo) {
    throw httpError(400, `La serie de "${tipo}" ${como} está inactiva. Actívela en Configuración antes de emitir.`);
  }
  if (!serie.serie) throw httpError(400, `La serie de "${tipo}" no tiene prefijo configurado.`);

  const consecutivo = Number(serie.siguiente);
  await cliente.query(
    'UPDATE serie_consecutivo SET siguiente = siguiente + 1 WHERE id = $1',
    [serie.id]
  );

  return {
    serie: serie.serie,
    consecutivo,
    numero: formatearNumero(serie.serie, consecutivo, serie.ancho_consecutivo),
    electronica: Boolean(serie.electronica)
  };
}

/** serie + consecutivo, rellenado a `ancho` dígitos cuando `ancho` es mayor a 0. */
function formatearNumero(serie, consecutivo, ancho = 0) {
  const n = Number(ancho) > 0
    ? String(consecutivo).padStart(Number(ancho), '0')
    : String(consecutivo);
  return `${serie}${n}`;
}

/** Las series configuradas, para mostrarlas en Configuración. */
async function listarSeries(ejecutor) {
  const { rows } = await ejecutor.query(
    `SELECT id, tipo_documento, descripcion, serie, sucursal, terminal,
            siguiente, ancho_consecutivo, electronica, activo
       FROM serie_consecutivo
      ORDER BY electronica, tipo_documento`
  );
  return rows.map(r => ({
    ...r,
    siguiente: Number(r.siguiente),
    proximoNumero: r.serie ? formatearNumero(r.serie, Number(r.siguiente), r.ancho_consecutivo) : null
  }));
}

module.exports = { tomarConsecutivo, formatearNumero, listarSeries };
