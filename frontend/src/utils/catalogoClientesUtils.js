/**
 * Utilidades del catálogo de clientes. Sin dependencias ni acceso a red, para
 * poder probar el armado del pedido —que es lo que termina en el teléfono de
 * un cliente— sin abrir un navegador.
 */

/**
 * Colones con punto de miles: ₡204.879.
 *
 * A propósito NO usa toLocaleString('es-CR') como el resto del sistema. En
 * Node y en varios navegadores esa configuración regional separa los miles
 * con un espacio duro (U+00A0), así que ₡204 879 se lee como dos números
 * —y esto no es una pantalla interna: viaja dentro de un mensaje de
 * WhatsApp, donde además ese carácter sobrevive mal al copiar y pegar.
 * En Costa Rica los miles se escriben con punto.
 *
 * Sin decimales: son precios de lista en colones enteros y el mensaje se
 * lee en un teléfono, donde cada carácter de más estorba.
 */
export function formatearColones(monto) {
  const entero = Math.round(Number(monto) || 0)
  const signo = entero < 0 ? '-' : ''
  return `${signo}₡${Math.abs(entero).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
