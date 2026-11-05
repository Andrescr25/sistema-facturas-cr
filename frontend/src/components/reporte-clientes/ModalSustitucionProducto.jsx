import { ArrowLeftRight } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { formatearMoneda } from '../../utils/moneda'

export default function ModalSustitucionProducto({ cambio }) {
  if (!cambio.contexto) return null
  const { factura, producto } = cambio.contexto
  return (
    <Modal titulo="Cambiar producto" ancho="xl" onCerrar={cambio.cerrar} pie={
      <div className="flex flex-wrap justify-end gap-2">
        <Boton variante="fantasma" onClick={cambio.cerrar} disabled={cambio.guardando}>Cancelar</Boton>
        <Boton icono={ArrowLeftRight} onClick={cambio.guardar} disabled={!cambio.puedeGuardar} cargando={cambio.guardando}>Confirmar cambio</Boton>
      </div>
    }>
      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-semibold text-neutro-500">Factura #{factura.numero_factura}</p>
          <p className="mt-1 font-bold text-neutro-900 break-words">{producto.nombre}</p>
          <p className="mt-1 text-sm text-neutro-600">{producto.cantidad_faltante} unidades faltantes. Elegí el equivalente que sí ingresó.</p>
        </div>
        <label className="block text-sm font-bold text-neutro-800">
          Buscar producto ingresado
          <input type="search" value={cambio.busqueda} onChange={e => cambio.buscar(e.target.value)} disabled={cambio.guardando}
            placeholder="Nombre o código del sustituto" className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-neutro-200 bg-white px-3 font-normal" />
        </label>
        {cambio.buscando ? <p role="status" className="text-sm text-neutro-500">Buscando ingresos disponibles…</p> : (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {!cambio.productos.length && !cambio.error && <p className="text-sm text-neutro-500">No hay productos ingresados disponibles para esta búsqueda.</p>}
            {cambio.productos.map(p => (
              <button key={p.id} type="button" onClick={() => cambio.seleccionar(p)} aria-pressed={cambio.seleccionado?.id === p.id}
                disabled={cambio.guardando || p.disponible < 1}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${cambio.seleccionado?.id === p.id ? 'border-primario-500 bg-primario-50' : 'border-neutro-200 bg-white hover:bg-neutro-50'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-bold text-neutro-900">{p.nombre}</span>
                  <span className="text-xs text-neutro-500">{p.referencia} · Disponibles: {p.disponible} {p.unidad}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-neutro-500"><strong className="block text-sm text-neutro-900">{formatearMoneda(p.precio)}</strong>Lista con IVA</span>
              </button>
            ))}
          </div>
        )}
        {cambio.seleccionado && (
          <label className="block text-sm font-bold text-neutro-800">
            Cantidad a sustituir
            <input type="number" inputMode="numeric" min="1" step="1"
              max={Math.min(Number(producto.cantidad_faltante), Math.floor(cambio.seleccionado.disponible))}
              value={cambio.cantidad} onChange={e => cambio.cambiarCantidad(e.target.value)} disabled={cambio.guardando}
              className="mt-2 block min-h-11 w-28 rounded-xl border border-neutro-200 px-3 text-center" />
          </label>
        )}
        {cambio.cotizando && <p role="status" className="text-sm text-neutro-500">Calculando precio e importe de la factura…</p>}
        {cambio.prevision && (
          <div className="space-y-2 rounded-xl bg-neutro-50 p-4 text-sm">
            <p className="break-words font-bold text-neutro-900">{cambio.prevision.producto.nombre}</p>
            <p className="text-neutro-600">{cambio.prevision.cantidad} unidades · {formatearMoneda(cambio.prevision.producto.precio)} cada una con IVA ({cambio.prevision.producto.tarifa}%).</p>
            {cambio.prevision.faltanteOriginalRestante > 0 && <p className="text-alerta-800">
              {cambio.prevision.faltanteOriginalRestante === 1 ? 'Queda' : 'Quedan'} {cambio.prevision.faltanteOriginalRestante} {cambio.prevision.faltanteOriginalRestante === 1 ? 'unidad pendiente' : 'unidades pendientes'} del producto original.
            </p>}
            {cambio.prevision.producto.descuento > 0 && <p className="text-neutro-600">Descuento aplicado: {cambio.prevision.producto.descuento}%.</p>}
            <div className="flex justify-between gap-2"><span>Factura actual</span><span>{formatearMoneda(cambio.prevision.factura.totalAnterior)}</span></div>
            <div className="flex justify-between gap-2 font-bold text-primario-900"><span>Factura con el cambio</span><span>{formatearMoneda(cambio.prevision.factura.totalNuevo)}</span></div>
          </div>
        )}
        {cambio.error && <div role="alert" className="rounded-xl bg-peligro-50 p-3 text-sm text-peligro-700">
          <p>{cambio.error}</p>
          {cambio.seleccionado && !cambio.guardando && <button type="button" onClick={cambio.revisar} className="mt-2 min-h-11 font-bold underline">Revisar de nuevo</button>}
        </div>}
      </div>
    </Modal>
  )
}
