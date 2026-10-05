import { useState, useEffect, useCallback, useRef } from 'react'
import { rutasService } from '../services/rutasService'
export function useRutas({ showToast }) {
  const [rutas, setRutas] = useState([]), [ciclos, setCiclos] = useState([])
  const [seleccion, setSeleccion] = useState(''), [ruta, setRuta] = useState(null)
  const [cargando, setCargando] = useState(false), [guardando, setGuardando] = useState(false)
  const [revision, setRevision] = useState(0), peticion = useRef(0)
  const refrescar = useCallback(async () => {
    const [rs, cs] = await Promise.all([rutasService.listar(), rutasService.ciclos()])
    setRutas(rs); setCiclos(cs); setRevision(n => n + 1)
  }, [])
  useEffect(() => { refrescar().catch(() => showToast('No se pudieron cargar las rutas', 'error')) }, [refrescar, showToast])
  useEffect(() => {
    const mia = ++peticion.current
    setRuta(null)
    if (!seleccion) { setCargando(false); return }
    setCargando(true)
    rutasService.obtener(seleccion).then(r => { if (mia === peticion.current) setRuta(r) })
      .catch(e => { if (mia === peticion.current) showToast(e.response?.data?.message || 'No se pudo cargar la ruta', 'error') })
      .finally(() => { if (mia === peticion.current) setCargando(false) })
  }, [seleccion, revision, showToast])
  const ejecutar = async (trabajo, mensaje) => {
    setGuardando(true)
    try {
      const r = await trabajo(); await refrescar(); if (mensaje) showToast(mensaje, 'success'); return r
    } catch (e) {
      showToast(e.response?.data?.message || 'No se pudo guardar. Intentá nuevamente.', 'error')
      if (e.response?.status === 409) await refrescar().catch(() => {})
      return null
    } finally { setGuardando(false) }
  }
  return { rutas, ciclos, seleccion, setSeleccion, ruta, cargando, guardando, refrescar, ejecutar }
}
