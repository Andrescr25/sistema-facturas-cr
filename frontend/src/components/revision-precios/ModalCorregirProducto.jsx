import { useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import ModalBuscarProducto from '../relacionar-productos/ModalBuscarProducto'
import { opcionTodas } from '../../utils/compraRegistrada'

/**
 * Corregir el producto de una línea de compra registrada: primero se busca el
 * producto correcto, después se confirma (2026-11-05). Corregir mueve el
 * inventario, el costo y lo que Reporte Clientes cuenta como ingresado.
 */
export default function ModalCorregirProducto({ linea, elegido, onElegir, buscador, guardando, onConfirmar, onCerrar }) {
  const opcion = opcionTodas(linea)
  const [todas, setTodas] = useState(opcion.marcada)

  if (!elegido) {
    return (
      <ModalBuscarProducto
        titulo="Elegir el producto correcto"
        productoSeleccionado={{ descripcion: linea.descripcion, codigoProveedor: linea.codigoProveedor, cantidad: linea.cantidad, unidadMedida: linea.unidad }}
        busqueda={buscador.busqueda}
        setBusqueda={buscador.setBusqueda}
        resultadosBusqueda={buscador.resultados}
        buscando={buscador.buscando}
        onRelacionar={onElegir}
        onCerrar={onCerrar}
      />
    )
  }

  return (
    <Modal
      onCerrar={onCerrar}
      titulo="Corregir el producto"
      ancho="lg"
      pie={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Boton variante="secundario" onClick={() => onElegir(null)} disabled={guardando}>Elegir otro</Boton>
          <Boton icono={guardando ? Loader2 : CheckCircle2} onClick={() => onConfirmar({ todas })} disabled={guardando}>
            {guardando ? 'Corrigiendo…' : 'Corregir'}
          </Boton>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="rounded-2xl bg-neutro-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutro-400">Del proveedor</p>
          <p className="font-semibold text-neutro-900">{linea.descripcion}</p>
        </div>
        <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="rounded-2xl border border-peligro-200 bg-peligro-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-peligro-700">Quedó como</p>
            <p className="font-semibold text-neutro-900">{linea.producto?.nombre || 'Sin producto'}</p>
          </div>
          <ArrowRight size={20} className="mx-auto rotate-90 text-neutro-400 sm:rotate-0" aria-hidden="true" />
          <div className="rounded-2xl border border-exito-200 bg-exito-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-exito-700">Pasa a</p>
            <p className="font-semibold text-neutro-900">{elegido.name}</p>
          </div>
        </div>
        {opcion.mostrar && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-neutro-200 p-4">
            <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded" />
            <span className="text-sm text-neutro-700">
              <strong className="text-neutro-900">También las demás compras de este código</strong>
              {linea.otrasCompras > 0 ? ` (${linea.otrasCompras} más quedaron con «${linea.producto?.nombre}»)` : ''}
              {' '}y la relación, para que las próximas facturas lleguen bien.
            </span>
          </label>
        )}
        <p className="text-sm text-neutro-500">
          Se ajusta el inventario de los dos productos, el costo si era su última compra, y lo que Reporte Clientes cuenta como ingresado. Queda en la bitácora.
        </p>
      </div>
    </Modal>
  )
}
