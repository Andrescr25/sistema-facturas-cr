import { useState } from 'react'
import { ArrowLeft, Receipt, MapPin, Navigation, Phone, MessageCircle, Mail, CalendarClock, Repeat, Crosshair } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Boton from '../ui/Boton'
import RotacionCliente from '../clientes/RotacionCliente'
import { useAuth } from '../../contexts/AuthContext'
import { puedeVer } from '../../utils/modulos'
import { enlacesParaLlegar, contactosDe, textoReprogramada } from '../../utils/visitaPreventa'
import ModalProximaVisita from './ModalProximaVisita'
import ModalRotacionCliente from './ModalRotacionCliente'
import ModalUbicacionCliente from './ModalUbicacionCliente'

const ENLACE = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors'
const TONO = {
  primario: 'border-primario-200 bg-primario-50 text-primario-800 hover:bg-primario-100',
  exito: 'border-exito-200 bg-exito-50 text-exito-800 hover:bg-exito-100',
  neutro: 'border-neutro-200 bg-white text-neutro-800 hover:bg-neutro-50'
}

/**
 * El cliente que el agente va a visitar (F3, 2026-10-29): facturarle desde
 * acá, cómo llegar y cómo contactarlo, sin salir de Preventa a buscarlo.
 *
 * «Facturar» abre Facturación con este cliente ya elegido y un aviso para
 * volver a la agenda (useClienteDesdePreventa). Solo sale si quien mira tiene
 * Facturación.
 *
 * «Próxima visita» (F4): si no compró, el motivo y para cuándo queda.
 */
export default function DetalleVisita({ cliente, hoy, volver, alGuardarVisita, alGuardarFicha }) {
  const [proxima, setProxima] = useState(false)
  // Rotación y punto exacto en el mapa, desde la visita (2026-10-29).
  const [editando, setEditando] = useState(null) // 'rotacion' | 'ubicacion'
  const reprogramada = textoReprogramada(cliente.rotacion)
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const direccion = [cliente.provincia, cliente.canton, cliente.distrito, cliente.barrio].filter(Boolean).join(', ')
  const llegar = enlacesParaLlegar(cliente.ubicacion_maps)
  const contactos = contactosDe(cliente)
  const ruta = cliente.ruta?.id ? `&ruta=${cliente.ruta.id}` : ''
  const facturar = () => navigate(`/facturacion?cliente=${cliente.id}&desde=preventa${ruta}`)

  return (
    <div className="space-y-5">
      <Boton variante="secundario" icono={ArrowLeft} onClick={volver}>Volver a la agenda</Boton>

      <div className="card p-5 sm:p-7">
        <h2 className="break-words text-2xl font-bold text-neutro-900">{cliente.nombre}</h2>
        <p className="mt-1 text-sm text-neutro-500">Cliente #{cliente.id} · {cliente.ruta?.nombre || 'Sin ruta asignada'}</p>
        <RotacionCliente rotacion={cliente.rotacion} />
        <Boton variante="fantasma" tamano="sm" icono={Repeat} onClick={() => setEditando('rotacion')} className="mt-2 gap-1.5">Cambiar rotación</Boton>
        {reprogramada && (
          <p className="mt-3 rounded-xl bg-nota-50 px-3 py-2 text-sm font-semibold text-nota-700">
            {reprogramada}{cliente.rotacion.reprogramada.nota ? ` — «${cliente.rotacion.reprogramada.nota}»` : ''}
          </p>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {puedeVer(usuario, '/facturacion') && (
            <Boton icono={Receipt} onClick={facturar} ancho className="min-h-12 gap-2 text-base">Facturar</Boton>
          )}
          <Boton variante="secundario" icono={CalendarClock} onClick={() => setProxima(true)} ancho className="min-h-12 gap-2 text-base">Próxima visita</Boton>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Cómo llegar" className="card min-w-0 space-y-3 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-bold text-neutro-900"><MapPin size={18} className="text-primario-500" />Cómo llegar</h3>
          <p className="break-words font-medium text-neutro-900">{direccion || 'Sin dirección registrada'}</p>
          {cliente.otras_senas && <p className="whitespace-pre-wrap break-words text-sm text-neutro-600">{cliente.otras_senas}</p>}
          {llegar.maps ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <a href={llegar.maps} target="_blank" rel="noopener noreferrer" className={`${ENLACE} ${TONO.primario}`}><MapPin size={16} />Abrir en Maps</a>
              {llegar.waze && <a href={llegar.waze} target="_blank" rel="noopener noreferrer" className={`${ENLACE} ${TONO.neutro}`}><Navigation size={16} />Ir con Waze</a>}
            </div>
          ) : (
            <p className="rounded-xl bg-neutro-50 p-3 text-sm text-neutro-500">Sin ubicación en la ficha.</p>
          )}
          <Boton variante="secundario" icono={Crosshair} onClick={() => setEditando('ubicacion')} ancho className="gap-2">
            {llegar.maps ? 'Corregir en el mapa' : 'Marcar en el mapa'}
          </Boton>
        </section>

        <section aria-label="Contacto" className="card min-w-0 space-y-3 p-5 sm:p-6">
          <h3 className="flex items-center gap-2 font-bold text-neutro-900"><Phone size={18} className="text-primario-500" />Contacto</h3>
          {contactos.length === 0 && <p className="text-sm text-neutro-500">Sin teléfono registrado.</p>}
          {contactos.map(c => (
            <div key={c.texto} className="space-y-2">
              <p className="break-words font-medium text-neutro-900">{c.texto}</p>
              {c.llamar && (
                <div className="grid grid-cols-2 gap-2">
                  <a href={c.llamar} className={`${ENLACE} ${TONO.neutro}`}><Phone size={16} />Llamar</a>
                  <a href={c.whatsapp} target="_blank" rel="noopener noreferrer" className={`${ENLACE} ${TONO.exito}`}><MessageCircle size={16} />WhatsApp</a>
                </div>
              )}
            </div>
          ))}
          <p className="flex min-w-0 items-center gap-2 break-all text-sm text-neutro-600"><Mail size={14} className="shrink-0" />{cliente.correo || 'Sin correo registrado'}</p>
        </section>
      </div>

      <p className="text-sm text-neutro-500">La última atención corresponde a la última factura vigente. La frecuencia y la ruta se configuran en Clientes.</p>

      {proxima && (
        <ModalProximaVisita cliente={cliente} hoy={hoy} onCerrar={() => setProxima(false)}
          onGuardada={(visita) => { setProxima(false); alGuardarVisita(cliente, visita) }} />
      )}
      {editando === 'rotacion' && (
        <ModalRotacionCliente cliente={cliente} onCerrar={() => setEditando(null)}
          onGuardada={(dias) => { setEditando(null); alGuardarFicha(`${cliente.nombre}: se visita cada ${dias} días.`) }} />
      )}
      {editando === 'ubicacion' && (
        <ModalUbicacionCliente cliente={cliente} onCerrar={() => setEditando(null)}
          onGuardada={() => { setEditando(null); alGuardarFicha(`Ubicación de ${cliente.nombre} guardada.`) }} />
      )}
    </div>
  )
}
