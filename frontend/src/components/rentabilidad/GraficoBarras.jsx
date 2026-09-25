import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Table2 } from 'lucide-react'

/**
 * Gráfico de barras de UNA serie, hecho a mano en SVG (sin librería: son
 * barras, y así cada detalle sigue la guía de gráficos del sistema).
 *
 *   · Barras finas (hasta 24 px), punta redondeada de 4 px, base recta.
 *   · Un solo color. `resaltar` pinta más oscuras las N más altas: es la
 *     respuesta a "¿cuándo se vende más?", sin hacer que el ojo la busque.
 *   · Un período en curso (`enCurso`) va más claro: todavía no terminó y
 *     compararlo con uno completo engaña.
 *   · Grilla en línea fina, ejes con números redondos.
 *   · Al pasar el mouse o con el teclado (Tab), cada barra muestra su valor.
 *     Además la tabla (botón "Ver tabla") tiene todos los valores: el detalle
 *     no depende de poder pasar el mouse.
 *   · Mide su ancho real, así las etiquetas no se enciman en el teléfono.
 *
 * `datos`: [{ clave, etiqueta, titulo, valor }] — `etiqueta` va en el eje,
 * `titulo` en el detalle y en la tabla.
 */

const ALTO_GRAFICO = 180
const MARGEN = { arriba: 22, derecha: 8, abajo: 26, izquierda: 48 }
const RADIO = 4

/** Números redondos para el eje: 0, 250, 500… */
function marcasEje(maximo) {
  if (!(maximo > 0)) return [0]
  const bruto = maximo / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) || bruto
  const marcas = []
  for (let v = 0; v <= maximo + paso * 0.001; v += paso) marcas.push(v)
  if (marcas[marcas.length - 1] < maximo) marcas.push(marcas[marcas.length - 1] + paso)
  return marcas
}

/** Barra con la punta redondeada y la base recta. */
function rutaBarra(x, y, ancho, alto) {
  if (alto <= 0) return ''
  const r = Math.min(RADIO, ancho / 2, alto)
  return `M${x},${y + alto} V${y + r} Q${x},${y} ${x + r},${y} H${x + ancho - r} Q${x + ancho},${y} ${x + ancho},${y + r} V${y + alto} Z`
}

function useAncho() {
  const ref = useRef(null)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    setAncho(ref.current.clientWidth)
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho]
}

