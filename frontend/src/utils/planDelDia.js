/**
 * «Mi día» (2026-11-01): las cuentas de la pantalla del plan de visitas.
 * Puras, para probarlas sin navegador.
 */

/** Saca el elemento de `desde` y lo pone en `hasta`. Fuera de la lista no mueve nada. */
export function moverEn(lista, desde, hasta) {
  if (desde === hasta || desde < 0 || hasta < 0 || desde >= lista.length || hasta >= lista.length) return lista
  const copia = [...lista]
  const [elemento] = copia.splice(desde, 1)
  copia.splice(hasta, 0, elemento)
  return copia
}
