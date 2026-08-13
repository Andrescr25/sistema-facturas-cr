import { useCallback, useEffect, useState } from 'react'
import { getCuentasPorCobrar, getAbonosFactura, registrarAbono, sincronizarCuentasPorCobrar } from '../services/cuentasPorCobrarService'
import { useToast } from './useToast'
import { useDialog } from './useDialog'

export const defaultFilters = {
  estado: 'todos',
  dias: 'todos',
  search: ''
}

/**
 * Estado y lógica de negocio de Cuentas por Cobrar. Sigue el patrón de
 * usePagosProveedores.js (su módulo hermano de cuentas por pagar), con la
 * diferencia de que el backend ya agrupa por cliente — este hook no arma
 * esa agrupación en el frontend.
 */
export function useCuentasPorCobrar(initialFilters = {}) {
  const { toasts, showToast, removeToast } = useToast()
  const { confirm, dialogProps } = useDialog()

  const [filters, setFilters] = useState({ ...defaultFilters, ...initialFilters })
  const [clientes, setClientes] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [registrandoAbono, setRegistrandoAbono] = useState(false)

  const loadCuentas = useCallback(async (overrideFilters) => {
    const params = overrideFilters || filters
    try {
      setLoading(true)
      setError(null)
      const result = await getCuentasPorCobrar(params)

      if (result?.success === false) {
        setClientes([])
        setResumen(null)
        setError(result.message || 'No se pudo cargar la información')
        return
      }

      setClientes(result?.data || [])
      setResumen(result?.resumen || null)
    } catch (err) {
      setClientes([])
      setResumen(null)
      setError(err.message || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadCuentas(filters)
  }, [filters, loadCuentas])

  const resetFilters = useCallback(() => {
    setFilters({ ...defaultFilters })
  }, [])

  const handleSincronizar = useCallback(async () => {
    setSincronizando(true)
    try {
      await sincronizarCuentasPorCobrar()
      await loadCuentas(filters)
      showToast('Cuentas por cobrar actualizadas desde Alegra', 'success')
    } catch (err) {
      showToast(err.message || 'Error sincronizando con Alegra', 'error')
    } finally {
      setSincronizando(false)
    }
  }, [filters, loadCuentas, showToast])

  const handleCargarAbonos = useCallback(async (alegraInvoiceId) => {
    try {
      const result = await getAbonosFactura(alegraInvoiceId)
      return result?.data || []
    } catch (err) {
      showToast(err.message || 'Error cargando el historial de abonos', 'error')
      return []
    }
  }, [showToast])

  const handleRegistrarAbono = useCallback(async ({ alegraInvoiceId, numeroFactura, monto, fecha, metodoPago, saldarTotal = false }) => {
    // Al saldar total el monto lo decide el backend con el saldo que Alegra
    // reporta en ese momento, así que la confirmación dice lo que va a pasar
    // en vez de un número que puede quedar viejo.
    const confirmado = await confirm(
      saldarTotal
        ? `¿Saldar por completo la factura #${numeroFactura}? Se pagará el saldo pendiente que tenga en Alegra (aprox. ₡${Number(monto).toLocaleString('es-CR')}) y quedará en cero. Esto crea un pago real en Alegra.`
        : `¿Registrar un abono de ₡${Number(monto).toLocaleString('es-CR')} sobre la factura #${numeroFactura}? Esto crea un pago real en Alegra.`,
      { title: saldarTotal ? 'Saldar factura completa' : 'Confirmar abono',
        confirmLabel: saldarTotal ? 'Saldar completa' : 'Registrar abono' }
    )
    if (!confirmado) return false

    setRegistrandoAbono(true)
    try {
      await registrarAbono({ alegraInvoiceId, monto, fecha, metodoPago, saldarTotal })
      await loadCuentas(filters)
      showToast(saldarTotal ? 'Factura saldada por completo' : 'Abono registrado correctamente', 'success')
      return true
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Error registrando el abono', 'error')
      return false
    } finally {
      setRegistrandoAbono(false)
    }
  }, [confirm, filters, loadCuentas, showToast])

  return {
    clientes,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    sincronizando,
    handleSincronizar,
    handleCargarAbonos,
    registrandoAbono,
    handleRegistrarAbono,
    reload: () => loadCuentas(filters),
    dialogProps,
    toasts,
    removeToast
  }
}
