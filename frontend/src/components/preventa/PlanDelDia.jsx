import { useState } from 'react'
import { GripVertical, ArrowUp, ArrowDown, X, Plus, Navigation, MapPin, CheckCircle2, CalendarClock, ChevronRight, ListChecks } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import ListaOrdenable from './ListaOrdenable'
import ModalAgregarAlPlan from './ModalAgregarAlPlan'
import { visitaEnPalabras } from '../../utils/rotacionTexto'
import { enlacesParaLlegar } from '../../utils/visitaPreventa'
import { fechaEnPalabras } from '../../utils/fechaCR'

const ENLACE = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-white/80 px-3 text-sm font-bold text-primario-800 ring-1 ring-inset ring-primario-200 hover:bg-white'

function Atendido({ atendido }) {
  if (atendido.como === 'venta') return <span className="flex items-center gap-1 text-sm font-semibold text-exito-700"><CheckCircle2 size={14} />Venta {atendido.hora} · {atendido.factura}</span>
  return <span className="flex items-center gap-1 text-sm font-semibold text-nota-700"><CalendarClock size={14} />Próxima visita el {fechaEnPalabras(atendido.proximaFecha, { day: 'numeric', month: 'short' })}</span>
}

/**
 * «Mi día» (2026-11-01). El usuario: «quiero que el agente pueda organizar
 * mejor cuál cliente quiere visitar primero… que lo edite a su gusto». Arriba
 * el siguiente que le toca, con cómo llegar; abajo su día en orden: lo
 * arrastra con el dedo (o con las flechas), saca a quien no va a ver y agrega
 * de cualquiera de sus rutas. Al facturarle o marcarle «próxima visita» queda
 * tachado solo: lo dice el servidor, que lo lee de lo que hizo.
 */
