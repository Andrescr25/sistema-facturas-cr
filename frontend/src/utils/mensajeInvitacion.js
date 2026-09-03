/**
 * El mensaje con que se le manda el enlace del portal a un cliente.
 *
 * Vive acá, y no en el servidor, por dos razones. La primera es que el
 * servidor no puede armarlo aunque quiera: del token de invitación guarda
 * solo el hash, así que el único que conoce el enlace es el navegador que
 * acaba de generarlo. La segunda es que es texto de cara al cliente, y ese
 * texto vive en el frontend en todo el sistema.
 *
 * Se puede editar antes de mandarlo — esto es el punto de partida, no una
 * plantilla cerrada. Un cliente de confianza no lee igual que uno nuevo.
 */
export function mensajeInvitacion(enlace) {
  return `Hola 👋

Les comparto este enlace para facilitar la autogestión de pedidos, la consulta y revisión de facturas, así como el acceso a información sobre nuevos productos.

Si gustan, pueden crear su cuenta y comenzar a utilizar el portal desde el siguiente enlace:

${enlace}

La idea es que puedan realizar estas gestiones de forma más rápida, sencilla y sin necesidad de comunicarse directamente para cada solicitud.`
}
