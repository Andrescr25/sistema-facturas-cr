import { useCallback, useEffect, useState } from 'react'
import { getCobrosDia } from '../services/cuentasPorCobrarService'
import { hoyEnCostaRica, sumarDias } from '../utils/fechaCR'

/**
 * Hook para el cuadre de caja diario: carga los cobros registrados en un día
 * específico, agrupados por método de pago. Separado de useCuentasPorCobrar
 * para que solo se cargue cuando el usuario abre la pestaña.
 */
export function useCuadreCaja() {
  const hoy = hoyEnCostaRica()
  const [fecha, setFecha] = useState(hoy)
  const [cobros, setCobros] = useState([])
  const [resumen, setResumen] = useState(null)
  const [cierre, setCierre] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const cargar = useCallback(async (fechaParam) => {
    const f = fechaParam || fecha
    try {
      setLoading(true)
      setError(null)
      const result = await getCobrosDia(f)

      if (result?.success === false) {
        setCobros([])
        setResumen(null)
      setCierre(null)
        setError(result.message || 'No se pudo cargar la información')
        return
      }

      setCobros(result?.cobros || [])
      setResumen(result?.resumen || null)
      setCierre(result?.cierre || null)
    } catch (err) {
      setCobros([])
      setResumen(null)
      setCierre(null)
      setError(err.message || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => {
    cargar(fecha)
  }, [fecha, cargar])

  const cambiarFecha = useCallback((nuevaFecha) => {
    setFecha(nuevaFecha)
  }, [])

  const irAHoy = useCallback(() => {
    setFecha(hoyEnCostaRica())
  }, [])

  // Ayer en Costa Rica. Con `toISOString()` (UTC), pasadas las 6 p.m. «ayer»
  // daba HOY: el cierre de ayer no se podía abrir de noche.
  const irAyer = useCallback(() => {
    setFecha(sumarDias(hoyEnCostaRica(), -1))
  }, [])

  return {
    fecha,
    cobros,
    resumen,
    loading,
    error,
    cambiarFecha,
    irAHoy,
    irAyer,
    cierre,
    recargar: () => cargar(fecha)
  }
}
