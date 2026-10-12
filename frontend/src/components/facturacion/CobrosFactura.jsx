import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Insignia from '../ui/Insignia'
import { colones, colonesExacto } from '../../utils/colones'
import { fechaCorta } from '../../utils/fechaCR'
import { medio } from '../../utils/facturaVista'

/**
 * Los cobros de una factura, y anular uno desde ahí.
 *
 * Los anulados van marcados, no escondidos: el cliente va a preguntar por ese
 * cobro y tiene que haber rastro. Anular no borra: el cobro queda con su
 * motivo y la factura vuelve a tener saldo.
 *
 * Acá solo vive lo que es de esta sección —cuál cobro se está por anular y el
 * motivo que se va escribiendo—; anularlo de verdad es `onAnularCobro`, de
 * quien abrió la factura.
 */
export default function CobrosFactura({ cobros = [], puedeAnular = false, onAnularCobro }) {
  const [cobroAnulando, setCobroAnulando] = useState(null)   // uno a la vez
  const [motivoCobro, setMotivoCobro] = useState('')
  const [anulandoCobro, setAnulandoCobro] = useState(false)
  const [errorCobro, setErrorCobro] = useState('')

  const confirmarAnularCobro = async () => {
    if (!motivoCobro.trim()) return setErrorCobro('Escribí por qué se anula el cobro.')
    setAnulandoCobro(true)
    setErrorCobro('')
    try {
      await onAnularCobro(cobroAnulando.id, motivoCobro.trim())
      setCobroAnulando(null)
      setMotivoCobro('')
    } catch (e) {
      setErrorCobro(e.response?.data?.message || 'No se pudo anular el cobro.')
    } finally {
      setAnulandoCobro(false)
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Cobros</p>
      <div className="flex flex-col gap-1">
        {cobros.map(c => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutro-600">{fechaCorta(c.fecha)} · {medio(c.metodo) || 'sin método'}</span>
            {c.referencia && <span className="text-xs text-neutro-400">ref. {c.referencia}</span>}
            <span className="font-semibold text-neutro-800">{colones(c.monto)}</span>
            {c.anulado && <Insignia tono="peligro">Anulado</Insignia>}
            {c.anulado && c.motivoAnulacion && <span className="text-xs text-neutro-400">{c.motivoAnulacion}</span>}
            {!c.anulado && puedeAnular && cobroAnulando?.id !== c.id && (
              <button
                onClick={() => { setCobroAnulando(c); setMotivoCobro(''); setErrorCobro('') }}
                className="text-xs font-semibold text-peligro-600 hover:underline"
              >
                Anular cobro
              </button>
            )}
          </div>
        ))}
      </div>

      {cobroAnulando && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-peligro-200 bg-white p-3">
          <p className="text-xs text-neutro-600">
            Se anula el cobro de <strong>{colonesExacto(cobroAnulando.montoPago ?? cobroAnulando.monto)}</strong>
            {/* Un cobro de Cuentas por Cobrar puede cubrir varias facturas:
                anularlo las deja todas con saldo, y se avisa. */}
            {cobroAnulando.facturas > 1
              ? <> entero: cubre <strong>{cobroAnulando.facturas} facturas</strong> y todas vuelven a quedar con saldo.</>
              : <>. La factura vuelve a quedar con saldo y se puede editar o anular.</>}
          </p>
          <input
            autoFocus
            value={motivoCobro}
            onChange={(e) => setMotivoCobro(e.target.value)}
            placeholder="¿Por qué se anula el cobro?"
            className="input w-full text-sm"
            maxLength={500}
          />
          {errorCobro && <p className="text-xs text-peligro-700">{errorCobro}</p>}
          <div className="flex gap-2">
            <button onClick={() => setCobroAnulando(null)} disabled={anulandoCobro} className="btn btn-outline flex-1 text-sm">
              Dejarlo como está
            </button>
            <button
              onClick={confirmarAnularCobro}
              disabled={anulandoCobro}
              className="btn flex flex-1 items-center justify-center gap-2 bg-peligro-600 text-sm font-bold text-white hover:bg-peligro-700 disabled:opacity-50"
            >
              {anulandoCobro && <Loader2 size={14} className="animate-spin" />} Anular el cobro
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
