import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCuentasPorCobrar, getAbonosFactura, getProductosFactura, registrarAbono } from '../services/cuentasPorCobrarService'
import { filtrarDeudores, resumenDeudores } from '../utils/filtrosCobros'
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
  // La cartera entera; lo que ve la pantalla es `clientes`, ya filtrado.
  const [cartera, setCartera] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [actualizando, setActualizando] = useState(false)
  const [registrandoAbono, setRegistrandoAbono] = useState(false)

  // Los filtros ya no viajan al servidor (ver utils/filtrosCobros.js): se
  // carga la cartera una vez y cambiar un filtro no vuelve a pedir nada.
  const loadCuentas = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getCuentasPorCobrar()

      if (result?.success === false) {
        setCartera([])
        setError(result.message || 'No se pudo cargar la información')
        return
      }

      setCartera(result?.data || [])
    } catch (err) {
      setCartera([])
      setError(err.message || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCuentas()
  }, [loadCuentas])

  const clientes = useMemo(() => filtrarDeudores(cartera, filters), [cartera, filters])
  const resumen = useMemo(() => (cartera.length ? resumenDeudores(cartera) : null), [cartera])

  const resetFilters = useCallback(() => {
    setFilters({ ...defaultFilters })
  }, [])

  /**
   * Volver a leer los saldos. Antes esto pedía una sincronización con Alegra y
   * esperaba a que bajara la cartera entera; ahora los saldos salen de nuestra
   * base y se calculan al momento, así que basta con releer.
   */
  const handleActualizar = useCallback(async () => {
    setActualizando(true)
    try {
      await loadCuentas()
    } finally {
      setActualizando(false)
    }
  }, [loadCuentas])

  const handleCargarAbonos = useCallback(async (facturaId) => {
    try {
      const result = await getAbonosFactura(facturaId)
      return result?.data || []
    } catch (err) {
      showToast(err.message || 'Error cargando el historial de abonos', 'error')
      return []
    }
  }, [showToast])

  /**
   * Las líneas de la factura, para el detalle del modal.
   *
   * Falla en silencio devolviendo una lista vacía: el detalle es contexto,
   * no un requisito para cobrar. Si no carga, la tabla dice que no hay
   * detalle y el abono se registra igual.
   */
  const handleCargarProductos = useCallback(async (facturaId) => {
    try {
      const result = await getProductosFactura(facturaId)
      return result?.data || []
    } catch (err) {
      console.error('No se pudo cargar el detalle de la factura:', err.message)
      return []
    }
  }, [])

  const handleRegistrarAbono = useCallback(async ({ facturaId, numeroFactura, monto, fecha, metodoPagoId, referencia, saldarTotal = false }) => {
    // Al saldar total el monto lo decide el backend con el saldo que relee
    // en ese momento (con bloqueo), así que la confirmación dice lo que va a
    // pasar en vez de un número que puede quedar viejo. Decía "esto crea un
    // pago real en Alegra": en esta rama el cobro es propio y no toca Alegra.
    const confirmado = await confirm(
      saldarTotal
        ? `¿Saldar por completo la factura #${numeroFactura}? Se cobrará el saldo pendiente que tenga en este momento (aprox. ₡${Number(monto).toLocaleString('es-CR')}) y quedará en cero.`
        : `¿Registrar un abono de ₡${Number(monto).toLocaleString('es-CR')} sobre la factura #${numeroFactura}?`,
      { title: saldarTotal ? 'Saldar factura completa' : 'Confirmar abono',
        confirmLabel: saldarTotal ? 'Saldar completa' : 'Registrar abono' }
    )
    if (!confirmado) return false

    setRegistrandoAbono(true)
    try {
      await registrarAbono({ facturaId, monto, fecha, metodoPagoId, referencia, saldarTotal })
      await loadCuentas()
      showToast(saldarTotal ? 'Factura saldada por completo' : 'Abono registrado correctamente', 'success')
      return true
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Error registrando el abono', 'error')
      return false
    } finally {
      setRegistrandoAbono(false)
    }
  }, [confirm, loadCuentas, showToast])

  /**
   * Un cobro que cubre VARIAS facturas del mismo cliente: un solo documento y
   * un solo movimiento que entra a Caja General, con una línea por factura.
   */
  const handleRegistrarCobroVarias = useCallback(async ({ lineas, metodoPagoId, referencia, fecha }) => {
    const total = lineas.reduce((s, l) => s + Number(l.monto || 0), 0)
    const confirmado = await confirm(
      `¿Registrar un cobro de ₡${total.toLocaleString('es-CR')} que cubre ${lineas.length} factura${lineas.length === 1 ? '' : 's'}? Entra a Caja General.`,
      { title: 'Confirmar cobro', confirmLabel: 'Registrar cobro' }
    )
    if (!confirmado) return false

    setRegistrandoAbono(true)
    try {
      await registrarAbono({
        aplicaciones: lineas.map((l) => (l.todo ? { facturaId: l.id, saldarTotal: true } : { facturaId: l.id, monto: l.monto })),
        metodoPagoId, referencia, fecha
      })
      await loadCuentas()
      showToast('Cobro registrado', 'success')
      return true
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Error registrando el cobro', 'error')
      return false
    } finally {
      setRegistrandoAbono(false)
    }
  }, [confirm, loadCuentas, showToast])

  return {
    clientes,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    actualizando,
    handleActualizar,
    handleCargarAbonos,
    handleCargarProductos,
    registrandoAbono,
    handleRegistrarAbono,
    handleRegistrarCobroVarias,
    reload: () => loadCuentas(),
    dialogProps,
    toasts,
    removeToast
  }
}
