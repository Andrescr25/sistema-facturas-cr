/**
 * Los mensajes con que se le manda cada cosa al cliente por WhatsApp.
 *
 * Viven en el frontend por lo mismo que mensajeInvitacion.js: es texto de
 * cara al cliente, y ese texto vive acá en todo el sistema. Son el punto de
 * partida, no una plantilla cerrada — se editan antes de mandar, porque un
 * cliente de confianza no lee igual que uno nuevo.
 *
 * La excepción es el recordatorio de saldo: ese lo arma el servidor, porque
 * los montos tienen que salir de los saldos de ese momento y no de lo que
 * tenga en pantalla un navegador abierto desde hace rato.
 */

const NEGOCIO = 'Distribuidora Tachi'

/**
 * El enlace va aparte del PDF y no en su lugar: el PDF sirve para guardarlo o
 * reenviarlo a quien decide, y la página web es la que muestra la FOTO de
 * cada producto — que es lo que el PDF no puede dar. Un cliente nuevo lee
 * "ROLLO BOLSA GDE.1X41 BASURA EZ" y no sabe qué le están ofreciendo.
 */
export function mensajeCotizacion({ numero, cliente, enlace }) {
  return `Buenas${cliente ? ` ${cliente}` : ''} 👋

Le adjunto la cotización ${numero} con los precios que conversamos.
${enlace ? `\nTambién la puede ver con las fotos de cada producto acá:\n${enlace}\n` : ''}
Los precios de esta cotización se mantienen hasta la fecha indicada en el documento. Cualquier consulta quedamos atentos.

${NEGOCIO}`
}

export function mensajeFactura({ numero, cliente }) {
  return `Buenas${cliente ? ` ${cliente}` : ''} 👋

Le adjunto la factura ${numero} de su compra.

Gracias por preferirnos.

${NEGOCIO}`
}

/**
 * El aviso de en qué va el pedido.
 *
 * Cada etapa dice algo distinto porque significan cosas distintas para quien
 * espera: "en preparación" es que ya se aceptó y se está alistando; "listo
 * para envío" es que puede esperar el camión.
 */
export function mensajePedido({ numero, cliente, etapa, enlace }) {
  const segunEtapa = {
    en_revision: 'Recibimos su pedido y lo estamos revisando.',
    en_preparacion: 'Su pedido ya fue aceptado y lo estamos alistando en bodega.',
    listo_para_envio: 'Su pedido ya está listo y sale para entrega. 🚚',
    no_procesado: 'Su pedido no se pudo procesar. Le contamos los detalles por acá.'
  }

  return `Buenas${cliente ? ` ${cliente}` : ''} 👋

${segunEtapa[etapa] || 'Le contamos cómo va su pedido.'}

Pedido #${numero}${enlace ? `\n\nPuede seguirlo acá:\n${enlace}` : ''}

${NEGOCIO}`
}
