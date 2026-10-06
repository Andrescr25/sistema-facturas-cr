import FiltroCicloOperacion from '../components/FiltroCicloOperacion'
import { AlertCircle, AlertTriangle, CheckCircle, X } from 'lucide-react'
import { useFacturasBodega } from '../hooks/useFacturasBodega'
import HeaderBodega from '../components/facturas-bodega/HeaderBodega'
import ListadoFacturas from '../components/facturas-bodega/ListadoFacturas'
import DetalleDespacho from '../components/facturas-bodega/DetalleDespacho'
import ModalClienteCompletado from '../components/facturas-bodega/ModalClienteCompletado'
import ModalImagenProducto from '../components/inventario-auditoria/ModalImagenProducto'
import SkeletonContraparte from '../components/pagos/SkeletonContraparte'

/**
 * Facturas en Bodega, con la forma de los demás módulos: título, tarjetas
 * de resumen que sirven para cambiar de vista, la lista como tarjetas
 * grandes, y el despacho de una factura como su detalle.
 */
export default function FacturasBodega() {
  const b = useFacturasBodega()

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      {!b.facturaSeleccionada && (
        <HeaderBodega sincronizando={b.sincronizando} ultimaSync={b.ultimaSync} onActualizar={b.actualizar} />
      )}

      {!b.facturaSeleccionada && <FiltroCicloOperacion filtro={b.filtroCiclo} />}

      {b.successMessage && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-exito-200 bg-exito-50 px-4 py-3 text-exito-800">
          <span className="flex items-center gap-2"><CheckCircle size={18} className="text-exito-500" /> {b.successMessage}</span>
          <button type="button" onClick={() => b.setSuccessMessage(null)} aria-label="Ocultar" className="-m-2 rounded-lg p-2.5"><X size={18} /></button>
        </div>
      )}

      {/* Un problema de sincronización NO borra la lista: se avisa y se sigue
          trabajando con la última guardada. */}
      {b.aviso && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-alerta-200 bg-alerta-50 px-4 py-3 text-alerta-800">
          <span className="flex items-start gap-2"><AlertTriangle size={18} className="mt-0.5 shrink-0" /> {b.aviso}</span>
          <button type="button" onClick={() => b.setAviso(null)} aria-label="Ocultar el aviso" className="-m-2 rounded-lg p-2.5"><X size={18} /></button>
        </div>
      )}

      {b.error && (
        <div className="flex items-center gap-2 rounded-xl border border-peligro-200 bg-peligro-50 px-4 py-3 text-peligro-800">
          <AlertCircle size={18} className="shrink-0" />
          <span>{b.error} </span>
          <button type="button" onClick={b.actualizar} className="ml-auto rounded-lg px-2 py-2 font-semibold underline">Reintentar</button>
        </div>
      )}

      {b.cargando ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonContraparte /><SkeletonContraparte /><SkeletonContraparte />
        </div>
      ) : b.facturaSeleccionada ? (
        <DetalleDespacho
          factura={b.facturaSeleccionada}
          faltantesDraft={b.faltantesDraft}
          checkedItemsCount={b.checkedItemsCount}
          progressPercent={b.progressPercent}
          allItemsChecked={b.allItemsChecked}
          guardando={b.guardando}
          cargandoEstados={b.cargandoEstados}
          esEdicion={b.esEdicion}
          accionPrincipalLabel={b.accionPrincipalLabel}
          onVolver={b.cerrarFactura}
          onMarcarModo={b.marcarModoFaltante}
          onCambiarCantidad={b.actualizarCantidadFaltante}
          onCambiarObservacion={b.actualizarObservacionItem}
          onGuardar={b.handleRegistrarFaltantes}
          onVerImagen={b.handleVerImagenProducto}
        />
      ) : (
        <ListadoFacturas
          vista={b.vista}
          setVista={b.setVista}
          conteos={b.conteos}
          busqueda={b.busqueda}
          setBusqueda={b.setBusqueda}
          filtros={b.filtros}
          cambiarFiltro={b.cambiarFiltro}
          limpiarFiltros={b.limpiarFiltros}
          facturas={b.facturasMostradas}
          onAbrir={b.abrirFactura}
        />
      )}

      {b.clienteCompletado && (
        <ModalClienteCompletado clienteCompletado={b.clienteCompletado} onCerrar={() => b.setClienteCompletado(null)} />
      )}

      {b.imagenProductoActivo && (
        <ModalImagenProducto item={b.imagenProductoActivo} onCerrar={b.handleCerrarImagenProducto} />
      )}
    </div>
  )
}