export default function PlanDelDia({ dia, rutas, rutaActual, onVer }) {
  const [agregando, setAgregando] = useState(false)
  const { plan } = dia
  if (!plan) return <p role="status" className="p-5 text-neutro-500">{dia.error || 'Armando tu día…'}</p>

  const siguiente = plan.clientes.find(x => x.cliente.id === plan.siguiente)
  const total = plan.clientes.length
  const llegar = siguiente ? enlacesParaLlegar(siguiente.cliente.ubicacion_maps) : null
  const enPlan = new Set(plan.clientes.map(x => x.cliente.id))

  return (
    <div className="space-y-4">
      {dia.error && <p role="alert" className="rounded-xl bg-peligro-50 p-3 text-sm text-peligro-700">{dia.error}</p>}

      {siguiente && (
        <section aria-label="Siguiente" className="card space-y-3 border-2 border-primario-200 bg-primario-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-primario-700">Siguiente · {plan.clientes.indexOf(siguiente) + 1} de {total}</p>
          <div>
            <p className="break-words text-xl font-bold text-neutro-900">{siguiente.cliente.nombre}</p>
            <p className="text-sm text-neutro-600">{siguiente.cliente.ruta?.nombre} · {visitaEnPalabras(siguiente.cliente.rotacion, plan.hoy).etiqueta}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Boton icono={ChevronRight} onClick={() => onVer(siguiente.cliente.id)} className="col-span-2">Ver visita</Boton>
            {llegar.waze && <a href={llegar.waze} target="_blank" rel="noopener noreferrer" className={ENLACE}><Navigation size={15} />Waze</a>}
            {llegar.maps && <a href={llegar.maps} target="_blank" rel="noopener noreferrer" className={ENLACE}><MapPin size={15} />Maps</a>}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-neutro-900">{total ? `${plan.visitados} de ${total} visitados` : 'Tu día está vacío'}</p>
          {total > 0 && (
            <div className="mt-1 h-2 w-40 overflow-hidden rounded-full bg-neutro-200">
              <div className="h-full rounded-full bg-exito-500" style={{ width: `${Math.round((plan.visitados / total) * 100)}%` }} />
            </div>
          )}
        </div>
        <Boton variante="secundario" icono={Plus} onClick={() => setAgregando(true)} disabled={dia.guardando}>Agregar clientes</Boton>
      </div>

      {total === 0 ? (
        <div className="card p-8 text-center">
          <ListChecks size={36} className="mx-auto text-neutro-300" />
          <p className="mt-2 font-bold text-neutro-800">Hoy no le toca a nadie de tus rutas</p>
          <p className="mt-1 text-sm text-neutro-500">Agregá los clientes que querés visitar y ordenalos a tu gusto.</p>
        </div>
      ) : (
        <ListaOrdenable elementos={plan.clientes} claveDe={x => x.cliente.id} onMover={dia.mover}>
          {(x, i, { asa, arrastrando }) => {
            const hecho = Boolean(x.atendido)
            const estado = visitaEnPalabras(x.cliente.rotacion, plan.hoy)
            return (
              <div className={`card flex min-h-16 items-center gap-2 p-2 pr-3 ${arrastrando ? 'shadow-xl ring-2 ring-primario-300' : ''} ${hecho ? 'bg-neutro-50' : ''}`}>
                <span {...asa} aria-label={`Arrastrar a ${x.cliente.nombre}`} className={`${asa.className} flex h-12 w-9 shrink-0 items-center justify-center rounded-lg text-neutro-400 hover:bg-neutro-100`}>
                  <GripVertical size={20} />
                </span>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${hecho ? 'bg-exito-100 text-exito-700' : x.cliente.id === plan.siguiente ? 'bg-primario-700 text-white' : 'bg-neutro-200 text-neutro-700'}`}>{i + 1}</span>
                <button type="button" onClick={() => onVer(x.cliente.id)} className="min-w-0 flex-1 py-1 text-left">
                  <span className={`block break-words font-bold ${hecho ? 'text-neutro-500 line-through' : 'text-neutro-900'}`}>{x.cliente.nombre}</span>
                  {hecho ? <Atendido atendido={x.atendido} /> : (
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-neutro-500">
                      <Insignia tono={estado.tono}>{estado.etiqueta}</Insignia>{x.cliente.ruta?.nombre}
                    </span>
                  )}
                </button>
                <span className="flex shrink-0 flex-col">
                  <button type="button" disabled={i === 0 || dia.guardando} onClick={() => dia.mover(i, i - 1)} aria-label={`Subir a ${x.cliente.nombre}`}
                    className="rounded-md p-1 text-neutro-500 hover:bg-neutro-100 disabled:opacity-30"><ArrowUp size={16} /></button>
                  <button type="button" disabled={i === total - 1 || dia.guardando} onClick={() => dia.mover(i, i + 1)} aria-label={`Bajar a ${x.cliente.nombre}`}
                    className="rounded-md p-1 text-neutro-500 hover:bg-neutro-100 disabled:opacity-30"><ArrowDown size={16} /></button>
                </span>
                {!hecho && (
                  <button type="button" disabled={dia.guardando} onClick={() => dia.quitar(x.cliente.id)} aria-label={`Quitar a ${x.cliente.nombre} de mi día`}
                    className="shrink-0 rounded-lg p-2 text-neutro-400 hover:bg-peligro-50 hover:text-peligro-600 disabled:opacity-30"><X size={18} /></button>
                )}
              </div>
            )
          }}
        </ListaOrdenable>
      )}

      {plan.quitados.length > 0 && (
        <p className="text-sm text-neutro-500">Sacaste de tu día: {plan.quitados.map(q => q.nombre).join(', ')}. Para volver a ponerlos, «Agregar clientes».</p>
      )}

      {agregando && (
        <ModalAgregarAlPlan rutas={rutas} rutaInicial={rutaActual} enPlan={enPlan} hoy={plan.hoy}
          onAgregar={dia.agregar} onCerrar={() => setAgregando(false)} />
      )}
    </div>
  )
}
