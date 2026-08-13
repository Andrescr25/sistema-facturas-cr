import { useCallback, useEffect, useState } from 'react'
import { getCobrosDia } from '../services/cuentasPorCobrarService'

/**
 * Hook para el cuadre de caja diario: carga los cobros registrados en un día
 * específico, agrupados por método de pago. Separado de useCuentasPorCobrar
 * para que solo se cargue cuando el usuario abre la pestaña.
 */
export function useCuadreCaja() {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [cobros, setCobros] = useState([])
  const [resumen, setResumen] = useState(null)
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
        setError(result.message || 'No se pudo cargar la información')
        return
      }

      setCobros(result?.cobros || [])
      setResumen(result?.resumen || null)
    } catch (err) {
      setCobros([])
      setResumen(null)
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
    setFecha(new Date().toISOString().slice(0, 10))
  }, [])

  const irAyer = useCallback(() => {
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    setFecha(ayer.toISOString().slice(0, 10))
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
    recargar: () => cargar(fecha)
  }
}
