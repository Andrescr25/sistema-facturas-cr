import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import Boton from '../ui/Boton'
import { alegraService } from '../../services/alegraService'

/**
 * Acciones de mantenimiento que borran datos. Es lo mismo que tenía la
 * pantalla vieja; solo cambia el aviso del resultado, que pasó de un alert a
 * la notificación del sistema.
 */
export default function Mantenimiento({ showToast }) {
  const [limpiando, setLimpiando] = useState(false)

  const limpiarFaltantes = async () => {
    const seguro = window.confirm(
      '¿Limpiar la base de FALTANTES?\n\n' +
      'Borra todos los faltantes pendientes y procesados, y los ajustes y observaciones temporales.\n\n' +
      'Úsela solo después de haber procesado los pedidos de la semana.'
    )
    if (!seguro) return

    setLimpiando(true)
    try {
      const r = await alegraService.limpiarFaltantesProveedor()
      showToast(
        `Limpieza hecha: ${r.datos_borrados || 0} pendientes, ${r.procesados_borrados || 0} procesados, ` +
        `${r.ajustes_eliminados || 0} ajustes y ${r.facturas_pendientes_eliminadas || 0} facturas liberadas.`,
        'success',
        8000
      )
    } catch (error) {
      showToast(`No se pudo limpiar: ${error.message}`, 'error')
    } finally {
      setLimpiando(false)
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutro-900">Mantenimiento</h2>
        <p className="text-sm text-neutro-500">Acciones que borran datos. Úselas con cuidado.</p>
      </div>
      <div className="rounded-2xl border border-peligro-200 bg-peligro-50 p-4 sm:p-6">
        <h3 className="font-bold text-peligro-800">Limpieza manual de faltantes</h3>
        <p className="mt-1 text-sm text-peligro-700">
          Hace la misma limpieza automática de los domingos a las 23:59. Sirve para reiniciar el ciclo de pedidos a mano, por ejemplo un lunes en la mañana.
        </p>
        <Boton variante="peligro" className="mt-4" onClick={limpiarFaltantes} cargando={limpiando}>
          <Trash2 size={16} /> Limpiar faltantes ahora
        </Boton>
      </div>
    </section>
  )
}
