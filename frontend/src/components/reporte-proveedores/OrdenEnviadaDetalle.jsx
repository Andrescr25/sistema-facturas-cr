import { ArrowLeft, Check, RotateCw } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import PanelSeccion from '../ui/PanelSeccion'
import { fechaHoraEnCostaRica } from '../../utils/fechaCR'
import { useReenvioOrden } from '../../hooks/useReenvioOrden'
import ModalReenviarOrden from './ModalReenviarOrden'

/**
 * El detalle enviado lee exclusivamente sus productos y cantidades guardados.
 * Ya enviada (no la que está por verificar), se puede «Volver a enviar», con o
 * sin los códigos del proveedor (2026-11-11).
 */
export default function OrdenEnviadaDetalle({ proveedor, onVolver }) {
  const incierta = proveedor.estado_envio === 'incierto' || proveedor.estado_envio === 'enviando'
  const reenvio = useReenvioOrden(proveedor.orden_id)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Boton variante="fantasma" icono={ArrowLeft} onClick={onVolver} className="min-h-12">Volver a proveedores</Boton>
      {!incierta && proveedor.orden_id && <Boton variante="secundario" icono={RotateCw} onClick={reenvio.abrir} className="min-h-12">Volver a enviar</Boton>}
    </div>
    {reenvio.abierto && <ModalReenviarOrden proveedor={proveedor} reenvio={reenvio} />}
    <div className="rounded-2xl border border-neutro-200 bg-white p-5 sm:p-6 space-y-3">
      <h2 className="break-words text-2xl font-bold text-neutro-500 line-through">{proveedor.nombre}</h2>
      <Insignia tono={incierta ? 'alerta' : 'exito'} icono={incierta ? undefined : Check}>{incierta ? 'Envío por verificar' : 'Enviada'}</Insignia>
      {proveedor.enviada_en && <p className="text-sm text-neutro-500">{fechaHoraEnCostaRica(proveedor.enviada_en)}</p>}
    </div>
    <PanelSeccion titulo="Productos solicitados" cuerpoClassName="p-0">
      <div className="divide-y divide-neutro-100">
        {proveedor.productos_faltantes.map((producto, index) => {
          return <div key={producto.producto_id || index} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="break-words font-semibold text-neutro-500 line-through">{producto.nombre}</p>
              <p className="break-words text-sm text-neutro-500">Código: {producto.codigo}</p>
            </div>
            <div className="shrink-0 text-sm text-neutro-600">
              <p className="font-semibold">{producto.cantidad_faltante} unidades</p>
              {Number(producto.factor_conversion) !== 1 && producto.cantidad_proveedor != null &&
                <p className="mt-1 text-xs text-neutro-500">{producto.cantidad_proveedor} unidades del proveedor</p>}
            </div>
          </div>
        })}
      </div>
    </PanelSeccion>
  </div>
}
