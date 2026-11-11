import { useState } from 'react'
import api from '../services/api'

/**
 * Volver a enviar una orden de compra ya enviada (2026-11-11), con o sin los
 * códigos/nombres del proveedor en el PDF. Al abrir trae el número del envío
 * original y los de la ficha; el servidor arma el PDF desde la orden guardada
 * y no la cambia (orders-whatsapp/reenvioOrden.service.js).
 */
export function useReenvioOrden(ordenId) {
  const [abierto, setAbierto] = useState(false)
  const [telefonos, setTelefonos] = useState([])
  const [telefono, setTelefono] = useState('')
  const [mensaje, setMensaje] = useState('')
  // Por omisión SIN los códigos del proveedor: para eso se reenvía.
  const [conCodigos, setConCodigos] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  const abrir = async () => {
    setAbierto(true); setError(''); setResultado(null); setConCodigos(false); setCargando(true)
    try {
      const { data } = await api.get(`/orden-compra/proveedor/ordenes/${ordenId}/reenvio`)
      setTelefono(data.data.telefono); setTelefonos(data.data.telefonos); setMensaje(data.data.mensaje)
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo preparar el reenvío.')
    } finally {
      setCargando(false)
    }
  }

  const reenviar = async () => {
    setEnviando(true); setError('')
    try {
      const { data } = await api.post(`/orden-compra/proveedor/ordenes/${ordenId}/reenviar`, { telefono, mensaje, preferirDatosProveedor: conCodigos })
      setResultado(data.data)
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo volver a enviar.')
    } finally {
      setEnviando(false)
    }
  }

  return {
    abierto, abrir, cerrar: () => setAbierto(false),
    telefonos, telefono, setTelefono, mensaje, conCodigos, setConCodigos,
    cargando, enviando, error, resultado, reenviar
  }
}
