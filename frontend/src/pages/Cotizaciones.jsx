import { useEffect, useState, useCallback } from 'react'
import { FileText, Plus, Loader2, CheckCircle2, Clock, AlertCircle, Pencil, FileDown, Send, Trash2 } from 'lucide-react'
import api from '../services/api'
import Boton from '../components/ui/Boton'
import Insignia from '../components/ui/Insignia'
import ModalCotizacion from '../components/cotizaciones/ModalCotizacion'
import ModalEnviarWhatsApp from '../components/whatsapp/ModalEnviarWhatsApp'
import ConfirmModal from '../components/ConfirmModal'
import { useDialog } from '../hooks/useDialog'
import { mensajeCotizacion } from '../utils/mensajesWhatsApp'
import { colones } from '../utils/colones'

/**
 * Cotizaciones (proformas), en la base propia (migración 029).
 *
 * El estado —vigente, vencida, facturada— lo calcula el servidor con el día
 * de Costa Rica: calcularlo acá con la hora del teléfono daba "vencida" una
 * noche antes.
 *
 * Facturar crea una factura propia en la misma transacción que marca la
 * cotización: tocar dos veces devuelve la misma factura, no crea dos.
 */


const fecha = (f) =>
  f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function Cotizaciones() {
  const { confirm, dialogProps } = useDialog()
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [facturando, setFacturando] = useState(null)
  const [aviso, setAviso] = useState('')
  // La cotización vencida que el servidor devolvió para confirmar, con su
  // explicación. No se guarda un booleano: el texto lo escribe el servidor,
  // que es quien sabe de qué fecha son los precios.
  const [porConfirmar, setPorConfirmar] = useState(null)
  // La cotización que se está editando, ya con su detalle traído. El listado
  // no trae las líneas, y sin ellas el modal no puede prellenarse.
  const [editando, setEditando] = useState(null)
  const [abriendo, setAbriendo] = useState(null)
  // La cotización que se está por mandar por WhatsApp.
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(null)
  const [borrando, setBorrando] = useState(null)

  const traer = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get('/cotizaciones')
      setLista(data.data || [])
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudieron cargar las cotizaciones.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { traer() }, [traer])

  const facturar = async (c, aunqueVencida = false) => {
    setFacturando(c.id)
    setAviso('')
    setError('')
    setPorConfirmar(null)
    try {
      const { data } = await api.post(`/cotizaciones/${c.id}/facturar`, { aunqueVencida })
      setAviso(data.data.yaExistia
        ? `La cotización ${c.numero} ya estaba facturada: factura ${data.data.numeroFactura}.`
        : `Cotización ${c.numero} facturada: factura ${data.data.numeroFactura}.`)
      await traer()
    } catch (e) {
      // 409 = el servidor no se niega, pide que se confirme: la cotización
      // venció y facturarla cobra el precio de aquella fecha.
      if (e.response?.status === 409) {
        setPorConfirmar({ cotizacion: c, mensaje: e.response.data?.message || '' })
      } else {
        setError(e.response?.data?.message || 'No se pudo facturar.')
      }
    } finally {
      setFacturando(null)
    }
  }

  const abrirPdf = async (c) => {
    setAbriendo(`pdf-${c.id}`)
    setError('')
    // La ventana se abre ANTES de pedir el archivo. Abrirla después, dentro
    // del `await`, el navegador la trata como emergente y la bloquea: deja de
    // ser una consecuencia directa del clic.
    const ventana = window.open('', '_blank')
    try {
      // El PDF lo arma nuestro servidor, así que viene como archivo y no como
      // enlace: hay que pedirlo con el token y abrirlo desde la memoria del
      // navegador. Una URL suelta en otra pestaña no lleva la autorización.
      const { data } = await api.get(`/cotizaciones/${c.id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      if (ventana) ventana.location = url
      else window.location.href = url
      // Se libera después de que la pestaña alcanzó a cargarlo; revocarlo de
      // inmediato deja la ventana en blanco.
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) {
      ventana?.close()
      setError('No se pudo abrir el PDF.')
    } finally {
      setAbriendo(null)
    }
  }

  const abrirEdicion = async (c) => {
    setAbriendo(`editar-${c.id}`)
    setError('')
    try {
      const { data } = await api.get(`/cotizaciones/${c.id}`)
      setEditando(data.data)
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo abrir la cotización.')
    } finally {
      setAbriendo(null)
    }
  }

  const eliminar = async (c) => {
    // Se pregunta porque borra de verdad y no hay deshacer. El texto nombra
    // el cliente y el monto: "¿Eliminar la 8?" no alcanza para darse cuenta
    // de que es la equivocada.
    const ok = await confirm(
      `¿Eliminar la cotización ${c.numero}?\n\n` +
      `${c.clienteNombre || 'Sin cliente'} · ${colones(c.total)}\n\n` +
      `Se borra y no se puede recuperar.`,
      { confirmLabel: 'Eliminar', variant: 'danger', title: 'Eliminar cotización' }
    )
    if (!ok) return

    setBorrando(c.id)
    setAviso('')
    setError('')
    try {
      await api.delete(`/cotizaciones/${c.id}`)
      setAviso(`Cotización ${c.numero} eliminada.`)
      await traer()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo eliminar.')
    } finally {
      setBorrando(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-neutro-900">Cotizaciones</h1>
          <p className="mt-0.5 text-sm text-neutro-500">
            Precios que se le pasan al cliente antes de vender. No son documento fiscal:
            se factura cuando el cliente acepta.
          </p>
        </div>
        <Boton icono={Plus} onClick={() => setModalAbierto(true)}>Nueva cotización</Boton>
      </div>

      {porConfirmar && (
        <div className="rounded-2xl border border-alerta-200 bg-alerta-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-alerta-600" />
            <p className="text-[13px] font-semibold text-alerta-800">{porConfirmar.mensaje}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 pl-6">
            <Boton
              variante="primario"
              tamano="sm"
              cargando={facturando === porConfirmar.cotizacion.id}
              onClick={() => facturar(porConfirmar.cotizacion, true)}
            >
              Facturar con el precio cotizado
            </Boton>
            <Boton variante="secundario" tamano="sm" onClick={() => setPorConfirmar(null)}>
              Mejor no
            </Boton>
          </div>
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-2 rounded-2xl border border-exito-200 bg-exito-50 px-4 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-exito-600" />
          <p className="text-[13px] font-semibold text-exito-800">{aviso}</p>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-peligro-200 bg-peligro-50 px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-peligro-600" />
          <p className="text-[13px] font-semibold text-peligro-800">{error}</p>
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-neutro-300" />
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-neutro-200 bg-white p-12 text-center">
          <FileText size={34} className="mx-auto text-neutro-200" />
          <p className="mt-3 text-sm text-neutro-400">Todavía no hay cotizaciones.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-neutro-200 bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-extrabold text-neutro-900">{c.numero}</p>
                  {c.estado === 'facturada'
                    ? <Insignia tono="exito" icono={CheckCircle2}>Facturada</Insignia>
                    : c.estado === 'vencida'
                      ? <Insignia tono="peligro" icono={Clock}>Vencida</Insignia>
                      : <Insignia tono="activo" icono={Clock}>Sin facturar</Insignia>}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-neutro-600">{c.clienteNombre || 'Sin cliente'}</p>
                <p className="text-[11px] text-neutro-400">
                  {fecha(c.fecha)} · vale hasta {fecha(c.vence)}
                </p>
                {/* De qué factura salió, o por qué se puede volver a facturar:
                    una factura anulada devuelve la cotización a vigente. */}
                {c.factura && (
                  <p className={`text-[11px] font-semibold ${c.factura.anulada ? 'text-alerta-700' : 'text-neutro-500'}`}>
                    {c.factura.anulada
                      ? `Su factura ${c.factura.numero} se anuló`
                      : `Factura ${c.factura.numero}`}
                  </p>
                )}
                {c.facturadaEnAlegra && (
                  <p className="text-[11px] font-semibold text-neutro-500">Facturada en Alegra</p>
                )}
              </div>

              <p className="shrink-0 text-lg font-extrabold text-neutro-900">{colones(c.total)}</p>

              {/* En el teléfono ocupan el renglón entero y bajan de línea: con
                  shrink-0 la fila medía lo que los cinco botones juntos y el
                  de borrar quedaba afuera de la tarjeta. */}
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
                <Boton
                  variante="secundario"
                  tamano="sm"
                  icono={Send}
                  onClick={() => setEnviandoWhatsApp(c)}
                >
                  WhatsApp
                </Boton>

                <Boton
                  variante="secundario"
                  tamano="sm"
                  icono={FileDown}
                  cargando={abriendo === `pdf-${c.id}`}
                  onClick={() => abrirPdf(c)}
                >
                  PDF
                </Boton>

                {/* Una cotización facturada ya tiene una factura que la
                    copia: cambiarla dejaría los dos documentos diciendo cosas
                    distintas, y la factura es la que vale. */}
                {c.estado !== 'facturada' && (
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    icono={Pencil}
                    cargando={abriendo === `editar-${c.id}`}
                    onClick={() => abrirEdicion(c)}
                  >
                    Editar
                  </Boton>
                )}

                {c.estado !== 'facturada' && (
                  <Boton
                    variante="primario"
                    tamano="sm"
                    cargando={facturando === c.id}
                    onClick={() => facturar(c)}
                  >
                    Facturar
                  </Boton>
                )}

                {/* Una facturada no se puede borrar —tampoco si su factura se
                    anuló—: la factura la referencia y sin ella nadie sabría de
                    dónde salieron esos precios. */}
                {!c.factura && !c.facturadaEnAlegra && (
                  <button
                    type="button"
                    onClick={() => eliminar(c)}
                    disabled={borrando === c.id}
                    aria-label={`Eliminar la cotización ${c.numero}`}
                    className="rounded-lg p-2 text-neutro-300 transition-colors hover:bg-peligro-50 hover:text-peligro-600 disabled:opacity-50"
                  >
                    {borrando === c.id
                      ? <Loader2 size={16} className="animate-spin" />
                      : <Trash2 size={16} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {enviandoWhatsApp && (
        <ModalEnviarWhatsApp
          titulo={`Mandar la cotización ${enviandoWhatsApp.numero}`}
          subtitulo={`Va con el PDF adjunto, a ${enviandoWhatsApp.clienteNombre || 'el cliente'}`}
          clienteId={enviandoWhatsApp.clienteId}
          documento={{ tipo: 'cotizacion', referencia: enviandoWhatsApp.numero }}
          mensajeInicial={mensajeCotizacion({
            numero: enviandoWhatsApp.numero,
            cliente: enviandoWhatsApp.clienteNombre,
            enlace: enviandoWhatsApp.enlacePublico
          })}
          onEnviar={async ({ telefono, mensaje }) => {
            const { data } = await api.post(`/cotizaciones/${enviandoWhatsApp.id}/whatsapp`, { telefono, mensaje })
            return data.data
          }}
          onCerrar={() => setEnviandoWhatsApp(null)}
        />
      )}

      <ConfirmModal {...dialogProps} />

      {(modalAbierto || editando) && (
        <ModalCotizacion
          cotizacion={editando}
          onCerrar={() => { setModalAbierto(false); setEditando(null) }}
          onCreada={async (numero, seEditó) => {
            setModalAbierto(false)
            setEditando(null)
            setAviso(seEditó ? `Cotización ${numero} actualizada.` : `Cotización ${numero} creada.`)
            await traer()
          }}
        />
      )}
    </div>
  )
}
