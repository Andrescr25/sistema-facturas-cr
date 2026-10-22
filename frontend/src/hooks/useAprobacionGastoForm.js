import { useState } from 'react'
import { useOpcionesPago } from './useOpcionesPago'

export function useAprobacionGastoForm() {
  const { metodos, error } = useOpcionesPago()
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [claveIdempotencia] = useState(() => crypto.randomUUID())
  const metodo = metodos.find(m => m.id === Number(metodoPagoId))
  return { metodos, error, metodo, metodoPagoId, setMetodoPagoId, motivo, setMotivo,
    datos: { metodoPagoId: Number(metodoPagoId), motivo: motivo.trim() || null, claveIdempotencia } }
}
