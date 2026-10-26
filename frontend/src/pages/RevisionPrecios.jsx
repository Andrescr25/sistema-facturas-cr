import { useRevisionPrecios } from '../hooks/useRevisionPrecios'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import ListaFacturas from '../components/revision-precios/ListaFacturas'
import RevisionFactura from '../components/revision-precios/RevisionFactura'
import ModalFactorConversion from '../components/revision-precios/ModalFactorConversion'
import ModalProcesarGasto from '../components/revision-precios/ModalProcesarGasto'
import { useProcesarFacturaGasto } from '../hooks/useProcesarFacturaGasto'
import { useAprobarGasto } from '../hooks/useAprobarGasto'
import GastosPorAprobar from '../components/revision-precios/GastosPorAprobar'
import ModalAprobarGasto from '../components/revision-precios/ModalAprobarGasto'
import ModalFacturaManual from '../components/revision-precios/ModalFacturaManual'
import { useFacturaManual } from '../hooks/useFacturaManual'

export default function RevisionPrecios() {
  const {
    vista,
    facturas,
    facturaSeleccionada,
    productos,
    productosDelCatalogo,
    sugerenciasPrecio,
    loading,
    error,
    tabActiva,
    setTabActiva,
    preciosAjustados,
    enviando,
    devolviendo,
    abrirRevision,
    volverALista,
    devolverFactura,
    ajustarPrecio,
    aplicarPrecioSugerido,
    registrarCompra,

    modalFactor,
    productoSeleccionadoFactor,
    cantidadProveedor,
    setCantidadProveedor,
    cantidadMia,
    setCantidadMia,
    guardandoFactor,
    abrirFactor,
    guardarFactor,
    cerrarModalFactor,

    toasts,
    removeToast,
    showToast,
    dialogProps, recargar
  } = useRevisionPrecios()
  const aprobacion = useAprobarGasto()
  const gasto = useProcesarFacturaGasto(() => { volverALista(); recargar(); aprobacion.cargar() })
  const manual = useFacturaManual((mensaje) => showToast(`✅ ${mensaje}`, 'success'))

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {vista === 'lista' ? (
        <ListaFacturas
          facturas={facturas}
          loading={loading}
          error={error}
          tabActiva={tabActiva}
          setTabActiva={setTabActiva}
          onAbrirRevision={abrirRevision}
          onProcesarGasto={gasto.abrir}
          gastosPendientes={<GastosPorAprobar estado={aprobacion} />}
          onCargarManual={manual.abrir}
        />
      ) : (
        <RevisionFactura
          facturaSeleccionada={facturaSeleccionada}
          productos={productos}
          productosDelCatalogo={productosDelCatalogo}
          sugerenciasPrecio={sugerenciasPrecio}
          preciosAjustados={preciosAjustados}
          loading={loading}
          devolviendo={devolviendo}
          enviando={enviando}
          onVolver={volverALista}
          onDevolver={devolverFactura}
          onAjustarPrecio={ajustarPrecio}
          onAplicarPrecioSugerido={aplicarPrecioSugerido}
          onAbrirFactor={abrirFactor}
          onEnviar={registrarCompra}
          onProcesarGasto={gasto.abrir}
        />
      )}

      {modalFactor && productoSeleccionadoFactor && (
        <ModalFactorConversion
          producto={productoSeleccionadoFactor}
          cantidadProveedor={cantidadProveedor}
          setCantidadProveedor={setCantidadProveedor}
          cantidadMia={cantidadMia}
          setCantidadMia={setCantidadMia}
          guardando={guardandoFactor}
          onGuardar={guardarFactor}
          onCerrar={cerrarModalFactor}
        />
      )}

      <ConfirmModal {...dialogProps} />
      {gasto.factura && <ModalProcesarGasto key={gasto.factura.id} estado={gasto} />}
      {manual.abierta && <ModalFacturaManual estado={manual} />}
      {aprobacion.seleccion && <ModalAprobarGasto key={`${aprobacion.seleccion.gasto.id}-${aprobacion.seleccion.accion}`} estado={aprobacion} />}
    </>
  )
}
