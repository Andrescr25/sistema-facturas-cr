import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useContextoConsulta } from './useContextoConsulta'

/** La selección pertenece a esta factura. Nunca reutilizar la orden del
 * proveedor anterior si su respuesta llega al abrir otra revisión. */
export function useOrdenCompraRevision(factura) {
  const [ordenes, setOrdenes] = useState([])
  const [ordenId, setOrdenId] = useState('')
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(false)
  const lectura = useContextoConsulta(factura?.id || '')
  const { esActual, confirmar } = lectura
  const consulta = useRef(0)

  const cargar = useCallback(async () => {
    const propia = ++consulta.current
    if (!factura?.id || factura.estado === 'ENVIADA') return
    setCargando(true)
    setError(null)
    try {
      const { data } = await api.get(`/revision-precios/facturas/${factura.id}/ordenes-compra`)
      if (!esActual() || propia !== consulta.current) return
      if (!data.success) throw new Error(data.message || data.error || 'No se pudo consultar la orden de compra')
      setOrdenes(data.data.ordenes)
      setOrdenId(data.data.vinculada || data.data.automatica || '')
      confirmar()
    } catch (err) {
      if (esActual() && propia === consulta.current) setError(err.response?.data?.message || err.message)
    } finally {
      if (esActual() && propia === consulta.current) setCargando(false)
    }
  }, [factura?.id, factura?.estado, esActual, confirmar])

  useEffect(() => {
    setOrdenes([])
    setOrdenId('')
    setError(null)
    cargar()
  }, [cargar])

  const vigente = lectura.vigente || factura?.estado === 'ENVIADA'
  return { ordenes: vigente ? ordenes : [], ordenId: vigente ? ordenId : '', setOrdenId,
    seleccionExplicita: vigente && ordenes.length > 1,
    cargando: Boolean(factura?.id && factura.estado !== 'ENVIADA' && (!vigente && !error || cargando)),
    error, cargar, bloqueada: Boolean(factura?.id && factura.estado !== 'ENVIADA' && (!vigente || cargando || error || ordenes.length > 1 && !ordenId)) }
}
