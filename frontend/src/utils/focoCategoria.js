const limitar = n => Math.max(0, Math.min(1, n))
const suave = (a, b, p) => { const t = limitar((p - a) / (b - a)); return t * t * (3 - 2 * t) }

/** La secuencia depende del recorrido, nunca del tiempo ni de la imagen. */
export function focoEnCategoria(top, alto, ventana) {
  const progreso = limitar((ventana * .46 - top) / (alto + ventana * .28))
  const entrada = suave(.25, .43, progreso)
  const salida = suave(.72, .91, progreso)
  return {
    progreso,
    oscuridad: suave(0, .22, progreso) * (1 - suave(.78, 1, progreso)),
    contenido: entrada * (1 - salida),
    desplazamiento: 40 * (1 - entrada) - 20 * salida,
    escala: .97 + .03 * entrada,
    fase: progreso <= 0 || progreso >= 1 ? 'claro' : progreso < .25 ? 'oscurecer' : progreso < .78 ? 'categoria' : 'aclarar',
  }
}

const controles = new WeakMap()

/** Solo los separadores próximos al viewport se miden; ningún producto. */
export function registrarFocoCategoria(elemento, prepararImagen) {
  const raiz = elemento?.closest('[data-recorrido-categorias]')
  if (!raiz || typeof IntersectionObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') {
    prepararImagen?.()
    return () => {}
  }
  let control = controles.get(raiz)
  if (!control) {
    control = crearControl(raiz, () => controles.delete(raiz))
    controles.set(raiz, control)
  }
  return control.registrar(elemento, prepararImagen)
}

function crearControl(raiz, alVaciar) {
  const elementos = new Set()
  const proximos = new Set()
  const preparaciones = new Map()
  const medio = window.matchMedia('(prefers-reduced-motion: reduce)')
  const velo = raiz.querySelector('.catalogo-oscurecer')
  let observador = null
  let frame = null
  let escuchando = false
  let activo = null
  let retirado = false

  function quitarEscena() {
    if (!activo && !raiz.dataset.focoCategoria) return
    if (activo) {
      activo.style.removeProperty('--foco-contenido')
      activo.style.removeProperty('--foco-y')
      activo.style.removeProperty('--foco-escala')
      delete activo.dataset.foco
    }
    activo = null
    velo?.style.removeProperty('opacity')
    delete raiz.dataset.focoCategoria
  }

  function pintar() {
    frame = null
    if (retirado || medio.matches) { quitarEscena(); return }
    const ventana = window.innerHeight
    let elegido = null
    let estado = null
    // En los saltos se elige el separador con mayor oscurecimiento.
    // Todos los rectángulos se leen antes de escribir estilos.
    for (const elemento of proximos) {
      const rect = elemento.getBoundingClientRect()
      const candidato = focoEnCategoria(rect.top, rect.height, ventana)
      if (candidato.oscuridad > (estado?.oscuridad || 0)) { elegido = elemento; estado = candidato }
    }
    if (!elegido) { quitarEscena(); return }
    if (activo !== elegido) { quitarEscena(); activo = elegido }
    velo.style.opacity = estado.oscuridad.toFixed(3)
    activo.style.setProperty('--foco-contenido', estado.contenido.toFixed(3))
    activo.style.setProperty('--foco-y', `${estado.desplazamiento.toFixed(2)}px`)
    activo.style.setProperty('--foco-escala', estado.escala.toFixed(4))
    if (activo.dataset.foco !== estado.fase) activo.dataset.foco = estado.fase
    if (raiz.dataset.focoCategoria !== estado.fase) raiz.dataset.focoCategoria = estado.fase
  }

  function programar() {
    if (frame === null && !retirado) frame = requestAnimationFrame(pintar)
  }

  function escuchar(activar) {
    if (activar === escuchando) return
    escuchando = activar
    if (activar) {
      window.addEventListener('scroll', programar, { passive: true })
      window.addEventListener('resize', programar)
    } else {
      window.removeEventListener('scroll', programar)
      window.removeEventListener('resize', programar)
      if (frame !== null) { cancelAnimationFrame(frame); frame = null }
      quitarEscena()
    }
  }

  function desactivar() {
    observador?.disconnect()
    observador = null
    proximos.clear()
    escuchar(false)
    quitarEscena()
    for (const elemento of elementos) delete elemento.dataset.inmersiva
    for (const preparar of preparaciones.values()) preparar?.()
    preparaciones.clear()
  }

  function observar() {
    if (medio.matches || !velo) { desactivar(); return }
    try {
      if (!observador) observador = new IntersectionObserver((entradas, instancia) => {
        if (instancia !== observador || retirado) return
        for (const entrada of entradas) {
          if (!elementos.has(entrada.target)) continue
          if (entrada.isIntersecting) {
            proximos.add(entrada.target)
            preparaciones.get(entrada.target)?.()
            preparaciones.delete(entrada.target)
          }
          else proximos.delete(entrada.target)
        }
        escuchar(proximos.size > 0)
        if (proximos.size) programar()
      }, { rootMargin: '80% 0px 80% 0px', threshold: 0 })
      for (const elemento of elementos) {
        if (elemento.dataset.inmersiva) continue
        elemento.dataset.inmersiva = 'true'
        observador.observe(elemento)
      }
    } catch { desactivar() }
  }

  function cambiarPreferencia() { desactivar(); observar() }
  medio.addEventListener('change', cambiarPreferencia)

  return {
    registrar(elemento, prepararImagen) {
      elementos.add(elemento)
      if (prepararImagen) preparaciones.set(elemento, prepararImagen)
      observar()
      return () => {
        elementos.delete(elemento)
        preparaciones.delete(elemento)
        proximos.delete(elemento)
        observador?.unobserve(elemento)
        delete elemento.dataset.inmersiva
        if (activo === elemento) quitarEscena()
        escuchar(proximos.size > 0)
        if (proximos.size) programar()
        if (!elementos.size) {
          retirado = true
          desactivar()
          medio.removeEventListener('change', cambiarPreferencia)
          alVaciar()
        }
      }
    },
  }
}
