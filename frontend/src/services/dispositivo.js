import indexedDBService from './indexedDBService'

/**
 * Identidad del dispositivo y claves de factura que sobreviven al reintento.
 *
 * POR QUÉ HACE FALTA
 * El backend ya sabe no crear dos veces la misma factura, pero solo si quien
 * la manda le da una CLAVE estable. Sin ella, el navegador reenvía y el
 * servidor no tiene cómo saber que es la misma.
 *
 * La clave tiene que cumplir dos cosas a la vez:
 *
 *   estable    la misma factura conserva su clave en todos los reintentos,
 *              hoy y dentro de tres días si quedó atascada
 *   única      dos dispositivos distintos no pueden generar la misma
 *
 * Lo segundo importa de verdad: el `localId` de IndexedDB es un contador que
 * arranca en 1 en CADA aparato. La tablet del agente y la computadora del
 * mostrador tendrían las dos una factura `local-1`, y el servidor las tomaría
 * por la misma — descartando en silencio la segunda, que es una venta real.
 * Por eso la clave lleva adelante un identificador del dispositivo.
 */

const CLAVE_DISPOSITIVO = 'id_dispositivo'

/** Un identificador propio de este aparato, creado una sola vez. */
export async function idDispositivo() {
  // getConfig devuelve el VALOR, no la fila. Leerlo como `.value` daba
  // siempre undefined y generaba un identificador nuevo en cada llamada —
  // con lo que cada reintento habría mandado una clave distinta y el
  // servidor las habría visto como facturas diferentes. O sea: la protección
  // entera anulada, en silencio.
  const guardado = await indexedDBService.getConfig(CLAVE_DISPOSITIVO)
  if (guardado) return guardado

  // randomUUID no existe en contextos sin HTTPS (una tablet entrando por IP
  // en la red del local, por ejemplo), así que hay una alternativa. No es
  // criptografía: solo tiene que ser distinto entre aparatos.
  const nuevo = (globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

  await indexedDBService.setConfig(CLAVE_DISPOSITIVO, nuevo)
  console.log('🆔 Identificador de este dispositivo:', nuevo)
  return nuevo
}

/**
 * Una clave nueva para una factura que se va a crear.
 *
 * Se pide UNA vez, ANTES del primer intento de envío, y desde ahí acompaña a
 * esa factura para siempre. No se vuelve a calcular al reintentar: una clave
 * nueva por intento haría que el servidor los viera como facturas distintas,
 * que es justo lo que se quiere evitar.
 *
 * NO se arma con el localId de IndexedDB, aunque sería más legible. El
 * localId recién existe DESPUÉS de guardar, y para entonces ya se hizo el
 * primer intento en línea — que es el más peligroso: si ese POST expira,
 * el servidor pudo haber creado la factura, y la copia que se guarda offline la
 * crearía una segunda vez. La clave tiene que existir antes que él.
 */
export async function nuevaClaveFactura() {
  const dispositivo = await idDispositivo()
  const unico = (globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)
  return `disp-${dispositivo}-f${unico}`
}
