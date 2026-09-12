import { Loader2, Search, Plus, Pencil, Ban, RotateCcw, Mail, Phone, MessageCircle, Package, Receipt } from 'lucide-react'

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
    <span className={`inline-flex items-center gap-1 ${falta ? 'text-neutro-300' : 'text-neutro-500'}`}>
      <Icono size={12} className="shrink-0" />
      <span className="truncate">{children}</span>
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
            className="w-full pl-9 pr-3 py-2.5 border-2 border-neutro-200 focus:border-primario-500 rounded-xl text-sm font-semibold focus:outline-none"
          />
        </div>

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar proveedores por estado"
          className="px-3 py-2.5 border-2 border-neutro-200 focus:border-primario-500 rounded-xl text-sm font-semibold focus:outline-none bg-white"
        >
          {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
        </select>

        <button
          type="button"
          onClick={onNuevo}
          className="px-4 py-2.5 rounded-xl bg-exito-600 hover:bg-exito-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 transition-colors"
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
        <div className="space-y-2">
          {proveedores.map(p => {
            const ocupado = procesando === p.id
            return (
              <div
                key={p.id}
                data-proveedor={p.id}
                className="bg-white rounded-2xl border border-neutro-100 p-3.5 flex items-start justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-neutro-900 text-sm">{p.nombre}</p>
                    {!p.activo && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase bg-peligro-100 text-peligro-700">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutro-400">
                    {p.identificacion
                      ? `${TIPOS[p.tipo_identificacion] || 'Cédula'}: ${p.identificacion}`
                      : 'Sin cédula'}
                    {p.plazo ? ` · ${p.plazo}` : ''}
                  </p>

                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs">
                    <Dato icono={MessageCircle} falta={!p.telefono_whatsapp}>
                      {p.telefono_whatsapp || 'Sin WhatsApp'}
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

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAbrir(p)}
                    disabled={abriendo === p.id}
                    title="Ver y editar la ficha"
                    aria-label={`Abrir ${p.nombre}`}
                    className="px-3 py-2 rounded-xl border-2 border-neutro-200 hover:border-primario-400 text-neutro-500 hover:text-primario-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
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
                    className={`p-2 rounded-xl border-2 border-neutro-200 text-neutro-400 transition-colors ${
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
