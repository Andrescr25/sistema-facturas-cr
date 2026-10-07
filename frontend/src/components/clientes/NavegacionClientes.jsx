import { Contact, Map, ClipboardList, ShieldCheck } from 'lucide-react'

const SECCIONES = [
  { id: 'fichas', titulo: 'Clientes', detalle: 'Fichas y contacto', icono: Contact },
  { id: 'rutas', titulo: 'Rutas', detalle: 'Visitas y semanas', icono: Map },
  { id: 'pedidos', titulo: 'Pedidos', detalle: 'Revisión y facturación', icono: ClipboardList },
  { id: 'clientes', titulo: 'Accesos', detalle: 'Portal y tablets', icono: ShieldCheck }
]

/** Los accesos se administran juntos; las fichas y la operación quedan a la vista. */
export default function NavegacionClientes({ vista, onCambiar, pendientes = 0 }) {
  const seleccion = vista === 'dispositivos' ? 'clientes' : vista
  return (
    <nav aria-label="Áreas de Clientes" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {SECCIONES.map(({ id, titulo, detalle, icono: Icono }) => {
        const activa = seleccion === id
        return (
          <button key={id} type="button" aria-label={titulo} aria-pressed={activa}
            onClick={() => onCambiar(id)}
            className={`flex min-h-24 items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primario-500 ${
              activa ? 'border-primario-700 bg-primario-50' : 'border-neutro-200 bg-white hover:border-primario-300'
            }`}>
            <span className={`rounded-xl p-2.5 shrink-0 ${activa ? 'bg-primario-800 text-white' : 'bg-neutro-100 text-neutro-500'}`}>
              <Icono size={22} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-base font-bold text-neutro-900">{titulo}
                {id === 'pedidos' && pendientes > 0 && <span title="Pedidos en revisión de la selección actual" className="rounded-lg bg-alerta-100 px-2 py-0.5 text-xs text-alerta-700">{pendientes}</span>}
              </span>
              <span className="mt-1 hidden text-sm text-neutro-500 sm:block">{detalle}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
