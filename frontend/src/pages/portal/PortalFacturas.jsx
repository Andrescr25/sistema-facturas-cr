import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Loader2, ArrowLeft, FileText, AlertTriangle, CheckCircle2, LogOut } from 'lucide-react'
import { usePortalCliente } from '../../contexts/PortalClienteContext'
import apiPortal from '../../services/apiPortal'
import { formatearColones } from '../../utils/catalogoClientesUtils'
import { fechaEnPalabras } from '../../utils/fechaCR'

/**
 * Lo que el cliente tiene pendiente de pago.
 *
 * Se muestra lo que él ya sabe o debería saber: qué factura, de cuándo,
 * cuánto era, cuánto abonó y cuánto queda. Nada del estado interno del
 * cobro.
 *
 * Lo vencido va primero y destacado, no escondido entre el resto: es lo que
 * hay que resolver, y quien entra acá entra justamente a ver eso.
 */
export default function PortalFacturas() {
  const { cliente, cargando: cargandoSesion, salir } = usePortalCliente()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!cliente) return
    apiPortal.get('/portal/facturas')
      .then(({ data }) => setDatos(data.data))
      .catch(() => setDatos({ facturas: [], total: 0, vencido: 0, cantidad: 0 }))
      .finally(() => setCargando(false))
  }, [cliente])

  if (cargandoSesion) {
    return <div className="min-h-screen bg-neutro-50 flex items-center justify-center">
      <Loader2 size={26} className="animate-spin text-cliente-600" />
    </div>
  }
  if (!cliente) return <Navigate to="/portal/ingresar" replace state={{ destino: '/portal/facturas' }} />

  return (
    <div className="min-h-screen bg-neutro-50 pb-10">
      <header className="bg-white border-b border-neutro-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link to="/catalogo" className="flex items-center gap-1.5 text-[13px] font-semibold text-neutro-600 hover:text-cliente-700">
            <ArrowLeft size={15} />
            Catálogo
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/portal/pedidos" className="text-[12px] font-semibold text-neutro-500 hover:text-cliente-700">
              Mis pedidos
            </Link>
            <button
              type="button"
              onClick={salir}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-neutro-400 hover:text-peligro-600"
            >
              <LogOut size={13} />
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <h1 className="text-lg font-extrabold text-neutro-900 mb-4">Facturas pendientes</h1>

        {cargando ? (
          <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-cliente-600" /></div>
        ) : datos.cantidad === 0 ? (
          <div className="bg-white rounded-3xl border border-neutro-200 p-10 text-center flex flex-col items-center gap-3">
            <CheckCircle2 size={38} className="text-cliente-600" />
            <p className="text-[14px] font-bold text-neutro-900">No tiene facturas pendientes</p>
            <p className="text-[12px] text-neutro-400">Está al día con nosotros.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="bg-white rounded-2xl border border-neutro-200 p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-neutro-400">Saldo total</p>
                <p className="text-[19px] font-extrabold text-neutro-900 mt-0.5">{formatearColones(datos.total)}</p>
                <p className="text-[11px] text-neutro-400">{datos.cantidad} factura{datos.cantidad === 1 ? '' : 's'}</p>
              </div>
              <div className={`rounded-2xl border p-3.5 ${datos.vencido > 0 ? 'bg-peligro-50 border-peligro-200' : 'bg-white border-neutro-200'}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wide ${datos.vencido > 0 ? 'text-peligro-500' : 'text-neutro-400'}`}>
                  Vencido
                </p>
                <p className={`text-[19px] font-extrabold mt-0.5 ${datos.vencido > 0 ? 'text-peligro-600' : 'text-neutro-900'}`}>
                  {formatearColones(datos.vencido)}
                </p>
                {datos.vencido > 0 && <p className="text-[11px] text-peligro-500">Requiere atención</p>}
              </div>
            </div>

            <div className="space-y-2">
              {datos.facturas.map(f => (
                <div
                  key={f.numero}
                  className={`bg-white rounded-2xl border p-3.5 ${f.vencida ? 'border-peligro-200' : 'border-neutro-200'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <FileText size={13} className="text-neutro-300 shrink-0" />
                        <p className="text-[13px] font-bold text-neutro-900 truncate">{f.numero}</p>
                      </div>
                      <p className="text-[11px] text-neutro-400 mt-0.5">
                        Emitida {fechaEnPalabras(f.fecha, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {f.vencimiento && <> · vence {new Date(f.vencimiento).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[15px] font-extrabold ${f.vencida ? 'text-peligro-600' : 'text-neutro-900'}`}>
                        {formatearColones(f.saldo)}
                      </p>
                      {/* El abono parcial solo se nombra cuando existe: en una
                          factura sin abonos, "abonó ₡0" es ruido. */}
                      {f.pagado > 0 && (
                        <p className="text-[11px] text-neutro-400">
                          de {formatearColones(f.total)} · abonó {formatearColones(f.pagado)}
                        </p>
                      )}
                    </div>
                  </div>

                  {f.vencida && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-peligro-100">
                      <AlertTriangle size={12} className="text-peligro-500 shrink-0" />
                      <p className="text-[11px] font-semibold text-peligro-600">
                        Vencida hace {f.diasVencida} día{f.diasVencida === 1 ? '' : 's'}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-[11px] text-neutro-400 text-center mt-4">
              ¿Ya pagó alguna? Puede tardar un momento en reflejarse.
            </p>
          </>
        )}
      </main>
    </div>
  )
}
