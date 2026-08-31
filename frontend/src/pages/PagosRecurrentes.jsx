import { useState } from 'react'
import { CalendarClock, Landmark } from 'lucide-react'
import { usePagosRecurrentes } from '../hooks/usePagosRecurrentes'
import ResumenMes from '../components/pagos-recurrentes/ResumenMes'
import ListaPagosMes from '../components/pagos-recurrentes/ListaPagosMes'
import ListaGastos from '../components/pagos-recurrentes/ListaGastos'
import ModalGasto from '../components/pagos-recurrentes/ModalGasto'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/ToastContainer'

/**
 * Pagos Recurrentes: los gastos fijos del negocio (luz, agua, internet,
 * alquiler, insumos, planilla) mes a mes.
 *
 * Dos pestañas: "Este mes" es el día a día (qué falta pagar, qué está
 * vencido) y "Gastos fijos" son las plantillas que lo generan — se tocan
 * poco, así que no compiten por la pantalla principal.
 */
export default function PagosRecurrentes() {
  const [tab, setTab] = useState('mes')
  const [modalGasto, setModalGasto] = useState(null) // null | 'nuevo' | gasto

  const {
    periodo, pagos, resumenMes, loadingPeriodo,
    irMesAnterior, irMesSiguiente, irMesActual,
    gastos, categorias, frecuencias, loadingGastos,
    resumenFlujo, guardando,
    fuentesAuto, sincronizando, handleSincronizarRecibos,
    handleMarcarPagado, handleRevertirPago,
    handleGuardarGasto, handleCambiarActivo, handleEliminarGasto,
    dialogProps, toasts, removeToast
  } = usePagosRecurrentes()

  const tabs = [
    { key: 'mes', label: 'Este mes', icon: CalendarClock, count: resumenMes?.cantidadPendiente },
    { key: 'gastos', label: 'Gastos fijos', icon: Landmark, count: gastos.filter(g => g.activo).length }
  ]

  return (
    <div className="max-w-5xl mx-auto pb-24 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutro-900">Pagos Recurrentes</h1>
        <p className="text-neutro-600 mt-1">
          Luz, agua, internet, alquiler, insumos y planilla — cuánto sale cada mes y qué falta pagar.
        </p>
      </div>

      <div className="flex bg-neutro-100 p-1.5 rounded-2xl max-w-md">
        {tabs.map(t => {
          const Icon = t.icon
          const activa = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all ${
                activa ? 'bg-white text-primario-600 shadow-md ring-1 ring-black/5' : 'text-neutro-600 hover:text-neutro-900'
              }`}
            >
              <Icon size={16} />
              {t.label}
              {t.count > 0 && (
                <span className={`text-xxs px-2 py-0.5 rounded-full ${activa ? 'bg-primario-100 text-primario-800' : 'bg-neutro-200 text-neutro-700'}`}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'mes' ? (
        <>
          <ResumenMes
            periodo={periodo}
            resumen={resumenMes}
            resumenFlujo={resumenFlujo}
            onAnterior={irMesAnterior}
            onSiguiente={irMesSiguiente}
            onHoy={irMesActual}
            onSincronizar={handleSincronizarRecibos}
            sincronizando={sincronizando}
            hayFuentesAuto={gastos.some(g => g.fuenteAuto)}
          />
          <ListaPagosMes
            pagos={pagos}
            loading={loadingPeriodo}
            onPagar={handleMarcarPagado}
            onRevertir={handleRevertirPago}
          />
        </>
      ) : (
        <ListaGastos
          gastos={gastos}
          loading={loadingGastos}
          onNuevo={() => setModalGasto('nuevo')}
          onEditar={(g) => setModalGasto(g)}
          onCambiarActivo={handleCambiarActivo}
          onEliminar={handleEliminarGasto}
        />
      )}

      {modalGasto && (
        <ModalGasto
          gasto={modalGasto === 'nuevo' ? null : modalGasto}
          categorias={categorias}
          frecuencias={frecuencias}
          fuentesAuto={fuentesAuto}
          guardando={guardando}
          onGuardar={handleGuardarGasto}
          onCerrar={() => setModalGasto(null)}
        />
      )}

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
