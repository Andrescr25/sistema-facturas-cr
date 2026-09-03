import { useEffect, useState, useCallback } from 'react'
import { FileText, Plus, Loader2, CheckCircle2, Clock, AlertCircle, Pencil, FileDown } from 'lucide-react'
import api from '../services/api'
import Boton from '../components/ui/Boton'
import Insignia from '../components/ui/Insignia'
import ModalCotizacion from '../components/cotizaciones/ModalCotizacion'

/**
 * Cotizaciones (proformas).
 *
 * Se guardan en Alegra, no en una tabla propia: Alegra ya lleva la numeración,
 * el PDF y el estado "sin facturar" hasta que se convierte en venta. Tener una
 * copia aparte sería mantener dos versiones de lo mismo, y el día que alguien
 * la facture desde Alegra dejarían de coincidir sin que nadie se entere.
 *
 * Facturar desde acá usa el mismo camino que el resto del sistema, con su
 * mapeo de impuestos y su clave de idempotencia: tocar dos veces no crea dos
 * facturas.
 */

const colones = (n) =>
  // es-CR separa los miles con espacio duro (U+00A0); se escribe el código
  // y no el carácter, que es invisible en el editor.
  `₡${Math.round(Number(n) || 0).toLocaleString('es-CR').replace(/\u00A0/g, '.')}`

const fecha = (f) =>
  f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function Cotizaciones() {
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
      setAviso(`Cotización ${c.numero} facturada: ${data.data.numeroFactura}`)
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
    // La ventana se abre ANTES de pedir el enlace. Abrirla después, dentro
    // del `await`, el navegador la trata como emergente y la bloquea: deja de
    // ser una consecuencia directa del clic.
    const ventana = window.open('', '_blank')
    try {
      const { data } = await api.get(`/cotizaciones/${c.id}/pdf`)
      if (ventana) ventana.location = data.data.url
      else window.location.href = data.data.url
    } catch (e) {
      ventana?.close()
      setError(e.response?.data?.message || 'No se pudo abrir el PDF.')
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

  const vencida = (c) => !c.facturada && c.vence && c.vence < new Date().toISOString().split('T')[0]

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
                  {c.facturada
                    ? <Insignia tono="exito" icono={CheckCircle2}>Facturada</Insignia>
                    : vencida(c)
                      ? <Insignia tono="peligro" icono={Clock}>Vencida</Insignia>
                      : <Insignia tono="activo" icono={Clock}>Sin facturar</Insignia>}
                </div>
                <p className="mt-0.5 truncate text-[13px] text-neutro-600">{c.clienteNombre || 'Sin cliente'}</p>
                <p className="text-[11px] text-neutro-400">
                  {fecha(c.fecha)} · vale hasta {fecha(c.vence)}
                </p>
              </div>

              <p className="shrink-0 text-lg font-extrabold text-neutro-900">{colones(c.total)}</p>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                {!c.facturada && (
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

                {!c.facturada && (
                  <Boton
                    variante="primario"
                    tamano="sm"
                    cargando={facturando === c.id}
                    onClick={() => facturar(c)}
                  >
                    Facturar
                  </Boton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
