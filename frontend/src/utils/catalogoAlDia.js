/**
 * ¿La copia del catálogo que Facturación guarda en el dispositivo sigue al
 * día? Las reglas, SIN IMPORTS y sin React:
 * backend/tests/catalogoAlDia.test.js lo importa tal cual.
 *
 * POR QUÉ EXISTE (2026-10-13). Facturación trabaja con una copia del catálogo
 * guardada en el dispositivo, para poder facturar sin internet, y solo la
 * renovaba cuando alguien tocaba «Actualizar». El usuario reactivó un
 * producto en Gestión de Catálogo y preguntó por qué no aparecía en
 * Facturación: la copia era de antes. Lo mismo pasaba con un producto nuevo
 * o con un precio corregido, y eso es peor porque no se nota.
 *
 * Ahora la pantalla le pregunta al servidor una HUELLA del catálogo —un
 * texto corto que cambia cuando cambia algo de lo que se vende— y solo si es
 * distinta de la que guardó baja los productos otra vez.
 */

/** Dónde se guarda la huella de la última copia bajada. */
export const CLAVE_HUELLA = 'facturacion_huella_catalogo'

/** Cada cuánto se vuelve a preguntar con la pantalla abierta. */
export const CADA_MS = 3 * 60 * 1000

/** Lo mínimo entre dos preguntas: volver a la pestaña diez veces no son diez pedidos. */
export const MINIMO_MS = 45 * 1000

/** ¿Toca preguntar ya? `ultima` es cuándo se preguntó por última vez (0 = nunca). */
export function tocaPreguntar(ahora, ultima, minimo = MINIMO_MS) {
  return !ultima || ahora - ultima >= minimo
}

/**
 * ¿Hay que bajar el catálogo otra vez? Sí cuando la huella del servidor es
 * distinta de la guardada, o cuando nunca se guardó una. Si el servidor no
 * contestó una huella (uno viejo, o un error), NO: no se baja el catálogo
 * entero a ciegas cada tres minutos.
 */
export function cambio(guardada, servidor) {
  const actual = String(servidor ?? '').trim()
  if (!actual) return false
  return String(guardada ?? '').trim() !== actual
}
