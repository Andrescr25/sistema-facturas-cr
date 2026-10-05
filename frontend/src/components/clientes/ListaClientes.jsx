import { Loader2, Search, Plus, Pencil, Ban, RotateCcw, Mail, Phone, MapPin, CreditCard } from 'lucide-react'
import UbicacionCliente from './UbicacionCliente'

/**
 * Las fichas de clientes. Cada tarjeta dice lo que se necesita para atender
 * al cliente por teléfono: quién es, su cédula, cómo ubicarlo y su crédito.
 *
 * Lo que falta se ve como falta ("Sin correo"), en gris y sin alarma: son 212
 * fichas sin correo y la corrección va aparte, pero quien abre la pantalla
 * tiene que poder verlo sin entrar a cada una.
 */

const TIPOS = {
  CF: 'Cédula física',
  CJ: 'Cédula jurídica',
  DIMEX: 'DIMEX',
  NITE: 'NITE',
  EXTRANJERO: 'Pasaporte',
  NO_CONTRIBUYENTE: 'No contribuyente'
}

const ESTADOS = [
  { valor: 'activos', texto: 'Activos' },
  { valor: 'inactivos', texto: 'Inactivos' },
  { valor: 'todos', texto: 'Todos' }
]

function Dato({ icono: Icono, children, falta }) {
  return (
    <span className={`inline-flex items-center gap-1 ${falta ? 'text-neutro-300' : 'text-neutro-500'}`}>
      <Icono size={12} className="shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  )
}

export default function ListaClientes({
  clientes, cargando, busqueda, setBusqueda, estado, setEstado,
  rutas = [], rutaId = '', setRutaId,
  paginacion, pagina, setPagina, procesando, onNuevo, onEditar, onAbrir, onCambiarEstado
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o correo..."
            aria-label="Buscar clientes"
            className="w-full pl-9 pr-3 py-2.5 border-2 border-neutro-200 focus:border-primario-500 rounded-xl text-sm font-semibold focus:outline-none"
          />
        </div>

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar por estado"
          className="px-3 py-2.5 border-2 border-neutro-200 focus:border-primario-500 rounded-xl text-sm font-semibold focus:outline-none bg-white"
        >
          {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
        </select>

        <select aria-label="Filtrar clientes por ruta" value={rutaId} onChange={e => setRutaId(e.target.value)} className="input min-h-11 sm:max-w-52">
          <option value="">Todas las rutas</option><option value="sin-ruta">Sin ruta</option>
          {rutas.map(r => <option key={r.id} value={r.id}>{r.nombre}{r.activo ? '' : ' · inactiva'}</option>)}
        </select>
        <button
          type="button"
          onClick={onNuevo}
          className="px-4 py-2.5 rounded-xl bg-exito-600 hover:bg-exito-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus size={15} />
          Nuevo cliente
        </button>
      </div>

      <p className="text-xs font-bold text-neutro-400">
        Clientes: <span className="text-neutro-700">{paginacion.total}</span>
      </p>

      {cargando ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-exito-600" /></div>
      ) : clientes.length === 0 ? (
        <p className="py-16 text-center text-sm font-semibold text-neutro-400">
          {busqueda ? `Ningún cliente coincide con "${busqueda}".` : 'Todavía no hay clientes.'}
        </p>
      ) : (
        <div className="space-y-2">
          {clientes.map(c => {
            const ocupado = procesando === c.id
            return (
              <div
                key={c.id}
                data-cliente={c.id}
                className="bg-white rounded-2xl border border-neutro-100 p-3.5 flex items-start justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* El nombre abre la ficha completa. La tarjeta sigue
                        mostrando lo de siempre: esto agrega un camino, no
                        reemplaza ninguno. */}
                    <button
                      type="button"
                      onClick={() => onAbrir(c)}
                      className="text-left font-bold text-neutro-900 text-sm hover:text-exito-700"
                      title={`Ver todo lo de ${c.nombre}`}
                    >
                      {c.nombre}
                    </button>
                    {!c.activo && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase bg-peligro-100 text-peligro-700">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutro-400">
                    {c.ruta_nombre ? `${c.ruta_nombre} · visita ${c.orden_ruta}` : 'Sin ruta'}
                  </p>
                  <p className="text-xs text-neutro-400">
                    {c.identificacion
                      ? `${TIPOS[c.tipo_identificacion] || 'Identificación'}: ${c.identificacion}`
                      : 'Sin identificación'}
                  </p>

                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
                    <Dato icono={Mail} falta={!c.correo}>{c.correo || 'Sin correo'}</Dato>
                    <Dato icono={Phone} falta={!(c.celular || c.telefono)}>
                      {c.celular || c.telefono || 'Sin teléfono'}
                    </Dato>
                    <Dato icono={MapPin} falta={!c.canton}>
                      {[c.canton, c.provincia].filter(Boolean).join(', ') || 'Sin dirección'}
                    </Dato>
                    <Dato icono={CreditCard} falta={!c.plazo}>
                      {c.plazo || 'Sin plazo'}
                      {c.limite_credito ? ` · tope ₡${Number(c.limite_credito).toLocaleString('es-CR')}` : ''}
                    </Dato>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {c.ubicacion_maps && <UbicacionCliente enlace={c.ubicacion_maps} />}
                  <button
                    type="button"
                    onClick={() => onEditar(c)}
                    title="Editar la ficha"
                    aria-label={`Editar ${c.nombre}`}
                    className="px-3 py-2 rounded-xl border-2 border-neutro-200 hover:border-primario-400 text-neutro-500 hover:text-primario-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Pencil size={13} />
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => onCambiarEstado(c)}
                    disabled={ocupado}
                    title={c.activo ? 'Desactivar: deja de aparecer para facturar' : 'Reactivar'}
                    aria-label={`${c.activo ? 'Desactivar' : 'Reactivar'} ${c.nombre}`}
                    className={`p-2 rounded-xl border-2 border-neutro-200 text-neutro-400 transition-colors ${
                      c.activo ? 'hover:border-peligro-300 hover:text-peligro-600' : 'hover:border-exito-400 hover:text-exito-600'
                    }`}
                  >
                    {ocupado ? <Loader2 size={14} className="animate-spin" /> : c.activo ? <Ban size={14} /> : <RotateCcw size={14} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {paginacion.paginas > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            className="px-3 py-2 rounded-xl border-2 border-neutro-200 text-xs font-bold text-neutro-600 disabled:text-neutro-300"
          >
            Anterior
          </button>
          <span className="text-xs font-bold text-neutro-500">
            Página {paginacion.pagina} de {paginacion.paginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina(p => Math.min(paginacion.paginas, p + 1))}
            disabled={pagina >= paginacion.paginas}
            className="px-3 py-2 rounded-xl border-2 border-neutro-200 text-xs font-bold text-neutro-600 disabled:text-neutro-300"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
