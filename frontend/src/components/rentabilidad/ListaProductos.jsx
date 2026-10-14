import { useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, ImageOff, Search, TrendingDown, X } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { colonesCorto, colonesExactos, porcentaje, unidades } from '../../utils/rentabilidadFormato'
import { urlArchivo } from '../../utils/urlArchivo'

/**
 * La lista de productos, como tarjetas grandes que se tocan enteras (la
 * forma de Cuentas por Cobrar): lista → detalle.
 *
 * Cada tarjeta dice lo que se pidió ver de un vistazo: el margen de hoy, la
 * rotación real (unidades por semana y por mes, su clase) y cuánto dejó en
 * los últimos 3 meses. El detalle, con sus gráficas, está al tocarla.
 */

const ORDENES = [
  { valor: 'vendidos', texto: 'Más vendidos' },
  { valor: 'ganancia', texto: 'Más ganancia' },
  { valor: 'margen-alto', texto: 'Mayor margen' },
  { valor: 'margen-bajo', texto: 'Menor margen' },
  { valor: 'nombre', texto: 'Por nombre' }
]

export const TONO_CLASE = { A: 'activo', B: 'neutro', C: 'neutro' }

export function Foto({ url, nombre, tamano = 'h-16 w-16' }) {
  const [rota, setRota] = useState(false)
  if (!url || rota) {
    return (
      <div className={`${tamano} flex shrink-0 items-center justify-center rounded-xl bg-neutro-50 text-neutro-300`}>
        <ImageOff size={20} />
      </div>
    )
  }
  return <img src={urlArchivo(url)} alt={nombre} onError={() => setRota(true)} className={`${tamano} shrink-0 rounded-xl bg-neutro-50 object-contain`} />
}

/** El margen con su aviso: sin costo no hay margen, y bajo cero se pierde plata. */
export function AvisoMargen({ producto }) {
  if (producto.margen === null) {
    return <Insignia tono="alerta" icono={AlertTriangle}>{producto.calidadCosto === 'UNIDAD_SOSPECHOSA' ? 'Costo dudoso' : 'Sin costo'}</Insignia>
  }
  if (producto.margen < 0) return <Insignia tono="peligro" icono={TrendingDown}>Bajo el costo</Insignia>
  return null
}

function Cifra({ titulo, valor, pie }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-neutro-500">{titulo}</p>
      <p className="truncate text-base font-bold text-neutro-900">{valor}</p>
      {pie && <p className="truncate text-xs text-neutro-400">{pie}</p>}
    </div>
  )
}

function TarjetaProducto({ producto: p, onAbrir }) {
  return (
    <button type="button" onClick={() => onAbrir(p)}
      className="card flex w-full flex-col gap-4 p-5 text-left transition hover:border-primario-200 hover:shadow-md active:scale-[0.99]">
      <div className="flex min-w-0 items-start gap-4">
        <Foto url={p.imagenUrl} nombre={p.nombre} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Insignia tono={TONO_CLASE[p.clase]}>Rotación {p.clase}</Insignia>
            <AvisoMargen producto={p} />
          </div>
          <h3 className="mt-1.5 break-words text-lg font-bold leading-tight text-neutro-900">{p.nombre}</h3>
          <p className="mt-0.5 truncate text-sm text-neutro-500">
            {p.referencia ? `Ref. ${p.referencia} · ` : ''}{p.categoria}{p.subcategoria ? ` · ${p.subcategoria}` : ''}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-neutro-100 pt-3 sm:grid-cols-4">
        <Cifra titulo="Precio con IVA" valor={p.precioConIva !== null ? colonesExactos(p.precioConIva) : '—'} />
        <Cifra titulo="Margen hoy" valor={porcentaje(p.margen)} />
        <Cifra titulo="Rotación mensual" valor={`${unidades(p.unidadesMes)} u. / mes`} pie="Últimos 30 días" />
        <Cifra titulo="Dejó (3 meses)" valor={p.ganancia !== null ? colonesCorto(p.ganancia) : '—'}
          pie={p.facturas ? `en ${p.facturas} ${p.facturas === 1 ? 'factura' : 'facturas'}` : 'sin ventas'} />
      </div>
    </button>
  )
}

