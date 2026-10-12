// Cabeceras y filas de las colecciones en pantalla comparten un observador.
// No se escucha scroll ni se actualiza React durante la entrada.
let observador = null
const pendientes = new Set()
const destinos = new Map()
const alEntrar = new Map()
const colecciones = new Map()
let ultimaPosicion = 0
let ultimoInstante = 0

function sinMovimiento() {
  return typeof IntersectionObserver === 'undefined' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function desconectarSiVacio() {
  if (!pendientes.size && !colecciones.size) { observador?.disconnect(); observador = null }
}

function obtenerObservador() {
  if (observador) return observador
  ultimaPosicion = window.scrollY || 0
  ultimoInstante = performance.now()
  observador = new IntersectionObserver((entradas, instancia) => {
    if (instancia !== observador) return
    const ahora = performance.now()
    const posicion = window.scrollY || 0
    const intervalo = ahora - ultimoInstante
    // En una pasada rápida se muestran directamente las fichas que se saltan.
    const rapido = intervalo < 200 && Math.abs(posicion - ultimaPosicion) / Math.max(intervalo, 1) > 4
    ultimaPosicion = posicion
    ultimoInstante = ahora
    for (const entrada of entradas) {
      if (colecciones.has(entrada.target)) {
        colecciones.get(entrada.target)(entrada.isIntersecting)
        continue
      }
      if (!entrada.isIntersecting || !pendientes.has(entrada.target)) continue
      const destino = destinos.get(entrada.target) || entrada.target
      destino.dataset.entrada = rapido && alEntrar.has(entrada.target) ? 'directa' : 'visible'
      observador.unobserve(entrada.target)
      pendientes.delete(entrada.target)
      destinos.delete(entrada.target)
      const siguiente = alEntrar.get(entrada.target)
      alEntrar.delete(entrada.target)
      siguiente?.()
    }
    desconectarSiVacio()
  }, { threshold: 0, rootMargin: '0px 0px -36px 0px' })
  return observador
}

export function observarEntradaCategoria(elemento, despuesDeEntrar, destino = elemento) {
  if (!elemento || sinMovimiento() || ['visible', 'directa'].includes(destino.dataset.entrada)) return () => {}
  try {
    const o = obtenerObservador()
    pendientes.add(elemento)
    destinos.set(elemento, destino)
    if (despuesDeEntrar) alEntrar.set(elemento, despuesDeEntrar)
    o.observe(elemento)
    destino.dataset.entrada = 'espera'
  } catch {
    pendientes.delete(elemento)
    destinos.delete(elemento)
    alEntrar.delete(elemento)
    delete destino.dataset.entrada
    desconectarSiVacio()
    return () => {}
  }
  return () => {
    pendientes.delete(elemento)
    destinos.delete(elemento)
    alEntrar.delete(elemento)
    observador?.unobserve(elemento)
    if (destino.dataset.entrada === 'espera') delete destino.dataset.entrada
    desconectarSiVacio()
  }
}

/** Activa filas solo mientras su colección está en pantalla. */
export function vigilarColeccion(elemento, cambiar) {
  if (!elemento || sinMovimiento()) return () => {}
  try {
    const o = obtenerObservador()
    colecciones.set(elemento, cambiar)
    o.observe(elemento)
  } catch {
    colecciones.delete(elemento)
    cambiar(false)
    desconectarSiVacio()
    return () => {}
  }
  return () => {
    colecciones.delete(elemento)
    observador?.unobserve(elemento)
    desconectarSiVacio()
  }
}

/** Solo las próximas cuatro filas; las demás son visibles por defecto. */
export function observarFilasDelCatalogo(filas, inicio = 0) {
  let siguiente = inicio
  let retirado = false
  const retirar = new Map()
  function avanzar() {
    if (retirado) return
    while (siguiente < filas.length && ['visible', 'directa'].includes(filas[siguiente].dataset.entrada)) siguiente++
    if (siguiente >= filas.length) return
    const fila = filas[siguiente++]
    const primeraFicha = fila.querySelector?.('article') || fila
    retirar.set(fila, observarEntradaCategoria(primeraFicha, () => {
      retirar.delete(fila)
      avanzar()
    }, fila))
  }
  function preparar(indice) {
    for (const limpiar of retirar.values()) limpiar()
    retirar.clear()
    siguiente = indice
    for (let i = 0; i < 4; i++) avanzar()
  }
  preparar(inicio)
  return {
    preparar,
    limpiar() { retirado = true; for (const limpiar of retirar.values()) limpiar(); retirar.clear() }
  }
}

// Delegado en el contenedor. Sin timers ni transforms/capas permanentes.
export function terminarEntrada(evento) {
  if (evento.animationName?.startsWith('catalogo-') || evento.animationName?.startsWith('categoria-')) {
    evento.target.dataset.entradaTerminada = 'true'
  }
}
