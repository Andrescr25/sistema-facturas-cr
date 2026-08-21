/**
 * Bloqueos tipo kiosco para la página del catálogo público (tablets de
 * agentes de venta). El pinch-zoom, doble-tap-zoom y zoom por teclado ya
 * están bloqueados globalmente para todo el sitio (ver frontend/src/main.jsx)
 * — aquí solo se agrega lo que NO conviene aplicar globalmente (bloquear
 * click derecho/selección de texto rompería el uso normal de facturación,
 * reportes, etc.), y solo mientras esta página está montada.
 */
export function applyCatalogoAgenteGuards() {
  const prevUserSelect = document.body.style.userSelect
  const prevWebkitUserSelect = document.body.style.webkitUserSelect
  const prevWebkitTouchCallout = document.body.style.webkitTouchCallout

  document.body.style.userSelect = 'none'
  document.body.style.webkitUserSelect = 'none'
  document.body.style.webkitTouchCallout = 'none'

  const preventDefault = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  let touchStartY = 0
  const onTouchStart = (event) => {
    touchStartY = event.touches[0]?.clientY ?? 0
  }
  const onTouchMove = (event) => {
    const touchY = event.touches[0]?.clientY ?? 0
    const deltaY = touchY - touchStartY
    const isAtTop = window.scrollY <= 0 && document.documentElement.scrollTop <= 0
    if (isAtTop && deltaY > 30) {
      event.preventDefault()
    }
  }

  document.addEventListener('contextmenu', preventDefault, { capture: true })
  document.addEventListener('selectstart', preventDefault, { capture: true })
  document.addEventListener('dragstart', preventDefault, { capture: true })
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false })

  return function removeCatalogoAgenteGuards() {
    document.body.style.userSelect = prevUserSelect
    document.body.style.webkitUserSelect = prevWebkitUserSelect
    document.body.style.webkitTouchCallout = prevWebkitTouchCallout

    document.removeEventListener('contextmenu', preventDefault, { capture: true })
    document.removeEventListener('selectstart', preventDefault, { capture: true })
    document.removeEventListener('dragstart', preventDefault, { capture: true })
    document.removeEventListener('touchstart', onTouchStart, { passive: true })
    document.removeEventListener('touchmove', onTouchMove, { passive: false })
  }
}
