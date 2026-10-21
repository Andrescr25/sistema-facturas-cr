import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from '../services/api'
import { useContextoConsulta } from './useContextoConsulta'
import { urlPortal } from '../utils/urlPortal'

/**
 * Pantalla "Clientes" del sistema: cuentas del portal y pedidos que entraron.
 *
 * Usa `api` (el del personal), no `apiPortal`: acá quien mira es alguien de
 * la casa, con su sesión del sistema.
 */
export function useClientesPortal({ showToast, confirm }) {
  const [clientes, setClientes] = useState([])
  const [pedidos, setPedidos] = useState([])
  const [vista, setVista] = useState('fichas')
  const [filtroPedidos, setFiltroPedidos] = useState('pendiente')
  const [contextoPedidos, setContextoPedidos] = useState({ rutaId: '', origen: '' })
  const ultimaPeticionPedidos = useRef(0)
  const lecturaPedidos = useContextoConsulta(JSON.stringify([filtroPedidos, contextoPedidos]))
  const { esActual, confirmar: confirmarLectura } = lecturaPedidos
  const [busqueda, setBusqueda] = useState('')

  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [cargandoPedidos, setCargandoPedidos] = useState(false)
  const [errorPedidos, setErrorPedidos] = useState('')
  const [procesando, setProcesando] = useState(null)
  const [invitacion, setInvitacion] = useState(null)

  const cargarClientes = useCallback(async () => {
    setCargandoClientes(true)
    try {
      const { data } = await api.get('/portal-clientes/clientes')
      setClientes(data.data)
    } catch (err) {
      showToast?.('No se pudieron cargar los clientes.', 'error')
    } finally {
      setCargandoClientes(false)
    }
  }, [showToast])

  const cargarPedidos = useCallback(async (estado) => {
    if (!esActual()) return
    const peticion = ++ultimaPeticionPedidos.current
    setCargandoPedidos(true)
    setErrorPedidos('')
    try {
      const { data } = await api.get('/portal-clientes/pedidos', { params: { estado, ...contextoPedidos } })
      if (esActual() && peticion === ultimaPeticionPedidos.current) {
        setPedidos(data.data || [])
        confirmarLectura()
      }
    } catch (err) {
      if (esActual() && peticion === ultimaPeticionPedidos.current) {
        setPedidos([])
        confirmarLectura()
        setErrorPedidos('No se pudieron cargar los pedidos de esta selección.')
        showToast?.('No se pudieron cargar los pedidos de esta selección.', 'error')
      }
    } finally {
      if (esActual() && peticion === ultimaPeticionPedidos.current) setCargandoPedidos(false)
    }
  }, [showToast, contextoPedidos, esActual, confirmarLectura])

  useEffect(() => { cargarPedidos(filtroPedidos) }, [cargarPedidos, filtroPedidos])
  useEffect(() => { if (vista === 'clientes' && clientes.length === 0) cargarClientes() }, [vista])

  const clientesFiltrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return clientes
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(t) || String(c.identificacion || '').includes(t))
  }, [clientes, busqueda])

  const generarInvitacion = async (cliente) => {
    setProcesando(cliente.clienteId)
    try {
      const { data } = await api.post(`/portal-clientes/clientes/${cliente.clienteId}/invitacion`)
      const enlace = urlPortal(`/portal/activar/${data.data.token}`)
      // El id va también: hace falta para mandar el enlace por WhatsApp
      // desde el modal, y el que vuelve del servidor no lo trae.
      setInvitacion({
        ...data.data,
        enlace,
        cliente: cliente.nombre,
        clienteId: cliente.clienteId
      })
      await cargarClientes()
    } catch (err) {
      showToast?.(err.response?.data?.message || 'No se pudo generar el enlace.', 'error')
    } finally {
      setProcesando(null)
    }
  }

  const revocar = async (cliente) => {
    const ok = await confirm?.(`¿Quitarle el acceso a "${cliente.nombre}"? No va a poder entrar ni hacer pedidos.`)
    if (!ok) return
    try {
      await api.post(`/portal-clientes/clientes/${cliente.clienteId}/revocar`)
      showToast?.('Acceso revocado.', 'success')
      await cargarClientes()
    } catch (err) {
      showToast?.(err.response?.data?.message || 'No se pudo revocar.', 'error')
    }
  }

  const reactivar = async (cliente) => {
    try {
      await api.post(`/portal-clientes/clientes/${cliente.clienteId}/reactivar`)
      showToast?.('Acceso reactivado.', 'success')
      await cargarClientes()
    } catch (err) {
      showToast?.(err.response?.data?.message || 'No se pudo reactivar.', 'error')
    }
  }

  const facturar = async (pedido) => {
    const ok = await confirm?.(
      `¿Facturar el pedido #${pedido.id} de ${pedido.clienteNombre}? Se crea la factura de venta en el sistema.`
    )
    if (!ok) return
    setProcesando(pedido.id)
    try {
      const { data } = await api.post(`/portal-clientes/pedidos/${pedido.id}/facturar`)
      showToast?.(`Factura ${data.data.numeroFactura} creada.`, 'success')
      await cargarPedidos(filtroPedidos)
    } catch (err) {
      showToast?.(err.response?.data?.message || 'No se pudo facturar el pedido.', 'error')
    } finally {
      setProcesando(null)
    }
  }

  const rechazar = async (pedido, motivo) => {
    setProcesando(pedido.id)
    try {
      await api.post(`/portal-clientes/pedidos/${pedido.id}/rechazar`, { motivo })
      showToast?.('Pedido rechazado.', 'success')
      await cargarPedidos(filtroPedidos)
    } catch (err) {
      showToast?.(err.response?.data?.message || 'No se pudo rechazar.', 'error')
    } finally {
      setProcesando(null)
    }
  }

  return {
    vista, setVista,
    clientes: clientesFiltrados, cargandoClientes, cargarClientes,
    pedidos: lecturaPedidos.vigente ? pedidos : [],
    errorPedidos: lecturaPedidos.vigente ? errorPedidos : '', actualizarPedidos: () => cargarPedidos(filtroPedidos),
    cargandoPedidos: cargandoPedidos || !lecturaPedidos.vigente, filtroPedidos, setFiltroPedidos, contextoPedidos, setContextoPedidos,
    busqueda, setBusqueda,
    procesando, invitacion, setInvitacion,
    generarInvitacion, revocar, reactivar, facturar, rechazar
  }
}
