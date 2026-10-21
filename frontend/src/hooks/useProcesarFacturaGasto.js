import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { puedeVer } from '../utils/modulos'

export function useProcesarFacturaGasto(onProcesada) {
  const navigate = useNavigate()
  const { usuario } = useAuth()
  const [factura, setFactura] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const abrir = f => { setError(''); setFactura(f) }
  const cerrar = () => { if (!guardando) setFactura(null) }
  const procesar = async datos => {
    if (!factura || guardando) return
    setGuardando(true); setError('')
    try {
      const { data } = await api.post('/gastos-operativos/desde-factura', { facturaId: factura.id, ...datos })
      setFactura(null)
      onProcesada?.()
      if (puedeVer(usuario, '/gastos-operativos')) navigate(`/gastos-operativos?gasto=${data.data.id}`)
    } catch (e) { setError(e.response?.data?.message || 'No se pudo procesar la factura como gasto.') }
    finally { setGuardando(false) }
  }
  return { factura, abrir, cerrar, procesar, guardando, error }
}
