import { useEffect, useRef } from 'react'

const VELOCIDAD = 26          // px por segundo — lento, para leer al pasar
const PAUSA_TRAS_TOCAR = 3500 // ms de quietud antes de retomar solo

/**
 * Desplaza un carrusel solo, hacia la derecha.
 *
 * SE ANIMA EL SCROLL NATIVO, no un `transform` sobre una pista duplicada.
 * La versión con transform da un bucle más limpio, pero mata el arrastre con
 * el dedo: el cliente ya no podría adelantar los productos por su cuenta.
 * Acá el contenedor sigue siendo un scroll común, así que sirve el dedo y la
 * rueda del ratón, y la animación solo lo empuja.
 *
 * LA POSICIÓN SE LLEVA APARTE, en `pos`, y no se lee de `scrollLeft` en cada
 * cuadro. A 26 px/s y 60 cuadros por segundo, cada cuadro avanza 0,4px: el
 * navegador redondea `scrollLeft` a entero al leerlo, así que sumar sobre lo
 * leído devolvía siempre cero y el carrusel se quedaba quieto pareciendo que
 * el bucle no corría. Con el acumulador propio la fracción no se pierde.
 *
 * SE DETIENE APENAS EL CLIENTE INTERVIENE: un carrusel moviéndose mientras
 * alguien apunta a "Agregar" hace fallar el toque, que es peor que no tener
 * animación. Retoma sola tras unos segundos de quietud.
 *
 * Respeta `prefers-reduced-motion`: hay gente a la que el movimiento continuo
 * le causa mareo, y para ellos queda quieto y se arrastra a mano.
 */
export function useCarruselAuto({ activo = true } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    const nodo = ref.current
    if (!nodo || !activo) return

    const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (sinMovimiento?.matches) return

    let cuadro = 0
    let ultimo = 0
    let pausadoHasta = 0
    let sobreEncima = false
    let ultimoTactil = false
    let pos = nodo.scrollLeft

    // Al intervenir el cliente, la posición real la manda él: se vuelve a
    // tomar de scrollLeft para que al retomar no pegue un salto hacia donde
    // estaba el acumulador.
    const pausar = () => {
      pausadoHasta = performance.now() + PAUSA_TRAS_TOCAR
      pos = nodo.scrollLeft
    }

    const paso = (ahora) => {
      cuadro = requestAnimationFrame(paso)
      const dt = ultimo ? (ahora - ultimo) / 1000 : 0
      ultimo = ahora

      // Un dt enorme llega al volver de una pestaña en segundo plano; sin
      // descartarlo el carrusel pegaría un brinco de varios segundos.
      if (sobreEncima || ahora < pausadoHasta || dt <= 0 || dt > 0.5) return

      const maximo = nodo.scrollWidth - nodo.clientWidth
      if (maximo <= 1) return // todo cabe en pantalla: nada que desplazar

      pos += VELOCIDAD * dt
      // Al llegar al final vuelve al principio de un salto, no arrastrando
      // 3.000px hacia atrás delante del cliente, que se ve como un error.
      if (pos >= maximo - 0.5) pos = 0
      nodo.scrollLeft = pos
    }

    // La pausa "pegada" (mientras el puntero esté encima) es SOLO para
    // ratón. En un teléfono, Chrome dispara mouseenter al tocar y no manda
    // nunca el mouseleave, así que con eso un toque dejaba el carrusel
    // congelado para siempre. En táctil vale únicamente la pausa con tiempo.
    const entrar = (e) => { if (!e || e.pointerType === 'mouse') sobreEncima = true }
    const salir = () => { sobreEncima = false; ultimo = 0; pos = nodo.scrollLeft }

    // Enfocar con el teclado sí debe detenerlo mientras se recorre con Tab,
    // pero tocar un botón también da foco: ahí se usa la pausa con tiempo,
    // o quedaría igual de congelado que con el mouseenter emulado.
    const alEnfocar = () => { ultimoTactil ? pausar() : (sobreEncima = true) }
    const marcarTactil = () => { ultimoTactil = true; pausar() }
    const marcarPuntero = (e) => { ultimoTactil = e.pointerType === 'touch'; pausar() }

    nodo.addEventListener('pointerenter', entrar)
    nodo.addEventListener('pointerleave', salir)
    nodo.addEventListener('focusin', alEnfocar)
    nodo.addEventListener('focusout', salir)
    nodo.addEventListener('touchstart', marcarTactil, { passive: true })
    nodo.addEventListener('wheel', pausar, { passive: true })
    nodo.addEventListener('pointerdown', marcarPuntero)

    cuadro = requestAnimationFrame(paso)

    return () => {
      cancelAnimationFrame(cuadro)
      nodo.removeEventListener('pointerenter', entrar)
      nodo.removeEventListener('pointerleave', salir)
      nodo.removeEventListener('focusin', alEnfocar)
      nodo.removeEventListener('focusout', salir)
      nodo.removeEventListener('touchstart', marcarTactil)
      nodo.removeEventListener('wheel', pausar)
      nodo.removeEventListener('pointerdown', marcarPuntero)
    }
  }, [activo])

  return ref
}
