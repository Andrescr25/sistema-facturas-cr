import { useState, useEffect, useCallback, useRef } from 'react'
import { clientesService } from '../services/clientesService'

/**
 * Las fichas de clientes: buscar, crear, editar y desactivar.
 *
 * La búsqueda espera a que la persona deje de escribir: son 247 fichas y cada
 * tecla no puede ser una consulta. Al cambiar de filtro se vuelve a la página
 * 1, porque quedarse en la 5 de una lista que ahora tiene 2 páginas muestra
 * una pantalla vacía que parece un error.
 */
export function useClientes({ showToast, confirm }) {
  const [clientes, setClientes] = useState([])
  const [paginacion, setPaginacion] = useState({ total: 0, pagina: 1, paginas: 1 })
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('activos')
  const [pagina, setPagina] = useState(1)
  const [plazos, setPlazos] = useState([])
  const [editando, setEditando] = useState(null)   // ficha, o {} para una nueva
  const [guardando, setGuardando] = useState(false)
  const [procesando, setProcesando] = useState(null)

  // Para descartar la respuesta de una búsqueda vieja que llega tarde.
  const peticion = useRef(0)

  const cargar = useCallback(async (texto, filtroEstado, pag) => {
    const mia = ++peticion.current
    setCargando(true)
    try {
      const r = await clientesService.listar({ buscar: texto, estado: filtroEstado, pagina: pag, limite: 30 })
      if (mia !== peticion.current) return
      setClientes(r.clientes)
      setPaginacion(r.paginacion)
    } catch (error) {
      if (mia !== peticion.current) return
      showToast(error.response?.data?.message || 'No se pudieron cargar los clientes', 'error')
    } finally {
      if (mia === peticion.current) setCargando(false)
    }
  }, [showToast])

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda, estado, pagina), busqueda ? 300 : 0)
    return () => clearTimeout(t)
  }, [busqueda, estado, pagina, cargar])

  useEffect(() => { setPagina(1) }, [busqueda, estado])

  useEffect(() => {
    clientesService.plazos().then(setPlazos).catch(() => setPlazos([]))
  }, [])

  const refrescar = () => cargar(busqueda, estado, pagina)

  const guardar = async (valores) => {
    setGuardando(true)
    try {
      if (editando?.id) {
        await clientesService.editar(editando.id, valores)
        showToast('Cliente actualizado', 'success')
      } else {
        await clientesService.crear(valores)
        showToast('Cliente creado', 'success')
      }
      setEditando(null)
      await refrescar()
      return true
    } catch (error) {
      // El mensaje del servidor dice qué corregir ("una cédula jurídica tiene
      // 10 dígitos…"), así que se muestra tal cual y el formulario no se cierra.
      showToast(error.response?.data?.message || 'No se pudo guardar', 'error')
      return false
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstado = async (cliente) => {
    const activar = !cliente.activo
    const ok = await confirm(
      activar
        ? `${cliente.nombre} vuelve a aparecer para facturarle.`
        : `${cliente.nombre} deja de aparecer para facturar. Sus facturas, saldos y pedidos quedan como están.`,
      {
        title: activar ? 'Reactivar cliente' : 'Desactivar cliente',
        confirmLabel: activar ? 'Reactivar' : 'Desactivar',
        variant: activar ? 'default' : 'danger'
      }
    )
    if (!ok) return
    setProcesando(cliente.id)
    try {
      await clientesService.cambiarEstado(cliente.id, activar)
      showToast(activar ? 'Cliente reactivado' : 'Cliente desactivado', 'success')
      await refrescar()
    } catch (error) {
      showToast(error.response?.data?.message || 'No se pudo cambiar el estado', 'error')
    } finally {
      setProcesando(null)
    }
  }

  return {
    clientes, paginacion, cargando,
    busqueda, setBusqueda,
    estado, setEstado,
    pagina, setPagina,
    plazos,
    editando, setEditando,
    guardando, guardar,
    procesando, cambiarEstado,
    refrescar
  }
}
