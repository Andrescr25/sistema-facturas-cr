import { Landmark } from 'lucide-react'
import { useReporteContador } from '../hooks/useReporteContador'
import SelectorMes from '../components/reporte-contador/SelectorMes'
import TarjetaPeriodo from '../components/reporte-contador/TarjetaPeriodo'
import ResumenComparativo from '../components/reporte-contador/ResumenComparativo'
import TablaFacturas from '../components/reporte-contador/TablaFacturas'
import ModalEnviarContador from '../components/reporte-contador/ModalEnviarContador'
import ConfirmModal from '../components/ConfirmModal'
import ToastContainer from '../components/ToastContainer'

/**
 * Reporte Contador — control interno mensual de ventas y compras.
 *
 * Se suben los dos Excel que exporta Alegra ("Impuestos en Ventas" /
 * "Impuestos en Compras"). En ventas, el módulo detecta automáticamente
 * facturas que están duplicadas — la misma venta registrada como documento
 * interno ("sin emisión") y además como factura electrónica — y las deja
 * pre-marcadas para excluir, siempre reversible. Todo lo demás se edita a
 * mano: exclusión por factura, edición o borrado de línea.
 */
export default function ReporteContador() {
  const {
    periodoSeleccionado, setPeriodoSeleccionado,
    periodos, periodoDe, subiendo, handleSubirArchivo, handleImportarAlegra, handleEliminarPeriodo,
    tabActiva, setTabActiva, detalle, loadingDetalle, resumenVentas, resumenCompras,
    handleToggleFactura, handleEditarLinea, handleEliminarLinea,
    handleRedetectar, handleExportar,
    modalContadorAbierto, setModalContadorAbierto, contactos, envioDisponible,
    handleCrearContacto, handleEliminarContacto, handleEnviarContador,
    dialogProps, toasts, removeToast
  } = useReporteContador()

  // El modal manda los DOS reportes del mes, no solo el de la pestaña
  // abierta, así que lista lo que hay cargado sin importar `tabActiva`.
  const nombreMes = ({ anio, mes }) => {
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    return `${meses[mes - 1]} ${anio}`
  }

  const ventas = periodoDe('ventas')
  const compras = periodoDe('compras')

  return (
    <div className="max-w-6xl mx-auto pb-24 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutro-900 flex items-center gap-2.5">
            <Landmark className="text-primario-600" size={28} />
            Reporte Contador
          </h1>
          <p className="text-neutro-600 mt-1">
            Control interno mensual de ventas y compras — se traen de Alegra, los revisás y exportás.
          </p>
        </div>
        <SelectorMes periodo={periodoSeleccionado} onCambiar={setPeriodoSeleccionado} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TarjetaPeriodo tipo="ventas" periodo={ventas} subiendo={subiendo} onSubir={handleSubirArchivo} onImportar={handleImportarAlegra} onEliminar={handleEliminarPeriodo} />
        <TarjetaPeriodo tipo="compras" periodo={compras} subiendo={subiendo} onSubir={handleSubirArchivo} onImportar={handleImportarAlegra} onEliminar={handleEliminarPeriodo} />
      </div>

      <ResumenComparativo ventas={ventas} compras={compras} resumenVentas={resumenVentas} resumenCompras={resumenCompras} />

      {(ventas || compras) && (
        <div className="flex bg-neutro-100 p-1.5 rounded-2xl max-w-xs">
          {['ventas', 'compras'].map(t => (
            <button
              key={t}
              onClick={() => setTabActiva(t)}
              disabled={!periodoDe(t)}
              className={`flex-1 py-2 text-center text-sm font-semibold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                tabActiva === t ? 'bg-white text-primario-600 shadow-md ring-1 ring-black/5' : 'text-neutro-600 hover:text-neutro-900'
              }`}
            >
              {t === 'ventas' ? 'Ventas' : 'Compras'}
            </button>
          ))}
        </div>
      )}

      <TablaFacturas
        tipo={tabActiva}
        detalle={detalle}
        loading={loadingDetalle}
        onToggleFactura={handleToggleFactura}
        onEditarLinea={handleEditarLinea}
        onEliminarLinea={handleEliminarLinea}
        onRedetectar={handleRedetectar}
        onExportar={handleExportar}
        onEnviarContador={() => setModalContadorAbierto(true)}
      />

      <ModalEnviarContador
        abierto={modalContadorAbierto}
        onCerrar={() => setModalContadorAbierto(false)}
        onEnviar={handleEnviarContador}
        onCrearContacto={handleCrearContacto}
        onEliminarContacto={handleEliminarContacto}
        contactos={contactos}
        envioDisponible={envioDisponible}
        etiquetaMes={nombreMes(periodoSeleccionado)}
        adjuntos={periodos.map(p => p.tipo)}
      />

      <ConfirmModal {...dialogProps} />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
