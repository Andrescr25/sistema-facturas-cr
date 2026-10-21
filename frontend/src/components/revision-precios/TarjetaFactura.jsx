import { ChevronRight, MoreVertical } from 'lucide-react'
import { formatCurrency, formatDate } from '../../utils/pagos'
import Insignia from '../ui/Insignia'
import { etiquetaDeAceptacion } from '../../utils/aceptacionCompraTexto'

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
export default function TarjetaFactura({ factura, paso, onAbrir, onProcesarGasto }) {
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
      // Ya registrada: cómo quedó ante Hacienda (la aceptación sale sola).
      : etiquetaDeAceptacion(factura.aceptacionHacienda)

  return (
    <div className="relative">
    <button
      type="button"
      onClick={() => onAbrir(factura)}
      className="group flex w-full items-center gap-3 rounded-xl border border-neutro-200 bg-white p-3 pr-14 text-left transition-all hover:border-primario-300 hover:shadow-md md:p-4 md:pr-14"
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
    {paso !== 'ENVIADAS' && onProcesarGasto && <details className="absolute right-2 top-2 z-10">
      <summary aria-label={`Opciones de factura ${factura.numeroConsecutivo}`} className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl text-neutro-500 hover:bg-neutro-100"><MoreVertical size={18} /></summary>
      <button type="button" onClick={() => onProcesarGasto(factura)} className="absolute right-0 mt-1 w-64 rounded-xl border border-neutro-200 bg-white p-3 text-left text-sm font-semibold text-neutro-700 shadow-lg hover:bg-neutro-50">Procesar factura como gasto operativo</button>
    </details>}
    </div>
  )
}
