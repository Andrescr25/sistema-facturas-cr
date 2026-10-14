import { ArrowLeft, Check } from 'lucide-react'
import Boton from '../ui/Boton'
import Insignia from '../ui/Insignia'
import PanelSeccion from '../ui/PanelSeccion'
import { indicacionFacturacion } from '../../utils/proveedoresVista'
import { fechaHoraEnCostaRica } from '../../utils/fechaCR'

/** El detalle enviado lee exclusivamente sus productos y cantidades guardados. */
export default function OrdenEnviadaDetalle({ proveedor, onVolver }) {
  const incierta = proveedor.estado_envio === 'incierto' || proveedor.estado_envio === 'enviando'
  return <div className="space-y-5">
    <Boton variante="fantasma" icono={ArrowLeft} onClick={onVolver} className="min-h-12">Volver a proveedores</Boton>
    <div className="rounded-2xl border border-neutro-200 bg-white p-5 sm:p-6 space-y-3">
      <h2 className="break-words text-2xl font-bold text-neutro-500 line-through">{proveedor.nombre}</h2>
      <Insignia tono={incierta ? 'alerta' : 'exito'} icono={incierta ? undefined : Check}>{incierta ? 'Envío por verificar' : 'Enviada'}</Insignia>
      {proveedor.enviada_en && <p className="text-sm text-neutro-500">{fechaHoraEnCostaRica(proveedor.enviada_en)}</p>}
    </div>
    <PanelSeccion titulo="Productos solicitados" cuerpoClassName="p-0">
      <div className="divide-y divide-neutro-100">
        {proveedor.productos_faltantes.map((producto, index) => {
          const facturacion = indicacionFacturacion(producto.facturacion)
          return <div key={producto.producto_id || index} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="break-words font-semibold text-neutro-500 line-through">{producto.nombre}</p>
              <p className="break-words text-sm text-neutro-500">Código: {producto.codigo}</p>
              {facturacion && <Insignia tono={facturacion.tono}>{facturacion.texto}</Insignia>}
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
