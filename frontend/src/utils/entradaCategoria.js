// Un observador para las cabeceras, no uno por producto ni un listener de
// scroll. La entrada ocurre una sola vez; todo es visible aun sin soporte.
let observador = null
const pendientes = new Set()

export function observarEntradaCategoria(elemento) {
  if (!elemento || typeof IntersectionObserver === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {}
  if (!observador) observador = new IntersectionObserver(entradas => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting || !pendientes.has(entrada.target)) continue
      entrada.target.dataset.entrada = 'visible'
      observador?.unobserve(entrada.target)
      pendientes.delete(entrada.target)
    }
    if (!pendientes.size) { observador?.disconnect(); observador = null }
  }, { threshold:0.12 })
  pendientes.add(elemento)
  observador.observe(elemento)
  return () => {
    pendientes.delete(elemento)
    observador?.unobserve(elemento)
    if (!pendientes.size) { observador?.disconnect(); observador = null }
  }
}
