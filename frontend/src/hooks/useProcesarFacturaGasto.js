import { useState } from 'react'
import api from '../services/api'

export function useProcesarFacturaGasto(onProcesada) {
  const [factura, setFactura] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const abrir = f => { setError(''); setFactura(f) }
  const cerrar = () => { if (!guardando) setFactura(null) }
  const procesar = async datos => {
    if (!factura || guardando) return
    setGuardando(true); setError('')
    try {
      await api.post('/gastos-operativos/desde-factura', { facturaId: factura.id, ...datos })
      setFactura(null)
      onProcesada?.()
    } catch (e) { setError(e.response?.data?.message || 'No se pudo procesar la factura como gasto.') }
    finally { setGuardando(false) }
  }
  return { factura, abrir, cerrar, procesar, guardando, error }
}
