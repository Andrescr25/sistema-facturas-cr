/**
 * Por qué falló una llamada a Alegra, dicho para quien está en la caja.
 *
 * QUÉ PASABA. Cuando Alegra rechazaba una factura, el error que subía era el
 * de axios —"Request failed with status code 400"— y ese es el texto que veía
 * el cajero. Alegra SÍ había explicado el motivo, en `response.data.message`:
 *
 *   "Configuraste el item PICHEL PLASTICO STAMPO 4 LITROS C/TAPA REF.PI0005
 *    para no poder facturar si no tiene stock."
 *
 * Ese detalle viajaba como cuarto argumento de `ResponseHelper.error`, que
 * SOLO lo incluye cuando NODE_ENV es 'development'. En producción se
 * descartaba, así que el motivo existía y no lo veía nadie. Una factura se
 * reintentó quince veces contra un rechazo que no iba a cambiar solo.
 *
 * LO QUE IMPORTA NO ES EL TEXTO SINO LA DIFERENCIA entre dos cosas que se
 * trataban igual:
 *
 *   · RECHAZO (Alegra contestó 4xx): no creó nada y no va a crear nada si se
 *     manda igual. Hay que arreglar algo antes.
 *   · SIN RESPUESTA (red, timeout): no se sabe si creó. Esto sí es para la
 *     cola de sin conexión.
 *
 * Guardar un rechazo en la cola de "sin conexión" es esconder un problema que
 * alguien puede arreglar detrás de un reintento infinito.
 */

/** Rechazos de Alegra en los que conviene decir además qué hacer. */
const QUE_HACER = [
  {
    // El caso que dejó dos facturas trabadas el 14 de setiembre de 2026.
    cuando: /no poder facturar si no tiene stock/i,
    consejo: 'Hay que entrarle existencias a ese producto en Alegra, o quitarlo de la factura y cobrarlo aparte.'
  },
  {
    cuando: /tipo de descuento es requerido/i,
    consejo: 'El descuento de esa línea quedó sin decir si es porcentaje o monto.'
  }
];

/**
 * @param {Error} error  el error tal como lo tira axios
 * @returns {{ mensaje: string, status: number, esRechazo: boolean }}
 *   esRechazo `true` significa que Alegra contestó que no: reenviar lo mismo
 *   vuelve a fallar, y NO hay que guardarlo como si fuera falta de señal.
 */
function explicarFalloAlegra(error) {
  // Los errores propios (idempotencia) ya vienen con su código y su mensaje
  // escrito para una persona. No se tocan.
  if (error?.status && !error.response) {
    return { mensaje: error.message, status: error.status, esRechazo: true };
  }

  const respuesta = error?.response;

  if (!respuesta) {
    // Ni siquiera hubo respuesta: puede haberla creado. Quien reciba esto no
    // debe reenviar a ciegas.
    return {
      mensaje: 'No se pudo llegar a Alegra. Revisá la conexión; si la factura salía, puede haber quedado creada allá.',
      status: 504,
      esRechazo: false
    };
  }

  const datos = respuesta.data || {};
  const deAlegra = datos.message || datos.error?.message || (typeof datos === 'string' ? datos : null);
  const codigo = respuesta.status;

  // 429 y 5xx de Alegra son pasajeros: mañana la misma factura pasa.
  if (codigo === 429 || codigo >= 500) {
    return {
      mensaje: deAlegra || 'Alegra no está respondiendo bien en este momento.',
      status: 503,
      esRechazo: false
    };
  }

  if (!deAlegra) {
    return {
      mensaje: `Alegra rechazó la factura (código ${codigo}) sin decir por qué.`,
      status: codigo,
      esRechazo: true
    };
  }

  const consejo = QUE_HACER.find((q) => q.cuando.test(deAlegra))?.consejo;
  return {
    mensaje: consejo ? `${deAlegra} ${consejo}` : deAlegra,
    status: codigo,
    esRechazo: true
  };
}

module.exports = { explicarFalloAlegra };
