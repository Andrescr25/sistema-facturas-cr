import { useRef, useState } from 'react'

const BORDE = 80
const PASO_SCROLL = 14

/**
 * Una lista que se ordena arrastrando con el dedo o el mouse (2026-11-01,
 * «Mi día»: «que el agente lo edite a su gusto»).
 *
 * El arrastre HTML5 (`draggable`, el de Clientes → Rutas) no funciona en
 * pantallas táctiles. Acá se usan eventos de puntero sobre el asa: el asa
 * lleva `touch-none` para que el dedo arrastre en vez de desplazar la página,
 * y la página se desplaza sola al acercarse al borde. Las posiciones se toman
 * al empezar, así lo que se corre durante el arrastre no confunde el destino.
 *
 * `children(elemento, indice, { asa, arrastrando })`: `asa` va en el elemento
 * que se toma para arrastrar.
 */
export default function ListaOrdenable({ elementos, claveDe, onMover, children, className = 'space-y-2' }) {
  const caja = useRef(null)
  const [arrastre, setArrastre] = useState(null)

  const empezar = (indice) => (e) => {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const filas = [...caja.current.children].map(f => { const r = f.getBoundingClientRect(); return { medio: r.top + window.scrollY + r.height / 2, alto: r.height } })
    const separacion = filas.length > 1 ? Math.abs(filas[1].medio - filas[0].medio) - (filas[0].alto + filas[1].alto) / 2 : 0
    setArrastre({ desde: indice, hasta: indice, y0: e.clientY, scroll0: window.scrollY, dy: 0, filas, salto: filas[indice].alto + separacion })
  }

  const mover = (e) => {
    if (!arrastre) return
    if (e.clientY < BORDE) window.scrollBy(0, -PASO_SCROLL)
    else if (e.clientY > window.innerHeight - BORDE) window.scrollBy(0, PASO_SCROLL)
    const y = e.clientY + window.scrollY
    const hasta = arrastre.filas.filter((f, i) => i !== arrastre.desde && f.medio < y).length
    setArrastre(a => ({ ...a, hasta, dy: (e.clientY - a.y0) + (window.scrollY - a.scroll0) }))
  }

  const soltar = () => {
    if (arrastre && arrastre.hasta !== arrastre.desde) onMover(arrastre.desde, arrastre.hasta)
    setArrastre(null)
  }

  // Los demás se corren para dejar el hueco donde caería.
  const corrimiento = (i) => {
    if (!arrastre || i === arrastre.desde) return 0
    const { desde, hasta, salto } = arrastre
    if (desde < hasta && i > desde && i <= hasta) return -salto
    if (hasta < desde && i >= hasta && i < desde) return salto
    return 0
  }

  return (
    <ol ref={caja} className={className}>
      {elementos.map((el, i) => {
        const esEste = arrastre?.desde === i
        return (
          <li key={claveDe(el)} className={`relative ${esEste ? 'z-10' : 'transition-transform duration-150'}`}
            style={{ transform: `translateY(${esEste ? arrastre.dy : corrimiento(i)}px)` }}>
            {children(el, i, {
              arrastrando: esEste,
              asa: { onPointerDown: empezar(i), onPointerMove: mover, onPointerUp: soltar, onPointerCancel: soltar, className: 'touch-none cursor-grab active:cursor-grabbing' }
            })}
          </li>
        )
      })}
    </ol>
  )
}
