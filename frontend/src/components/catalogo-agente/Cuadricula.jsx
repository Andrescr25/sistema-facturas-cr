import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Layers } from 'lucide-react'
import TarjetaProductoAgente from './TarjetaProductoAgente'
import TarjetaMarca from './TarjetaMarca'
import VistaPreviaProducto from './VistaPreviaProducto'
import { agruparMarcasCatalogo } from '../../utils/marcasCatalogo'
import { useColumnasCatalogo } from '../../hooks/useColumnasCatalogo'
import { filasDelCatalogo, nombreDeFamilia } from '../../utils/filasCatalogo'
import { observarFilasDelCatalogo, vigilarColeccion, terminarEntrada } from '../../utils/entradaCategoria'
import './cuadricula.css'

function Cuadricula({ productos, familias, statsPorProducto, animar = true, nivel = 3, agruparMarcas = true }) {
  const elemento = useRef(null)
  const entradas = useRef(null)
  const columnas = useColumnasCatalogo()
  const [vistaPrevia, setVistaPrevia] = useState(null)
  const visual = useMemo(() => agruparMarcas
    ? { productos: agruparMarcasCatalogo(productos), familias: familias?.map(f => ({ ...f, productos: agruparMarcasCatalogo(f.productos) })) }
    : { productos, familias }, [productos, familias, agruparMarcas])
  const { filas, grupos, inicioPorFamilia } = useMemo(
    () => filasDelCatalogo(visual.productos, visual.familias, columnas), [visual, columnas]
  )
  const Titulo = `h${nivel}`

  useLayoutEffect(() => {
    if (!animar) return
    const elementos = [...elemento.current.querySelectorAll('.catalogo-fila')]
    const primeraFicha = elementos.map(e => e.querySelector('article'))
    function cambiarVisibilidad(visible) {
      if (!visible) { entradas.current?.limpiar(); entradas.current = null; return }
      if (entradas.current) return
      // Empezar en la fila que se ve al restaurar posición o cambiar ancho.
      // Solo al activar esta colección; nunca medir el catálogo por frame.
      let a = 0, b = elementos.length
      while (a < b) {
        const medio = Math.floor((a + b) / 2)
        if (primeraFicha[medio].getBoundingClientRect().bottom < 101) a = medio + 1
        else b = medio
      }
      entradas.current = observarFilasDelCatalogo(elementos, a)
    }
    const rect = elemento.current.getBoundingClientRect()
    if (rect.top < window.innerHeight - 36 && rect.bottom > 101) cambiarVisibilidad(true)
    const quitar = vigilarColeccion(elemento.current, cambiarVisibilidad)
    return () => { quitar(); entradas.current?.limpiar(); entradas.current = null }
  }, [filas, animar])

  function irAFamilia(indice) {
    const destino = inicioPorFamilia.get(indice)
    entradas.current?.preparar(destino)
    const grupo = elemento.current.querySelector(`[data-fila="${destino}"]`)
    const fila = grupo?.querySelector('.catalogo-fila__titulos') || grupo?.querySelector('article')
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    fila?.scrollIntoView({ block: 'start', behavior: reducido ? 'auto' : 'smooth' })
  }

  return (
    <div ref={elemento} className="catalogo-cuadricula" onAnimationEnd={terminarEntrada}>
      {grupos.length > 0 && (
        <nav className="catalogo-familias" aria-label="Subcategorías">
          <span className="catalogo-familias__rotulo"><Layers size={14} aria-hidden="true" /> Subcategorías</span>
          <div className="catalogo-familias__opciones">
            {grupos.map((f, i) => (
              <button type="button" key={i} onClick={() => irAFamilia(i)}
                aria-label={`Ver ${nombreDeFamilia(f)}, ${f.productos.reduce((n, p) => n + (p.presentaciones?.length || 1), 0)} productos`}>
                {nombreDeFamilia(f)} <span>{f.productos.reduce((n, p) => n + (p.presentaciones?.length || 1), 0)}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
      <div className="catalogo-filas" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
        {filas.map((fila, i) => (
          <div className="catalogo-fila" data-fila={i} key={`${columnas}-${fila.productos[0].id}`}>
            {fila.familias.length > 0 && (
              <div className="catalogo-fila__titulos">
                {fila.familias.map(indice => (
                  <div className="catalogo-fila__titulo" key={indice}>
                    <span className="catalogo-fila__linea" aria-hidden="true" />
                    <Titulo>{nombreDeFamilia(grupos[indice])}</Titulo>
                    <span className="catalogo-fila__cantidad">{grupos[indice].productos.reduce((n, p) => n + (p.presentaciones?.length || 1), 0)}</span>
                  </div>
                ))}
                <ArrowDown size={15} className="catalogo-fila__flecha" aria-hidden="true" />
              </div>
            )}
            {fila.productos.map(p => p.esMarca ? (
              <TarjetaMarca key={p.id} grupo={p} onVerProducto={setVistaPrevia} />
            ) : (
              <TarjetaProductoAgente key={p.id} product={p}
                stats={p._stats || statsPorProducto?.get(String(p.id))}
                mostrarSinSubcategoria={Boolean(familias)} />
            ))}
          </div>
        ))}
      </div>
      {vistaPrevia && <VistaPreviaProducto key={vistaPrevia.id} producto={vistaPrevia} onCerrar={() => setVistaPrevia(null)} />}
    </div>
  )
}

export default memo(Cuadricula)
