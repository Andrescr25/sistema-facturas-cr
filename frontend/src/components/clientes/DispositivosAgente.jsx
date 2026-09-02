import { useEffect, useState } from 'react'
import { Tablet, AlertTriangle, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import api from '../../services/api'

/**
 * Qué tablets tienen pedidos sin mandar.
 *
 * EL LÍMITE, DICHO DE FRENTE
 * Un pedido atascado en una tablet NO llegó al servidor: no hay nada que
 * mirar en la base. Lo único que se puede saber es lo que cada dispositivo
 * reportó la última vez que tuvo señal.
 *
 * Por eso "hace cuánto no se sabe de él" está tan a la vista como el número
 * de pendientes. Un dispositivo callado hace horas, en día de ruta, es
 * justamente el que hay que revisar — la ausencia de noticias es la noticia.
 *
 * Sin esta pantalla, esos pedidos aparecen recién cuando el cliente reclama
 * que nunca le llegó el producto.
 */

function haceCuanto(minutos) {
  if (minutos < 1) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return `hace ${dias} día${dias === 1 ? '' : 's'}`
}

const AVISO = {
  sin_noticias: {
    clase: 'border-peligro-200 bg-peligro-50',
    Icono: AlertTriangle,
    color: 'text-peligro-600',
    texto: 'Sin noticias y con pedidos sin enviar'
  },
  pendientes: {
    clase: 'border-alerta-200 bg-alerta-50',
    Icono: Clock,
    color: 'text-alerta-600',
    texto: 'Tiene pedidos sin enviar'
  }
}

export default function DispositivosAgente() {
  const [dispositivos, setDispositivos] = useState([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    const traer = () => api.get('/catalogo-agente/dispositivos')
      .then(({ data }) => { if (vivo) setDispositivos(data.data || []) })
      .catch(() => {})
      .finally(() => { if (vivo) setCargando(false) })

    traer()
    // Se refresca solo: esta pantalla se deja abierta y el estado cambia
    // cuando una tablet recupera señal.
    const t = setInterval(traer, 60000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  if (cargando) {
    return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-neutro-300" /></div>
  }

  if (dispositivos.length === 0) {
    return (
      <div className="rounded-2xl border border-neutro-200 bg-white p-8 text-center">
        <Tablet size={30} className="mx-auto text-neutro-200" />
        <p className="mt-2 text-sm text-neutro-400">
          Todavía ningún dispositivo del agente se ha comunicado.
        </p>
      </div>
    )
  }

  const conProblema = dispositivos.filter(d => d.alerta)

  return (
    <div className="space-y-3">
      {conProblema.length > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-alerta-200 bg-alerta-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-alerta-600" />
          <p className="text-[13px] text-alerta-800">
            <strong>{conProblema.length} dispositivo{conProblema.length === 1 ? '' : 's'}</strong> con
            pedidos sin enviar. Esos pedidos NO están en el sistema todavía: si el
            dispositivo lleva rato sin señal, conviene llamar al agente.
          </p>
        </div>
      )}

      {dispositivos.map((d) => {
        const aviso = d.alerta ? AVISO[d.alerta] : null
        const Icono = aviso?.Icono || CheckCircle2
        return (
          <div
            key={d.id}
            className={`flex items-center gap-3 rounded-2xl border p-4 ${aviso ? aviso.clase : 'border-neutro-200 bg-white'}`}
          >
            <Icono size={20} className={aviso ? aviso.color : 'text-exito-600'} />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-neutro-900">
                {d.usuarioNombre || 'Dispositivo sin nombre'}
              </p>
              <p className="text-[12px] text-neutro-500">
                Último contacto {haceCuanto(d.minutosSinContacto)}
                {aviso && ` · ${aviso.texto}`}
              </p>
              {/* El identificador ayuda a saber CUÁL tablet es cuando hay
                  varias con el mismo usuario. */}
              <p className="text-[10px] text-neutro-300">{d.id.slice(0, 18)}…</p>
            </div>

            {d.pedidosPendientes > 0 && (
              <div className="shrink-0 text-right">
                <p className={`text-xl font-extrabold ${aviso ? aviso.color : 'text-neutro-900'}`}>
                  {d.pedidosPendientes}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutro-400">
                  sin enviar
                </p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
