import { useEffect, useRef } from 'react'

/**
 * Carga la página siguiente cuando el centinela entra en pantalla.
 *
 * Reemplaza al botón "Ver más". Con 2.000 productos, hacer que el cliente
 * toque un botón cada 60 es pedirle trabajo por nada.
 *
 * `rootMargin` dispara la carga 600px ANTES de llegar al final: si esperara
 * a que el centinela sea visible, el cliente vería el vacío mientras llega
 * la respuesta. Con ese margen la lista se siente continua.
 *
 * Se vuelve a observar cuando cambia `cargarMas` —que cambia con la página y
 * los filtros— para que el observador nunca quede apuntando a una función
 * vieja que pediría la página equivocada.
 */
export function useScrollInfinito({ hayMas, cargando, cargarMas }) {
  const centinela = useRef(null)

  useEffect(() => {
    const nodo = centinela.current
    if (!nodo || !hayMas || cargando) return

    const observador = new IntersectionObserver(
      (entradas) => { if (entradas[0]?.isIntersecting) cargarMas() },
      { rootMargin: '600px 0px' }
    )
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [hayMas, cargando, cargarMas])

  return centinela
}
