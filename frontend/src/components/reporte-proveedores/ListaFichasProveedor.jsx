import { Loader2, Search, Plus, Pencil, Ban, RotateCcw, Mail, Phone, MessageCircle, Package, Receipt } from 'lucide-react'
import { filasTelefonosProveedor } from '../../utils/telefonosProveedor'

/**
 * Las fichas de proveedores: una sola lista, identificada por cédula.
 *
 * Cada tarjeta dice lo que se necesita antes de llamar a un proveedor: quién
 * es, su cédula, a qué número sale la orden por WhatsApp, cuántos productos le
 * compramos y cuántas facturas suyas entraron.
 *
 * Lo que falta se ve como falta ("Sin WhatsApp"), en gris: 24 de los 42 no
 * tienen número, y eso es justo lo que hay que ir completando.
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
    <span className={`inline-flex items-center gap-2 ${falta ? 'text-neutro-400' : 'text-neutro-600'}`}>
      <Icono size={17} className="shrink-0" />
      <span className="break-words">{children}</span>
    </span>
  )
}

export default function ListaFichasProveedor({
  proveedores, cargando, busqueda, setBusqueda, estado, setEstado,
  paginacion, pagina, setPagina, procesando, abriendo, onNuevo, onAbrir, onCambiarEstado
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
            aria-label="Buscar proveedores"
            className="w-full min-h-12 pl-9 pr-3 py-2.5 border-2 border-neutro-200 focus:border-primario-500 rounded-xl text-sm font-semibold focus:outline-none"
          />
        </div>

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar proveedores por estado"
          className="min-h-12 px-3 py-2.5 border-2 border-neutro-200 focus:border-primario-500 rounded-xl text-sm font-semibold focus:outline-none bg-white"
        >
          {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
        </select>

        <button
          type="button"
          onClick={onNuevo}
          className="px-4 py-2.5 rounded-xl bg-primario-800 hover:bg-primario-900 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
        >
          <Plus size={15} />
          Nuevo proveedor
        </button>
      </div>

      <p className="text-xs font-bold text-neutro-400">
        Proveedores: <span className="text-neutro-700">{paginacion.total}</span>
      </p>

      {cargando ? (
        <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-exito-600" /></div>
      ) : proveedores.length === 0 ? (
        <p className="py-16 text-center text-sm font-semibold text-neutro-400">
          {busqueda ? `Ningún proveedor coincide con "${busqueda}".` : 'Todavía no hay proveedores.'}
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {proveedores.map(p => {
            const ocupado = procesando === p.id
            const telefonos = filasTelefonosProveedor(p.telefono_whatsapp)
            return (
              <div
                key={p.id}
                data-proveedor={p.id}
                className="bg-white rounded-2xl border border-neutro-200 p-5 flex flex-col justify-between gap-5"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-neutro-900 text-lg break-words">{p.nombre}</p>
                    {!p.activo && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase bg-peligro-100 text-peligro-700">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-neutro-500">
                    {p.identificacion
                      ? `${TIPOS[p.tipo_identificacion] || 'Cédula'}: ${p.identificacion}`
                      : 'Sin cédula'}
                    {p.plazo ? ` · ${p.plazo}` : ''}
                  </p>

                  <div className="flex items-start gap-x-3 gap-y-3 flex-col text-sm">
                    <Dato icono={MessageCircle} falta={!telefonos.length}>
                      {telefonos.length ? telefonos.map((numero, i) => <span key={i} className="block">{numero}</span>) : 'Sin WhatsApp'}
                    </Dato>
                    <Dato icono={Phone} falta={!p.telefono}>{p.telefono || 'Sin teléfono'}</Dato>
                    <Dato icono={Mail} falta={!p.correo}>{p.correo || 'Sin correo'}</Dato>
                    <Dato icono={Package} falta={!p.productos}>
                      {p.productos ? `${p.productos} producto(s)` : 'Sin productos'}
                    </Dato>
                    <Dato icono={Receipt} falta={!p.compras}>
                      {p.compras ? `${p.compras} compra(s)` : 'Sin compras'}
                    </Dato>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap border-t border-neutro-100 pt-4">
                  <button
                    type="button"
                    onClick={() => onAbrir(p)}
                    disabled={abriendo === p.id}
                    title="Ver y editar la ficha"
                    aria-label={`Abrir ${p.nombre}`}
                    className="min-h-11 px-3 py-2 rounded-xl border-2 border-neutro-200 hover:border-primario-400 text-neutro-500 hover:text-primario-700 text-sm font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {abriendo === p.id ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                    Ver ficha
                  </button>

                  <button
                    type="button"
                    onClick={() => onCambiarEstado(p)}
                    disabled={ocupado}
                    title={p.activo ? 'Desactivar: deja de aparecer en la lista' : 'Reactivar'}
                    aria-label={`${p.activo ? 'Desactivar' : 'Reactivar'} ${p.nombre}`}
                    className={`min-h-11 px-3 rounded-xl border-2 border-neutro-200 text-neutro-400 transition-colors ${
                      p.activo ? 'hover:border-peligro-300 hover:text-peligro-600' : 'hover:border-exito-400 hover:text-exito-600'
                    }`}
                  >
                    {ocupado ? <Loader2 size={14} className="animate-spin" /> : p.activo ? <Ban size={14} /> : <RotateCcw size={14} />}
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
            className="min-h-11 px-3 py-2 rounded-xl border-2 border-neutro-200 text-xs font-bold text-neutro-600 disabled:text-neutro-300"
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
            className="min-h-11 px-3 py-2 rounded-xl border-2 border-neutro-200 text-xs font-bold text-neutro-600 disabled:text-neutro-300"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  )
}
