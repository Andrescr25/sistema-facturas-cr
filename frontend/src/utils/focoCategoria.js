const limitar = n => Math.max(0, Math.min(1, n))
const suave = (a, b, p) => { const t = limitar((p - a) / (b - a)); return t * t * (3 - 2 * t) }

/** Adónde quiere llegar la escena según dónde está el separador. */
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

/**
 * LO QUE SE VE SIGUE AL DEDO, NO LO COPIA (2026-10-18). El usuario: «cuando
 * el cliente va por un cambio de categoría la animación es muy brusca y se
 * queda pegado». Medido en tablet: un gesto mueve el scroll a saltos, y como
 * la escena copiaba el scroll, el oscurecido pasaba de 0 a 1 en un cuadro.
 * Ahora cada valor se acerca a lo que pide el recorrido con una curva
 * exponencial POR TIEMPO: igual de suave a 60 o a 30 cuadros por segundo, y
 * un cuadro lento (una foto que se decodifica) cuenta como mucho MAXIMO_DT.
 */
export const SUAVIZADO_MS = 110
const MAXIMO_DT = 50
export function acercar(actual, objetivo, dt, margen = .002) {
  const t = 1 - Math.exp(-Math.min(Math.max(dt, 0), MAXIMO_DT) / SUAVIZADO_MS)
  const siguiente = actual + (objetivo - actual) * t
  return Math.abs(objetivo - siguiente) < margen ? objetivo : siguiente
}

const CLARO = { oscuridad: 0, contenido: 0, desplazamiento: 40, escala: .97, fase: 'claro' }

/**
 * NUNCA QUEDA A OSCURAS NI A MEDIAS. Si el dedo se detiene a medio camino, la
 * escena termina sola en el estado estable más cercano: la categoría entera
 * a la vista o el catálogo claro. Antes podía quedar la pantalla negra y
 * vacía, o la foto a medio aparecer, hasta volver a mover el dedo.
 */
export const QUIETO_MS = 260
const CATEGORIA = { oscuridad: 1, contenido: 1, desplazamiento: 0, escala: 1, fase: 'categoria' }
export function alQuedarseQuieto(estado) {
  if (estado.progreso <= 0 || estado.progreso >= 1) return estado
  if (estado.progreso < .125 || estado.progreso >= .72) return { ...CLARO, desplazamiento: estado.desplazamiento }
  return CATEGORIA
}

/**
 * Elegir una categoría en la barra no pide seguir bajando: la presentación
 * se reproduce sola sobre sus productos y termina en claro.
 */
export const PRESENTACION_MS = { categoria: 220, aclarar: 1250 }
export function enPresentacion(ms) {
  if (ms < PRESENTACION_MS.categoria) return { oscuridad: 1, contenido: 0, desplazamiento: 40, escala: .97, fase: 'oscurecer' }
  if (ms < PRESENTACION_MS.aclarar) return CATEGORIA
  return { ...CLARO, desplazamiento: -20, escala: 1 }
}

const MARGEN = { oscuridad: .002, contenido: .002, desplazamiento: .1, escala: .0005 }
const controles = new WeakMap()
const reloj = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

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

/** Cuánto está oscurecida la vista ahora (lo escrito, sin recalcular estilos). */
export function oscuridadActual(documento = document) {
  return Number(documento.querySelector('[data-recorrido-categorias] .catalogo-oscurecer')?.style.opacity) || 0
}

/**
 * Al elegir una categoría en la barra: llevar la vista a sus productos y
 * reproducir su presentación, siguiendo desde la oscuridad `previa` (la que
 * había antes de cambiar de colección: sin ella, tocar otra categoría con
 * una escena a la vista hacía un parpadeo a claro). Devuelve false si el
 * efecto no está activo (movimiento reducido, sin observador): quien llama
 * sube al principio.
 */
