import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { cuerpoEnvioProveedor, resultadoEnvioProveedor, intentoSeparadoDelProveedor } from '../utils/proveedoresVista'

const SIN_COMPRAS = []

/** Un clic envía las cantidades de esta interfaz. Conservar el cuerpo y la
 * clave antes de pedirlo permite consultar un resultado perdido sin duplicar
 * el mensaje, incluso después de recargar la pestaña. */
export function useEnvioOrdenProveedor({ proveedor, productos, preferirDatosProveedor, comprasEnviadas = SIN_COMPRAS, onEnviada, showToast }) {
  const { usuario } = useAuth()
  const claveStorage = proveedor ? `orden-proveedor:${usuario?.id}:${proveedor.proveedor_id || proveedor.cedula || proveedor.nombre}` : ''
  const [estado, setEstado] = useState('pendiente')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ocupado = useRef(false), seleccion = useRef(claveStorage), vivo = useRef(true)
  const leerIntento = storage => {
    const intento = JSON.parse(sessionStorage.getItem(storage) || 'null')
    if (!intentoSeparadoDelProveedor(intento, proveedor, comprasEnviadas)) return intento
    sessionStorage.setItem(`${storage}:historial:${intento.cuerpo.clave}`, JSON.stringify(intento))
    sessionStorage.removeItem(storage)
    return null
  }
  seleccion.current = claveStorage
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  useEffect(() => {
    setError('')
    try {
      const intento = claveStorage && leerIntento(claveStorage)
      setEstado(intento?.estado || (intento ? 'por_verificar' : 'pendiente'))
    } catch { setEstado('por_verificar') }
  }, [claveStorage, proveedor?.revisionReporte, comprasEnviadas])

  const enviar = async () => {
    if (ocupado.current || !proveedor || estado === 'incierto' || estado === 'confirmado') return
    ocupado.current = true; setEnviando(true); setError('')
    const storage = claveStorage
    const actual = () => vivo.current && seleccion.current === storage
    let intentoAnterior = true, iniciado = false
    try {
      let intento
      try { intento = leerIntento(storage) }
      catch { throw new Error('No se pudo recuperar el envío anterior. Consultá su resultado antes de volver a enviar.') }
      intentoAnterior = Boolean(intento)
      if (!intento) intento = { cuerpo: { ...cuerpoEnvioProveedor(proveedor, typeof productos === 'function' ? productos() : productos, preferirDatosProveedor), clave: crypto.randomUUID() }, estado: 'por_verificar' }
      // Si no puede conservarse, no se inicia un envío que perdería su clave al recargar.
      sessionStorage.setItem(storage, JSON.stringify(intento))
      iniciado = true
      const { data } = await api.post('/orden-compra/proveedor/enviar', intento.cuerpo)
      if (!data.success) throw new Error(data.message || 'No se pudo consultar el envío.')
      const resultado = resultadoEnvioProveedor(data.data)
      if (resultado === 'confirmado') {
        sessionStorage.removeItem(storage)
        if (actual()) setEstado('confirmado')
        showToast('PDF enviado a WhatsApp.', 'success')
        await onEnviada(proveedor.nombre)
      } else if (resultado === 'no_enviado') {
        // El servidor comprobó que el transporte no se inició. Reintentar
        // será otra acción explícita y conservará la revisión de cantidades.
        sessionStorage.removeItem(storage)
        if (actual()) setEstado('pendiente')
        showToast('No se inició el envío. Podés reintentar.', 'warning')
      } else {
        intento.estado = resultado === 'incierto' ? 'incierto' : 'por_verificar'
        intento.ordenId = data.data.orden?.id || null
        sessionStorage.setItem(storage, JSON.stringify(intento))
        if (actual()) setEstado(intento.estado)
        showToast('El envío está por verificar. No vuelvas a enviarlo al proveedor.', 'warning')
        await onEnviada(resultado === 'incierto' ? proveedor.nombre : undefined)
      }
    } catch (e) {
      // Rechazos de validación ocurren antes del transporte. Una pérdida de
      // respuesta conserva la misma clave y las mismas cantidades.
      const status = e.response?.status
      if (status === 400 || status === 409 || status === 422 || (!iniciado && !intentoAnterior)) {
        sessionStorage.removeItem(storage)
        if (actual()) setEstado('pendiente')
      } else if (actual()) setEstado('por_verificar')
      if (actual()) setError(e.response?.data?.message || e.message || 'No se pudo conocer el resultado del envío. Consultá con la misma solicitud.')
    } finally {
      ocupado.current = false
      if (vivo.current) setEnviando(false)
    }
  }
  return { enviar, enviando, estado, error }
}
