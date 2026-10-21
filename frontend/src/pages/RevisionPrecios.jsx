import { useRevisionPrecios } from '../hooks/useRevisionPrecios'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import ListaFacturas from '../components/revision-precios/ListaFacturas'
import RevisionFactura from '../components/revision-precios/RevisionFactura'
import ModalFactorConversion from '../components/revision-precios/ModalFactorConversion'

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
    dialogProps
  } = useRevisionPrecios()

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
    </>
  )
}
