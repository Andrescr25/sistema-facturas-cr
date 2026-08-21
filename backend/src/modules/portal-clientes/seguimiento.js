/**
 * Portal de clientes - En qué etapa va un pedido
 *
 * El cliente que envía un pedido quiere saber qué pasó con él. Las etapas NO
 * son un estado nuevo que haya que mantener: salen de datos que el sistema ya
 * lleva, y por eso no se pueden desincronizar de la realidad.
 *
 *   En revisión       pedido_cliente.estado = 'pendiente'
 *                     lo envió y todavía nadie lo facturó
 *
 *   En preparación    estado = 'facturado' + facturas.estado_bodega = 'pendiente'
 *                     ya es factura y bodega la tiene para alistar
 *
 *   Listo para envío  estado = 'facturado' + facturas.estado_bodega = 'procesado'
 *                     bodega la alistó (warehouse.service.js es el único
 *                     lugar del sistema que escribe ese valor)
 *
 *   No procesado      estado = 'rechazado', o la factura quedó anulada
 *
 * DEVUELVE CLAVES, NO TEXTOS
 * Los textos en español viven en el frontend
 * (components/catalogo-clientes/SeguimientoPedido.jsx), donde ya vive el
 * resto del texto de cara al cliente. Acá solo la regla, que es lo que se
 * puede probar sin navegador.
 */

const EN_REVISION = 'en_revision';
const EN_PREPARACION = 'en_preparacion';
const LISTO_PARA_ENVIO = 'listo_para_envio';
const NO_PROCESADO = 'no_procesado';

/** Las etapas por las que pasa un pedido que va bien, en orden. */
const ETAPAS = [EN_REVISION, EN_PREPARACION, LISTO_PARA_ENVIO];

/**
 * @param {object} pedido
 * @param {string} pedido.estado        pedido_cliente.estado
 * @param {string|null} pedido.estadoBodega  facturas.estado_bodega (null si
 *   la factura todavía no tiene fila local)
 */
function etapaDePedido({ estado, estadoBodega } = {}) {
  if (estado === 'rechazado') return NO_PROCESADO;

  if (estado === 'facturado') {
    // La copia se anuló (duplicado de la conversión a electrónica). Para el
    // cliente ese pedido no va a llegar: no puede quedar en "En preparación".
    if (estadoBodega === 'anulada') return NO_PROCESADO;
    if (estadoBodega === 'procesado') return LISTO_PARA_ENVIO;
    // Sin fila en `facturas` todavía (se factura y la fila se inserta en el
    // mismo golpe, pero puede leerse en el medio): la factura EXISTE, así que
    // la etapa honesta es "En preparación", no un error.
    return EN_PREPARACION;
  }

  return EN_REVISION;
}

/**
 * La línea de tiempo completa: cada etapa con si ya se alcanzó y cuándo.
 *
 * Una etapa alcanzada puede no tener fecha —las facturas anteriores a la
 * columna bodega_procesado_en— y eso se dibuja como alcanzada con la fecha en
 * blanco. Inventar una fecha sería peor que no mostrarla.
 *
 * Un pedido rechazado o anulado NO devuelve línea de tiempo: mostrar pasos
 * que nunca van a completarse al lado de un "No procesado" solo confunde. En
 * ese caso la pantalla muestra el motivo.
 */
function seguimientoDePedido({ estado, estadoBodega, creadoEn, resueltoEn, bodegaProcesadoEn } = {}) {
  const etapa = etapaDePedido({ estado, estadoBodega });
  if (etapa === NO_PROCESADO) return [];

  const alcanzadaHasta = ETAPAS.indexOf(etapa);
  const fechas = {
    [EN_REVISION]: creadoEn || null,
    [EN_PREPARACION]: resueltoEn || null,
    [LISTO_PARA_ENVIO]: bodegaProcesadoEn || null
  };

  return ETAPAS.map((clave, i) => ({
    clave,
    alcanzada: i <= alcanzadaHasta,
    fecha: i <= alcanzadaHasta ? fechas[clave] : null
  }));
}

module.exports = {
  ETAPAS,
  EN_REVISION,
  EN_PREPARACION,
  LISTO_PARA_ENVIO,
  NO_PROCESADO,
  etapaDePedido,
  seguimientoDePedido
};
