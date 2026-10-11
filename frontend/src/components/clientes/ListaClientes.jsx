import { Loader2, Search, Plus, Pencil, Ban, RotateCcw, Phone, MapPin, ArrowRight, X, Contact, MoreHorizontal, RefreshCw } from 'lucide-react'
import UbicacionCliente from './UbicacionCliente'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'

const ESTADOS = [{ valor: 'activos', texto: 'Activos' }, { valor: 'inactivos', texto: 'Inactivos' }, { valor: 'todos', texto: 'Todos' }]
const iniciales = nombre => nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('')

/** La tarjeta sirve para encontrar una ficha; los datos completos viven en su detalle. */
export default function ListaClientes({
  clientes, cargando, error, onActualizar, busqueda, setBusqueda, estado, setEstado,
  rutas = [], rutaId = '', setRutaId, paginacion, pagina, setPagina,
  procesando, onNuevo, onEditar, onAbrir, onCambiarEstado
}) {
  const filtrado = Boolean(busqueda || rutaId || estado !== 'activos')
  const limpiar = () => { setBusqueda(''); setRutaId(''); setEstado('activos') }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutro-900">Directorio de clientes</h2>
          <p className="mt-1 text-sm text-neutro-500">Encontrá al cliente y abrí su ficha para atenderlo.</p>
        </div>
        <Boton tamano="lg" onClick={onNuevo}><Plus size={19} />Nuevo cliente</Boton>
      </div>

      <div className="rounded-2xl border border-neutro-200 bg-white p-4 sm:p-5">
        <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_180px_220px]">
          <label className="block text-sm font-semibold text-neutro-700">
            Buscar cliente
            <div className="relative mt-2">
              <Search size={19} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" aria-hidden="true" />
              <input type="search" aria-label="Buscar clientes" value={busqueda}
                onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, identificación o correo"
                className="input min-h-12 w-full pl-10 text-base" />
            </div>
          </label>
          <label className="block text-sm font-semibold text-neutro-700">Estado
            <select aria-label="Filtrar por estado" value={estado} onChange={e => setEstado(e.target.value)} className="input mt-2 min-h-12 w-full">
              {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-neutro-700">Ruta
            <select aria-label="Filtrar clientes por ruta" value={rutaId} onChange={e => setRutaId(e.target.value)} className="input mt-2 min-h-12 w-full">
              <option value="">Todas las rutas</option><option value="sin-ruta">Sin ruta</option>
              {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' · inactiva'}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutro-100 pt-4">
          <p className="text-sm text-neutro-600" aria-live="polite">
            {cargando ? 'Buscando clientes…' : error ? 'Lista no disponible' : <><strong className="text-neutro-900">{paginacion.total}</strong> {paginacion.total === 1 ? 'cliente' : 'clientes'} en esta selección</>}
          </p>
          {filtrado && <button type="button" onClick={limpiar} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primario-700"><X size={16} />Limpiar filtros</button>}
        </div>
      </div>

      {cargando ? (
        <div className="flex min-h-56 items-center justify-center gap-3 text-neutro-500" role="status"><Loader2 size={25} className="animate-spin" />Cargando clientes…</div>
      ) : error ? (
        <div className="rounded-2xl border border-peligro-200 bg-white p-8 text-center" role="alert">
          <p className="text-base font-semibold text-peligro-700">{error}</p>
          <Boton variante="secundario" className="mt-4" onClick={onActualizar}><RefreshCw size={17} />Reintentar</Boton>
        </div>
      ) : clientes.length === 0 ? (
        <div className="rounded-2xl border border-neutro-200 bg-white px-6 py-14 text-center">
          <Contact size={44} className="mx-auto mb-4 text-neutro-300" />
          <h3 className="text-lg font-bold text-neutro-900">{filtrado ? 'No encontramos clientes' : 'Todavía no hay clientes activos'}</h3>
          <p className="mx-auto mt-2 max-w-md text-base text-neutro-500">{filtrado ? 'Probá otro nombre o cambiá los filtros para ampliar la búsqueda.' : 'Podés crear una ficha nueva o consultar los clientes inactivos.'}</p>
          {filtrado && <Boton variante="secundario" className="mt-5" onClick={limpiar}>Limpiar filtros</Boton>}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {clientes.map(c => (
            <article key={c.id} data-cliente={c.id} className="flex min-w-0 flex-col overflow-visible rounded-2xl border border-neutro-200 bg-white shadow-sm transition-shadow hover:shadow-md">
              <button type="button" onClick={() => onAbrir(c)} aria-label={`Ver ficha de ${c.nombre}`}
                className="group flex flex-1 flex-col p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primario-500 rounded-t-2xl">
                <div className="flex w-full items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primario-50 text-lg font-extrabold text-primario-800" aria-hidden="true">{iniciales(c.nombre)}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-lg font-bold leading-snug text-neutro-900 group-hover:text-primario-700">{c.nombre}</h3>
                    <p className="mt-1 break-words text-sm text-neutro-500">{c.identificacion || 'Sin identificación'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Insignia tono={c.activo ? 'exito' : 'neutro'}>{c.activo ? 'Activo' : 'Inactivo'}</Insignia>
                  <span className="rounded-full bg-neutro-100 px-3 py-1 text-sm font-medium text-neutro-600">{c.ruta_nombre ? `${c.ruta_nombre}${c.orden_ruta ? ` · visita ${c.orden_ruta}` : ''}` : 'Sin ruta asignada'}</span>
                </div>
                <div className="mt-4 w-full space-y-2 text-sm text-neutro-600">
                  <p className="flex items-start gap-2"><Phone size={17} className="mt-0.5 shrink-0 text-neutro-400" /><span className="break-words">{c.celular || c.telefono || 'Sin teléfono'}</span></p>
                  <p className="flex items-start gap-2"><MapPin size={17} className="mt-0.5 shrink-0 text-neutro-400" /><span className="break-words">{[c.canton, c.provincia].filter(Boolean).join(', ') || 'Sin dirección registrada'}</span></p>
                </div>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primario-700">Ver ficha<ArrowRight size={17} /></span>
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutro-100 px-5 py-3">
                <button type="button" onClick={() => onEditar(c)} aria-label={`Editar ${c.nombre}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-neutro-600 hover:text-primario-700"><Pencil size={16} />Editar</button>
                {c.ubicacion_maps && <UbicacionCliente enlace={c.ubicacion_maps} />}
                {/* La desactivación se conserva, apartada de abrir/editar para
                    que una acción ocasional no domine todas las tarjetas. */}
                <details className="relative">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-2 text-sm text-neutro-500" aria-label={`Más opciones de ${c.nombre}`}><MoreHorizontal size={21} /><span className="sr-only">Más opciones</span></summary>
                  <div className="absolute right-0 top-full z-10 mt-1 min-w-44 rounded-xl border border-neutro-200 bg-white p-2 shadow-lg">
                    <button type="button" onClick={() => onCambiarEstado(c)} disabled={procesando === c.id}
                      aria-label={`${c.activo ? 'Desactivar' : 'Reactivar'} ${c.nombre}`}
                      className={`inline-flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold ${c.activo ? 'text-peligro-700 hover:bg-peligro-50' : 'text-exito-700 hover:bg-exito-50'}`}>
                      {procesando === c.id ? <Loader2 size={17} className="animate-spin" /> : c.activo ? <Ban size={17} /> : <RotateCcw size={17} />}
                      {c.activo ? 'Desactivar cliente' : 'Reactivar cliente'}
                    </button>
                  </div>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}

      {!cargando && !error && paginacion.paginas > 1 && <nav aria-label="Páginas de clientes" className="flex flex-wrap items-center justify-center gap-4 py-3">
        <Boton variante="secundario" tamano="lg" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}>Anterior</Boton>
        <span className="text-sm font-semibold text-neutro-600">Página {paginacion.pagina} de {paginacion.paginas}</span>
        <Boton variante="secundario" tamano="lg" onClick={() => setPagina(p => Math.min(paginacion.paginas, p + 1))} disabled={pagina >= paginacion.paginas}>Siguiente</Boton>
      </nav>}
    </div>
  )
}
