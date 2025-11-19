import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPagosProveedores, actualizarPagoProveedor } from '../services/pagosProveedoresService'

const defaultFilters = {
  estado: 'pendiente',
  proveedor: 'todos',
  dias: 'todos',
  search: ''
}

export function usePagosProveedores(initialFilters = {}) {
  const [filters, setFilters] = useState({ ...defaultFilters, ...initialFilters })
  const [cuentas, setCuentas] = useState([])
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

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

  const proveedoresDisponibles = useMemo(() => {
    const set = new Map()
    cuentas.forEach((cuenta) => {
      if (!set.has(cuenta.proveedorCedula)) {
        set.set(cuenta.proveedorCedula, cuenta.proveedorNombre)
      }
    })
    return Array.from(set, ([cedula, nombre]) => ({ cedula, nombre }))
  }, [cuentas])

  const handleActualizarEstado = useCallback(async (id, payload) => {
    await actualizarPagoProveedor(id, payload)
    await loadCuentas(filters)
  }, [filters, loadCuentas])

  return {
    cuentas,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    proveedoresDisponibles,
    actualizarEstado: handleActualizarEstado,
    reload: () => loadCuentas(filters)
  }
}

