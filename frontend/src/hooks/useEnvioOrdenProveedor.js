import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { cuerpoEnvioProveedor, resultadoEnvioProveedor, intentoSeparadoDelProveedor } from '../utils/proveedoresVista'

const SIN_COMPRAS = []

/** Preparar muestra el destino exacto sin transportar. Sólo confirmar conserva
 * el cuerpo y la clave antes del envío; una respuesta perdida se consulta con
 * esa misma solicitud, incluso después de recargar la pestaña. */
export function useEnvioOrdenProveedor({ proveedor, productos, preferirDatosProveedor, comprasEnviadas = SIN_COMPRAS, activo = true, onEnviada, showToast }) {
  const { usuario } = useAuth()
  const claveStorage = proveedor ? `orden-proveedor:${usuario?.id}:${proveedor.proveedor_id || proveedor.cedula || proveedor.nombre}` : ''
  const contexto = JSON.stringify([claveStorage, proveedor?.revisionReporte, proveedor?.fechaInicio, activo])
  const [estado, setEstado] = useState('pendiente')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [modal, setModal] = useState(null)
  const ocupado = useRef(false), seleccion = useRef(contexto), vivo = useRef(true), revision = useRef(null)
  const leerIntento = storage => {
    const intento = JSON.parse(sessionStorage.getItem(storage) || 'null')
    if (!intentoSeparadoDelProveedor(intento, proveedor, comprasEnviadas)) return intento
    sessionStorage.setItem(`${storage}:historial:${intento.cuerpo.clave}`, JSON.stringify(intento))
    sessionStorage.removeItem(storage)
    return null
  }
  seleccion.current = contexto
  useEffect(() => { vivo.current = true; return () => { vivo.current = false } }, [])
  useEffect(() => { revision.current = null; setModal(null) }, [contexto])
  useEffect(() => {
    setError('')
    try {
      const intento = claveStorage && leerIntento(claveStorage)
      setEstado(intento?.estado || (intento ? 'por_verificar' : 'pendiente'))
    } catch { setEstado('por_verificar') }
  }, [claveStorage, proveedor?.revisionReporte, comprasEnviadas])

  const cerrarModal = () => {
    if (ocupado.current) return
    revision.current = null
    setModal(null)
  }

  const preparar = async copia => {
    if (copia.preparando) return
    copia.preparando = true
    const actual = () => vivo.current && seleccion.current === copia.contexto && revision.current === copia
    copia.lista = false
    setModal({ nombre: copia.nombre, cargando: true })
    try {
      const { data } = await api.post('/orden-compra/proveedor/revisar-envio', copia.cuerpo)
      if (!data.success) throw new Error(data.message || 'No se pudo preparar la revisión del envío.')
      const destino = data.data?.destino
      if (!destino?.telefono || typeof destino.mensaje !== 'string' || !destino.mensaje.trim()) throw new Error('No se pudo comprobar el número y el mensaje. Volvé a revisar el envío.')
      if (!actual()) return
      copia.lista = true
      setModal({ nombre: copia.nombre, destino, cargando: false })
    } catch (e) {
      if (actual()) setModal({ nombre: copia.nombre, cargando: false, error: e.response?.data?.message || e.message || 'No se pudo preparar la revisión del envío.' })
    } finally { copia.preparando = false }
  }

  const enviarIntento = async (intento, storage, nombre, contextoIntento, esNuevo = false) => {
    if (ocupado.current) return
    ocupado.current = true; setEnviando(true); setError('')
    const actual = () => vivo.current && seleccion.current === contextoIntento
    let iniciado = false
    try {
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
        await onEnviada(nombre)
      } else if (resultado === 'no_enviado') {
        // El servidor comprobó que el transporte no se inició. Reintentar
        // será otra acción explícita, con revisión del destino y una clave nueva.
        sessionStorage.removeItem(storage)
        if (actual()) setEstado('pendiente')
        showToast('No se inició el envío. Podés reintentar.', 'warning')
      } else {
        intento.estado = resultado === 'incierto' ? 'incierto' : 'por_verificar'
        intento.ordenId = data.data.orden?.id || null
        sessionStorage.setItem(storage, JSON.stringify(intento))
        if (actual()) setEstado(intento.estado)
        showToast('El envío está por verificar. No vuelvas a enviarlo al proveedor.', 'warning')
        await onEnviada(resultado === 'incierto' ? nombre : undefined)
      }
    } catch (e) {
      // Rechazos de validación ocurren antes del transporte. Una pérdida de
      // respuesta conserva la misma clave y las mismas cantidades.
      const status = e.response?.status
      if (status === 400 || status === 409 || status === 422 || (!iniciado && esNuevo)) {
        sessionStorage.removeItem(storage)
        if (actual()) setEstado('pendiente')
      } else if (actual()) setEstado('por_verificar')
      if (actual()) setError(e.response?.data?.message || e.message || 'No se pudo conocer el resultado del envío. Consultá con la misma solicitud.')
    } finally {
      ocupado.current = false
      if (vivo.current) setEnviando(false)
      if (actual()) { revision.current = null; setModal(null) }
    }
  }

  const enviar = async () => {
    if (ocupado.current || revision.current || !activo || !proveedor || estado === 'incierto' || estado === 'confirmado') return
    setError('')
    try {
      let intento
      try { intento = leerIntento(claveStorage) }
      catch { throw new Error('No se pudo recuperar el envío anterior. Consultá su resultado antes de volver a enviar.') }
      if (intento) return await enviarIntento(intento, claveStorage, proveedor.nombre, contexto)
      const cuerpo = structuredClone({ ...cuerpoEnvioProveedor(proveedor, typeof productos === 'function' ? productos() : productos, preferirDatosProveedor), clave: crypto.randomUUID() })
      const copia = { cuerpo, storage: claveStorage, contexto, nombre: proveedor.nombre }
      revision.current = copia
      await preparar(copia)
    } catch (e) {
      setError(e.message || 'No se pudo revisar el envío.')
    }
  }

  const reintentarRevision = () => {
    const copia = revision.current
    if (copia && !modal?.cargando && !ocupado.current) return preparar(copia)
  }

  const confirmarEnvio = () => {
    const copia = revision.current
    if (!copia?.lista || ocupado.current) return
    if (seleccion.current !== copia.contexto) { cerrarModal(); return }
    return enviarIntento({ cuerpo: copia.cuerpo, estado: 'por_verificar' }, copia.storage, copia.nombre, copia.contexto, true)
  }

  return { enviar, enviando, estado, error, modal, cerrarModal, reintentarRevision, confirmarEnvio }
}
