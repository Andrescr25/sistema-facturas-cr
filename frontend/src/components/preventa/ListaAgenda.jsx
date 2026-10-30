import { CalendarDays, AlertCircle, Clock, UserCircle, FileText } from 'lucide-react'
import TarjetasResumen from '../pagos/TarjetasResumen'
import Insignia from '../ui/Insignia'
import Boton from '../ui/Boton'
import { SECCIONES_PREVENTA } from '../../utils/agendaPreventa'
import { visitaEnPalabras, textoRotacion } from '../../utils/rotacionTexto'
import { textoReprogramada } from '../../utils/visitaPreventa'

const ICONOS = { atrasado: AlertCircle, hoy: CalendarDays, proximo: Clock, sin_rotacion: UserCircle, sin_facturas: FileText }

export default function ListaAgenda({ agenda: a }) {
  const visibles = a.grupos.reduce((n, g) => n + g.clientes.length, 0)
  return (
    <div className="space-y-5">
      <TarjetasResumen compacta tarjetas={SECCIONES_PREVENTA.map(s => ({ clave: s.estado, titulo: s.titulo,
        icono: ICONOS[s.estado], valor: a.cantidades[s.estado], tono: s.tono, filtro: { estado: s.estado } }))}
        filtros={a.filtros} setFiltros={a.setFiltros} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutro-600">{visibles} de {a.total} clientes</p>
        {a.filtros.estado !== 'todos' && <Boton variante="fantasma" tamano="sm" onClick={() => a.setFiltros(f => ({ ...f, estado: 'todos' }))}>Mostrar todos los estados</Boton>}
      </div>
      {visibles === 0 && <div className="card p-8 text-center">
        <h2 className="text-lg font-bold text-neutro-900">{a.total ? 'No hay coincidencias' : 'No hay clientes activos en esta ruta'}</h2>
        <p className="mt-2 text-neutro-500">{a.total ? 'Probá otro nombre o estado.' : 'Asigná los clientes a su ruta desde Clientes.'}</p>
      </div>}
      {a.grupos.filter(g => g.clientes.length).map(g => (
        <section key={g.estado} aria-label={g.titulo} className="space-y-3">
          <h2 className="text-lg font-bold text-neutro-900">{g.titulo} <span className="text-sm font-medium text-neutro-500">({g.clientes.length})</span></h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.clientes.map(c => {
              const visita = visitaEnPalabras(c.rotacion, a.hoy)
              return <button type="button" key={c.id} aria-label={`Ver visita de ${c.nombre}, cliente ${c.id}`} onClick={() => a.seleccionar(c.id)}
                className="card min-w-0 p-5 text-left transition hover:border-primario-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primario-400">
                <p className="break-words text-lg font-bold text-neutro-900">{c.nombre}</p>
                <p className="mt-1 text-xs text-neutro-500">Cliente #{c.id}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2"><Insignia tono={visita.tono}>{visita.etiqueta}</Insignia></div>
                <p className="mt-2 font-semibold text-neutro-800">{visita.cuando}</p>
                <p className="mt-1 text-sm text-neutro-500">{textoRotacion(c.rotacion.dias)} · {visita.detalle}</p>
                {textoReprogramada(c.rotacion) && <p className="mt-2 text-sm font-semibold text-nota-700">{textoReprogramada(c.rotacion)}</p>}
                <p className="mt-4 text-sm font-semibold text-primario-600">Ver visita →</p>
              </button>
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
