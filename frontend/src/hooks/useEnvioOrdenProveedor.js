import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { cuerpoEnvioProveedor, resultadoEnvioProveedor, intentoSeparadoDelProveedor } from '../utils/proveedoresVista'
import { revisarTelefonoProveedor } from '../utils/telefonosProveedor'

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
    const mostrar = extra => ({ nombre: copia.nombre, telefono: copia.telefono || '', telefonos: copia.telefonos || [], mensaje: copia.mensaje, ...extra })
    setModal(mostrar({ cargando: true }))
    try {
      const { data } = await api.post('/orden-compra/proveedor/revisar-envio', copia.cuerpo)
      if (!data.success) throw new Error(data.message || 'No se pudo preparar la revisión del envío.')
      const destino = data.data?.destino
      const pendienteDestino = data.data?.envioEstado === 'pendiente_destino'
      if ((!destino?.telefono && !pendienteDestino) || typeof destino?.mensaje !== 'string' || !destino.mensaje.trim()) throw new Error('No se pudo comprobar el número y el mensaje. Volvé a revisar el envío.')
      if (!actual()) return
      copia.telefono = destino.telefono || ''
      copia.telefonos = Array.isArray(destino.telefonos) ? destino.telefonos : []
      copia.mensaje = destino.mensaje
      copia.lista = !pendienteDestino && Boolean(destino.telefono)
      copia.requiereTelefono = pendienteDestino
      setModal(mostrar({ destino, cargando: false, requiereRevision: !copia.lista }))
    } catch (e) {
      if (actual()) setModal(mostrar({ cargando: false, error: e.response?.data?.message || e.message || 'No se pudo preparar la revisión del envío.' }))
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
    let copia
    try {
      let intento
      try { intento = leerIntento(claveStorage) }
      catch { throw new Error('No se pudo recuperar el envío anterior. Consultá su resultado antes de volver a enviar.') }
      if (intento) return await enviarIntento(intento, claveStorage, proveedor.nombre, contexto)
      const cuerpo = structuredClone({ ...cuerpoEnvioProveedor(proveedor, typeof productos === 'function' ? productos() : productos, preferirDatosProveedor), clave: crypto.randomUUID() })
      copia = { cuerpo, storage: claveStorage, contexto, nombre: proveedor.nombre }
      revision.current = copia
      // Los contactos llegan antes de calcular el pedido/PDF. No esperar el
      // bloqueo de compras para que la persona pueda ver o cambiar el número.
      setModal({ nombre:copia.nombre,cargando:true })
      const { data } = await api.get('/orden-compra/proveedor/contactos', { params:{proveedorId:proveedor.proveedor_id,cedula:proveedor.cedula,nombre:proveedor.nombre} })
      if (!vivo.current || seleccion.current !== copia.contexto || revision.current !== copia) return
      if (!data.success || typeof data.data?.mensaje !== 'string') throw new Error(data.message || 'No se pudieron consultar los contactos del proveedor.')
      copia.telefono = data.data.telefono || ''
      copia.telefonos = data.data.telefonos || []
      copia.mensaje = data.data.mensaje
      if (copia.telefono) await preparar(copia)
      else {
        copia.requiereTelefono = true
        setModal({nombre:copia.nombre,telefono:'',telefonos:copia.telefonos,mensaje:copia.mensaje,cargando:false,requiereRevision:true})
      }
    } catch (e) {
      if (vivo.current && seleccion.current === contexto && (!copia || revision.current === copia)) {
        setError(e.response?.data?.message || e.message || 'No se pudo revisar el envío.')
        revision.current = null; setModal(null)
      }
    }
  }

  const reintentarRevision = () => {
    const copia = revision.current
    if (!copia || copia.preparando || ocupado.current) return
    if (copia.cambioTelefono || copia.requiereTelefono) {
      const telefono = revisarTelefonoProveedor(copia.telefono)
      if (telefono.error) {
        setModal(prev => ({ ...prev, error: telefono.error, requiereRevision: true }))
        return
      }
      // Esta clave todavía no se preparó. Una revisión fallida se reintenta
      // con su mismo cuerpo; otra edición genera una copia independiente.
      copia.cuerpo.telefono = telefono.numero
      copia.cambioTelefono = false
      copia.requiereTelefono = false
    }
    return preparar(copia)
  }

  const cambiarTelefono = telefono => {
    const anterior = revision.current
    if (!anterior || ocupado.current) return
    const copia = { ...anterior, cuerpo: structuredClone({ ...anterior.cuerpo, clave: crypto.randomUUID(), telefono }),
      telefono, lista: false, preparando: false, cambioTelefono: true }
    // Reemplazar la copia también descarta una respuesta tardía del número
    // anterior. Nunca editar una solicitud confirmada o por verificar.
    revision.current = copia
    setModal({ nombre: copia.nombre, telefono, telefonos: copia.telefonos || [], mensaje: copia.mensaje, cargando: false, requiereRevision: true })
  }

  const confirmarEnvio = () => {
    const copia = revision.current
    if (!copia?.lista || ocupado.current) return
    if (seleccion.current !== copia.contexto) { cerrarModal(); return }
    return enviarIntento({ cuerpo: copia.cuerpo, estado: 'por_verificar' }, copia.storage, copia.nombre, copia.contexto, true)
  }

  return { enviar, enviando, estado, error, modal, cerrarModal, reintentarRevision, confirmarEnvio, cambiarTelefono }
}
