import { ChevronRight } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/pagos'
import Insignia from '../ui/Insignia'

/**
 * Una factura de proveedor en la lista.
 *
 * QUÉ SE ACHICÓ Y POR QUÉ
 * La versión anterior era una tarjeta de 200px: el número a `text-2xl`, una
 * rejilla de cuatro columnas con rótulos, y un botón de `px-8 py-4` que
 * repetía lo que hacer clic en la tarjeta ya hacía. Con cincuenta facturas
 * en pantalla eso son diez mil píxeles de scroll para encontrar una.
 *
 * Ahora es una fila: proveedor y número arriba, las tres cifras que
 * importan abajo, y el estado a la derecha. La tarjeta entera sigue siendo
 * el botón — por eso se fue el que había dentro.
 */
export default function TarjetaFactura({ factura, paso, onAbrir }) {
  const total = factura.productos?.length || 0
  const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO').length || 0
  const porcentaje = total > 0 ? Math.round((relacionados / total) * 100) : 0

  const estado = paso === 'PENDIENTE_RELACIONAR'
    ? {
        tono: porcentaje === 0 ? 'peligro' : porcentaje < 100 ? 'alerta' : 'exito',
        texto: `${porcentaje}% relacionada`
      }
    : paso === 'LISTAS_REVISION'
      ? { tono: 'exito', texto: 'Lista para revisar' }
      : { tono: 'neutro', texto: 'Registrada' }

  return (
    <button
      type="button"
      onClick={() => onAbrir(factura)}
      className="group flex w-full items-center gap-3 rounded-xl border border-neutro-200 bg-white p-3 text-left transition-all hover:border-primario-300 hover:shadow-md md:p-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="truncate font-bold text-neutro-900">{factura.proveedorNombre}</p>
          <span className="text-xs text-neutro-400">#{factura.numeroConsecutivo}</span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-bold text-neutro-900">{formatCurrency(factura.totalFactura)}</span>
          <span className="text-neutro-500">
            {total} {total === 1 ? 'producto' : 'productos'}
            {paso === 'PENDIENTE_RELACIONAR' && relacionados > 0 && (
              <span className="text-neutro-400"> · {relacionados} listos</span>
            )}
          </span>
          <span className="text-neutro-400">{formatDate(factura.fechaEmision)}</span>
        </div>
      </div>

      <Insignia tono={estado.tono} className="hidden sm:inline-flex">{estado.texto}</Insignia>
      <ChevronRight size={18} className="shrink-0 text-neutro-300 transition-colors group-hover:text-primario-600" />
    </button>
  )
}