export function entrarACategoria(previa = 0, documento = document) {
  const separador = documento.querySelector('[data-recorrido-categorias] .transicion-categoria[data-inmersiva]')
  const control = separador && controles.get(separador.closest('[data-recorrido-categorias]'))
  const productos = separador?.nextElementSibling
  if (!control || !productos) return false
  productos.scrollIntoView({ block: 'start', behavior: 'auto' })
  return control.presentar(separador, previa)
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
  let vista = { ...CLARO }
  let ultimoCuadro = null
  let ultimoScroll = -Infinity
  let presentacion = null

  function soltar(elemento) {
    elemento.style.removeProperty('--foco-contenido')
    elemento.style.removeProperty('--foco-y')
    elemento.style.removeProperty('--foco-escala')
    delete elemento.dataset.foco
  }

  function quitarEscena() {
    vista = { ...CLARO }
    if (!activo && !raiz.dataset.focoCategoria) return
    if (activo) soltar(activo)
    activo = null
    velo?.style.removeProperty('opacity')
    delete raiz.dataset.focoCategoria
    delete raiz.dataset.presentando
  }

  /** Lo que pide el recorrido: el separador más oscuro entre los próximos. */
  function delRecorrido(ahora) {
    const ventana = window.innerHeight
    let elegido = null
    let estado = null
    // Todos los rectángulos se leen antes de escribir estilos.
    for (const elemento of proximos) {
      const rect = elemento.getBoundingClientRect()
      const candidato = focoEnCategoria(rect.top, rect.height, ventana)
      if (candidato.oscuridad > (estado?.oscuridad || 0)) { elegido = elemento; estado = candidato }
    }
    if (!elegido) return { elegido: null, objetivo: CLARO, esperando: false }
    const quieto = ahora - ultimoScroll >= QUIETO_MS
    const aMedias = estado.progreso > 0 && estado.progreso < 1
    return { elegido, objetivo: quieto ? alQuedarseQuieto(estado) : estado, esperando: aMedias && !quieto }
  }

  function pintar() {
    frame = null
    if (retirado || medio.matches) { quitarEscena(); return }
    const ahora = reloj()
    const dt = ultimoCuadro === null || ahora - ultimoCuadro > 120 ? 16 : ahora - ultimoCuadro
    ultimoCuadro = ahora

    let { elegido, objetivo, esperando } = presentacion
      ? { elegido: presentacion.elemento, objetivo: enPresentacion(ahora - presentacion.inicio), esperando: false }
      : delRecorrido(ahora)

    // Otra categoría: la anterior se va antes de ceder la escena.
    if (activo && elegido !== activo) {
      if (vista.contenido > .01) objetivo = { ...objetivo, contenido: 0, desplazamiento: -20 }
      else { soltar(activo); activo = null; vista = { ...vista, contenido: 0, desplazamiento: 40, escala: .97 } }
    }
    if (!activo && elegido) activo = elegido

    for (const clave of Object.keys(MARGEN)) vista[clave] = acercar(vista[clave], objetivo[clave], dt, MARGEN[clave])

    if (vista.oscuridad === 0 && vista.contenido === 0 && objetivo.oscuridad === 0 && objetivo.contenido === 0) {
      // Ya no se ve nada y no hay nada que mostrar: se retira y se detiene.
      presentacion = null
      quitarEscena()
      if (!proximos.size) escuchar(false)
      else if (esperando) programar()
      return
    }

    velo.style.opacity = vista.oscuridad.toFixed(3)
    if (activo) {
      activo.style.setProperty('--foco-contenido', vista.contenido.toFixed(3))
      activo.style.setProperty('--foco-y', `${vista.desplazamiento.toFixed(2)}px`)
      activo.style.setProperty('--foco-escala', vista.escala.toFixed(4))
    }
    const fase = objetivo.fase === 'claro' ? 'aclarar' : objetivo.fase
    if (activo && activo.dataset.foco !== fase) activo.dataset.foco = fase
    if (raiz.dataset.focoCategoria !== fase) raiz.dataset.focoCategoria = fase
    // La presentación termina sola: no se invita a seguir bajando.
    if (presentacion) raiz.dataset.presentando = 'true'
    else delete raiz.dataset.presentando
    const asentado = Object.keys(MARGEN).every(clave => vista[clave] === objetivo[clave])
    if (!asentado || esperando || presentacion) programar()
  }

  function programar() {
    if (frame === null && !retirado) frame = requestAnimationFrame(pintar)
  }

  function alDesplazar() {
    ultimoScroll = reloj()
    // Mover el dedo durante la presentación le devuelve el mando al recorrido.
    if (presentacion && Math.abs((window.scrollY || 0) - presentacion.posicion) > 4) presentacion = null
    programar()
  }

  function escuchar(activar) {
    if (activar === escuchando) return
    escuchando = activar
    if (activar) {
      window.addEventListener('scroll', alDesplazar, { passive: true })
      window.addEventListener('resize', programar)
    } else {
      window.removeEventListener('scroll', alDesplazar)
      window.removeEventListener('resize', programar)
      if (frame !== null) { cancelAnimationFrame(frame); frame = null }
      ultimoCuadro = null
      quitarEscena()
    }
  }

  function preparar(elemento) {
    preparaciones.get(elemento)?.()
    preparaciones.delete(elemento)
  }

  function desactivar() {
    observador?.disconnect()
    observador = null
    proximos.clear()
    presentacion = null
    escuchar(false)
    quitarEscena()
    for (const elemento of elementos) delete elemento.dataset.inmersiva
    for (const preparacion of preparaciones.values()) preparacion?.()
    preparaciones.clear()
  }

  function observar() {
    if (medio.matches || !velo) { desactivar(); return }
    try {
      if (!observador) observador = new IntersectionObserver((entradas, instancia) => {
        if (instancia !== observador || retirado) return
        for (const entrada of entradas) {
          if (!elementos.has(entrada.target)) continue
          if (entrada.isIntersecting) { proximos.add(entrada.target); preparar(entrada.target) }
          else proximos.delete(entrada.target)
        }
        // Si el último separador se aleja con la escena todavía a la vista,
        // termina de apagarse sola: cortarla en seco era otro salto.
        if (proximos.size) escuchar(true)
        if (escuchando) programar()
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
    presentar(elemento, previa = 0) {
      if (retirado || medio.matches || !observador || !elementos.has(elemento)) return false
      preparar(elemento)
      vista = { ...vista, oscuridad: Math.max(vista.oscuridad, limitar(previa)) }
      presentacion = { elemento, inicio: reloj(), posicion: window.scrollY || 0 }
      escuchar(true)
      programar()
      return true
    },
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
        if (presentacion?.elemento === elemento) presentacion = null
        // Buscar o cambiar de colección retira la escena en el acto.
        if (activo === elemento) quitarEscena()
        if (!proximos.size && !presentacion) escuchar(false)
        else programar()
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