export default function GraficoBarras({
  datos,
  formato = (v) => String(v),
  formatoEje = formato,
  resaltar = 0,
  enCurso = null,
  alto = ALTO_GRAFICO,
  descripcion
}) {
  const [ref, ancho] = useAncho()
  const [activa, setActiva] = useState(null)
  const [tabla, setTabla] = useState(false)

  useEffect(() => { setActiva(null) }, [datos])

  const maximo = Math.max(0, ...datos.map((d) => d.valor))
  const marcas = useMemo(() => marcasEje(maximo), [maximo])
  const tope = marcas[marcas.length - 1] || 1

  // Las N más altas (y > 0), por su clave: son las que se resaltan.
  const destacadas = useMemo(() => new Set(
    [...datos].filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, resaltar).map((d) => d.clave)
  ), [datos, resaltar])
  const maxClave = useMemo(() => [...datos].sort((a, b) => b.valor - a.valor)[0]?.clave, [datos])

  const anchoPlot = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha)
  const banda = datos.length ? anchoPlot / datos.length : 0
  const anchoBarra = Math.max(2, Math.min(24, banda - 2))
  const y = (v) => MARGEN.arriba + alto - (v / tope) * alto
  // Cada cuántas barras cabe una etiqueta sin encimarse.
  const largoEtiqueta = Math.max(...datos.map((d) => String(d.etiqueta).length), 1) * 6.5 + 8
  const cada = Math.max(1, Math.ceil(largoEtiqueta / Math.max(banda, 1)))

  const activo = activa !== null ? datos[activa] : null

  return (
    <div>
      <div ref={ref} className="relative w-full" onMouseLeave={() => setActiva(null)}>
        {ancho > 0 && (
          <svg width={ancho} height={alto + MARGEN.arriba + MARGEN.abajo} role="img"
            aria-label={descripcion || 'Gráfico de barras'} className="block overflow-visible">
            {marcas.map((m) => (
              <g key={m}>
                <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={y(m)} y2={y(m)}
                  className="stroke-neutro-100" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={MARGEN.izquierda - 8} y={y(m)} dy="0.32em" textAnchor="end"
                  className="fill-neutro-400 text-[11px] tabular-nums">{formatoEje(m)}</text>
              </g>
            ))}
            {datos.map((d, i) => {
              const x0 = MARGEN.izquierda + i * banda
              const xBarra = x0 + (banda - anchoBarra) / 2
              const altoBarra = (d.valor / tope) * alto
              const clase = d.clave === enCurso
                ? 'fill-primario-200'
                : destacadas.has(d.clave) ? 'fill-primario-600' : 'fill-primario-400'
              return (
                <g key={d.clave}>
                  <path d={rutaBarra(xBarra, y(d.valor), anchoBarra, altoBarra)}
                    className={`${clase} transition-opacity ${activa !== null && activa !== i ? 'opacity-50' : ''}`} />
                  {/* El valor escrito solo en la más alta: un número en cada
                      barra no lo lee nadie. El resto, al pasar el mouse. */}
                  {d.clave === maxClave && d.valor > 0 && (
                    <text x={xBarra + anchoBarra / 2} y={y(d.valor) - 6} textAnchor="middle"
                      className="fill-neutro-700 text-[11px] font-semibold tabular-nums">{formatoEje(d.valor)}</text>
                  )}
                  {i % cada === 0 && (
                    <text x={x0 + banda / 2} y={MARGEN.arriba + alto + 17} textAnchor="middle"
                      className="fill-neutro-500 text-[11px]">{d.etiqueta}</text>
                  )}
                  {/* El blanco que se toca es toda la franja, no la barra: una
                      barra baja o fina no se atina. */}
                  <rect x={x0} y={MARGEN.arriba} width={banda} height={alto} fill="transparent"
                    tabIndex={0} role="button" aria-label={`${d.titulo}: ${formato(d.valor)}`}
                    className="cursor-default outline-none focus-visible:stroke-primario-300 focus-visible:stroke-2"
                    onMouseEnter={() => setActiva(i)} onFocus={() => setActiva(i)} onBlur={() => setActiva(null)} />
                </g>
              )
            })}
            <line x1={MARGEN.izquierda} x2={ancho - MARGEN.derecha} y1={MARGEN.arriba + alto} y2={MARGEN.arriba + alto}
              className="stroke-neutro-300" strokeWidth={1} shapeRendering="crispEdges" />
          </svg>
        )}

        {activo && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-neutro-900 px-2.5 py-1.5 text-white shadow-lg"
            style={{
              left: Math.min(Math.max(MARGEN.izquierda + (activa + 0.5) * banda, 70), ancho - 70),
              top: Math.max(y(activo.valor) - 8, 16)
            }}>
            <p className="text-sm font-bold tabular-nums">{formato(activo.valor)}</p>
            <p className="text-[11px] text-neutro-300">{activo.titulo}{activo.clave === enCurso ? ' · en curso' : ''}</p>
          </div>
        )}
      </div>

      <button type="button" onClick={() => setTabla((v) => !v)}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-neutro-500 hover:bg-neutro-100 hover:text-neutro-800">
        <Table2 size={14} /> {tabla ? 'Ocultar tabla' : 'Ver tabla'}
      </button>
      {tabla && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-neutro-100">
          <table className="w-full text-sm">
            <tbody>
              {datos.map((d) => (
                <tr key={d.clave} className="border-b border-neutro-50 last:border-0">
                  <td className="px-3 py-1.5 text-neutro-600">{d.titulo}{d.clave === enCurso ? ' (en curso)' : ''}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-neutro-900">{formato(d.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
