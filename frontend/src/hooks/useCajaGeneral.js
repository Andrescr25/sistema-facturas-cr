import { useCallback, useEffect, useRef, useState } from 'react'
import { getMovimientosCaja } from '../services/cuentasPorCobrarService'
import { hoyEnCostaRica } from '../utils/fechaCR'

/** Misma consulta por período; una respuesta tardía no pisa el filtro nuevo. */
export function useCajaGeneral() {
  const hoy = hoyEnCostaRica()
  const inicioMes = `${hoy.slice(0, 8)}01`
  const [desde, setDesde] = useState(inicioMes)
  const [hasta, setHasta] = useState(hoy)
  const [sentido, setSentido] = useState('todos')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const peticion = useRef(0)
  const cargar = useCallback(async () => {
    const mia = ++peticion.current
    setCargando(true); setError('')
    try {
      const respuesta = await getMovimientosCaja({ desde, hasta })
      if (mia === peticion.current) setDatos(respuesta)
    } catch (err) {
      if (mia === peticion.current) {
        setError(err.response?.data?.message || err.message || 'No se pudieron cargar los movimientos')
        setDatos(null)
      }
    } finally { if (mia === peticion.current) setCargando(false) }
  }, [desde, hasta])
  useEffect(() => {
    const contador = peticion
    cargar()
    return () => { contador.current++ }
  }, [cargar])
  const movimientos = (datos?.movimientos || []).filter(m => sentido === 'todos' || m.sentido === sentido)
  return { hoy, inicioMes, desde, setDesde, hasta, setHasta, sentido, setSentido,
    datos, cargando, error, cargar, movimientos }
}