export default function ListaProductos({ filtros, setFiltros, limpiarFiltros, lista, cargando, error, categorias, onAbrir }) {
  const hayFiltro = filtros.buscar || filtros.categoria || filtros.clase || filtros.costo
  const selectClase = 'input h-12 rounded-xl text-base'

  return (
    <section id="productos" className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutro-900">Productos <span className="font-normal text-neutro-400">· {lista.total}</span></h2>
        <p className="text-sm text-neutro-500">Margen de hoy, rotación de los últimos 3 meses y lo que dejaron.</p>
      </div>

      <div className="card flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative min-w-0 flex-1 lg:min-w-[260px]">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input value={filtros.buscar} onChange={(e) => setFiltros({ buscar: e.target.value })}
            placeholder="Buscar por nombre o referencia…" aria-label="Buscar producto"
            className="input h-12 w-full rounded-xl pl-10 pr-10 text-base" />
          {filtros.buscar && (
            <button type="button" onClick={() => setFiltros({ buscar: '' })} aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-neutro-400 hover:bg-neutro-100"><X size={18} /></button>
          )}
        </div>
        <select value={filtros.categoria} onChange={(e) => setFiltros({ categoria: e.target.value })} aria-label="Categoría" className={`${selectClase} lg:w-56`}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtros.clase} onChange={(e) => setFiltros({ clase: e.target.value })} aria-label="Rotación" className={`${selectClase} lg:w-44`}>
          <option value="">Toda rotación</option>
          <option value="A">Rotación A</option>
          <option value="B">Rotación B</option>
          <option value="C">Rotación C</option>
        </select>
        <select value={filtros.orden} onChange={(e) => setFiltros({ orden: e.target.value })} aria-label="Orden" className={`${selectClase} lg:w-44`}>
          {ORDENES.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
        {hayFiltro && (
          <button type="button" onClick={limpiarFiltros}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-primario-700 hover:bg-primario-50">
            <X size={16} /> Quitar filtros
          </button>
        )}
      </div>

      {filtros.costo && (
        <p className="flex items-center gap-2 rounded-xl bg-alerta-50 px-4 py-3 text-sm text-alerta-800">
          <AlertTriangle size={16} className="shrink-0" />
          {filtros.costo === 'negativo' ? 'Solo los que se venden por debajo del costo.' : 'Solo los que no tienen un costo confiable (sin margen que calcular).'}
          <button type="button" onClick={() => setFiltros({ costo: '' })} className="ml-auto font-semibold underline">Quitar</button>
        </p>
      )}

      {error && <p className="rounded-xl bg-peligro-50 px-4 py-3 text-sm text-peligro-800">{error}</p>}

      {/* Mientras recarga, la lista anterior se queda atenuada: sin saltos. */}
      <div className={`grid gap-4 lg:grid-cols-2 ${cargando ? 'opacity-60' : ''}`}>
        {lista.data.map((p) => <TarjetaProducto key={p.productoId} producto={p} onAbrir={onAbrir} />)}
      </div>

      {!cargando && lista.data.length === 0 && (
        <div className="card py-12 text-center">
          <p className="text-lg font-bold text-neutro-800">Ningún producto con esos filtros</p>
          <p className="mt-1 text-sm text-neutro-500">Probá con otra palabra o quitá un filtro.</p>
        </div>
      )}

      {lista.paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={filtros.pagina <= 1} onClick={() => setFiltros({ pagina: filtros.pagina - 1 })}
            className="btn btn-outline inline-flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={16} /> Anterior</button>
          <span className="text-sm text-neutro-500">Página {lista.pagina} de {lista.paginas}</span>
          <button type="button" disabled={filtros.pagina >= lista.paginas} onClick={() => setFiltros({ pagina: filtros.pagina + 1 })}
            className="btn btn-outline inline-flex items-center gap-1 disabled:opacity-40">Siguiente <ChevronRight size={16} /></button>
        </div>
      )}
    </section>
  )
}
