import { useCallback, useEffect, useState } from 'react'
import {
  getPagosProveedores,
  actualizarPagoProveedor,
  getProveedoresConCuentas,
  getSaldosAFavor,
  aplicarNotaACuenta,
  eliminarNotaCredito
} from '../services/pagosProveedoresService'
import { formatCurrency } from '../utils/pagosProveedoresUtils'
import { useToast } from './useToast'

/**
 * La pantalla abre en "Todos", que desde el cambio del filtro quiere decir
 * todo lo que queda por pagar: pendientes y vencidas juntas.
 *
 * Antes abría en "Pendientes" y las vencidas —las urgentes, las que ya se
 * pasaron de fecha— quedaban fuera de la primera pantalla. Justo al revés
 * de lo que uno viene a ver.
 */
export const defaultFilters = {
  estado: 'todos',
  proveedor: 'todos',
  dias: 'todos',
  search: ''
}

export function usePagosProveedores(initialFilters = {}) {
  const { toasts, showToast, removeToast } = useToast()

  const [filters, setFilters] = useState({ ...defaultFilters, ...initialFilters })
  const [cuentas, setCuentas] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState([])
  const [procesandoId, setProcesandoId] = useState(null)

  const loadCuentas = useCallback(async (overrideFilters) => {
    const params = overrideFilters || filters
    try {
      setLoading(true)
      setError(null)
      const result = await getPagosProveedores(params)

      if (result?.success === false) {
        setCuentas([])
        setResumen(null)
        setError(result.message || 'No se pudo cargar la información')
        return
      }

      setCuentas(result?.data || [])
      setResumen(result?.resumen || null)
    } catch (err) {
      setCuentas([])
      setResumen(null)
      setError(err.message || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadCuentas(filters)
  }, [filters, loadCuentas])

  // Lista de proveedores independiente de los filtros activos (antes se derivaba
  // de `cuentas`, así que al filtrar por estado/fecha el dropdown perdía opciones).
  // Viene de /pagos-proveedores/proveedores (solo proveedores con al menos una
  // cuenta por pagar registrada) — no del maestro completo de /proveedores,
  // que traía también proveedores sin ninguna cuenta en el sistema.
  useEffect(() => {
    let cancelado = false
    getProveedoresConCuentas()
      .then((result) => {
        if (cancelado) return
        if (result?.success) {
          setProveedoresDisponibles(result.data || [])
        }
      })
      .catch(() => {
        // Silencioso: si falla, el filtro de proveedor simplemente queda vacío,
        // no bloquea el resto de la página.
      })
    return () => { cancelado = true }
  }, [])

  const resetFilters = useCallback(() => {
    setFilters({ ...defaultFilters })
  }, [])

  const handleActualizarEstado = useCallback(async (id, payload, mensajeExito) => {
    setProcesandoId(id)
    try {
      await actualizarPagoProveedor(id, payload)
      await loadCuentas(filters)
      showToast(mensajeExito || 'Cuenta actualizada correctamente', 'success')
      return true
    } catch (err) {
      showToast(err.message || 'Error actualizando la cuenta', 'error')
      return false
    } finally {
      setProcesandoId(null)
    }
  }, [filters, loadCuentas, showToast])

  // --- Saldos a favor (notas de crédito sin aplicar) ---

  const [saldosAFavor, setSaldosAFavor] = useState([])
  const [totalAFavor, setTotalAFavor] = useState(0)
  const [loadingFavor, setLoadingFavor] = useState(false)
  const [eliminandoNota, setEliminandoNota] = useState(null)

  const cargarSaldosAFavor = useCallback(async () => {
    setLoadingFavor(true)
    try {
      const data = await getSaldosAFavor()
      if (data.success) {
        setSaldosAFavor(data.data || [])
        setTotalAFavor(data.total || 0)
      }
    } catch (err) {
      console.error('Error cargando saldos a favor:', err)
    } finally {
      setLoadingFavor(false)
    }
  }, [])

  useEffect(() => { cargarSaldosAFavor() }, [cargarSaldosAFavor])

  const handleAplicarNota = useCallback(async (nota, cuenta) => {
    try {
      const data = await aplicarNotaACuenta(nota.id, cuenta.id)
      if (data.success) {
        showToast(
          `Aplicado ${formatCurrency(data.aplicado)} a ${data.facturaConsecutivo}` +
          (data.quedaAFavor > 0 ? ` · quedan ${formatCurrency(data.quedaAFavor)} a favor` : ''),
          'success'
        )
        await cargarSaldosAFavor()
        await loadCuentas(filters)
        return true
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Error aplicando la nota de crédito', 'error')
    }
    return false
  }, [cargarSaldosAFavor, loadCuentas, filters, showToast])

  const handleEliminarNota = useCallback(async (nota) => {
    setEliminandoNota(nota.id)
    try {
      const data = await eliminarNotaCredito(nota.id)
      if (data.success) {
        // Si ya se había descontado de alguna factura, el borrado devuelve ese
        // saldo — hay que decirlo, o el monto de la factura "cambia solo".
        const devuelto = (data.revertidas || []).reduce((s, r) => s + r.devuelto, 0)
        showToast(
          devuelto > 0
            ? `Nota eliminada · se devolvieron ${formatCurrency(devuelto)} al saldo de la(s) factura(s)`
            : 'Nota de crédito eliminada',
          'success'
        )
        await cargarSaldosAFavor()
        await loadCuentas(filters)
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Error eliminando la nota de crédito', 'error')
    } finally {
      setEliminandoNota(null)
    }
  }, [cargarSaldosAFavor, loadCuentas, filters, showToast])

  return {
    cuentas,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    proveedoresDisponibles,
    actualizarEstado: handleActualizarEstado,
    procesandoId,
    reload: () => { loadCuentas(filters); cargarSaldosAFavor() },
    toasts,
    removeToast,

    saldosAFavor,
    totalAFavor,
    loadingFavor,
    cargarSaldosAFavor,
    handleAplicarNota,
    handleEliminarNota,
    eliminandoNota
  }
}
