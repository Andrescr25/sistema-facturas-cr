import { useCallback, useEffect, useState } from 'react'
import { getPagosProveedores, actualizarPagoProveedor, getProveedoresConCuentas } from '../services/pagosProveedoresService'
import { useToast } from './useToast'

export const defaultFilters = {
  estado: 'pendiente',
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
    reload: () => loadCuentas(filters),
    toasts,
    removeToast
  }
}
