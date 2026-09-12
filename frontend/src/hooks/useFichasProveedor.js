import { useState, useEffect, useCallback, useRef } from 'react'
import { proveedoresService } from '../services/proveedoresService'

/**
 * Las fichas de proveedores: buscar, crear, editar y desactivar.
 *
 * Al abrir una ficha se piden aparte sus últimas compras y los productos que
 * le compramos: en la lista serían 42 consultas para algo que casi nunca se
 * mira, y abierta es justo lo que se necesita ver antes de llamarlo.
 */
export function useFichasProveedor({ showToast, confirm }) {
  const [proveedores, setProveedores] = useState([])
  const [paginacion, setPaginacion] = useState({ total: 0, pagina: 1, paginas: 1 })
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('activos')
  const [pagina, setPagina] = useState(1)
  const [plazos, setPlazos] = useState([])
  const [editando, setEditando] = useState(null)   // ficha, o {} para una nueva
  const [abriendo, setAbriendo] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [procesando, setProcesando] = useState(null)

  const peticion = useRef(0)

  const cargar = useCallback(async (texto, filtroEstado, pag) => {
    const mia = ++peticion.current
    setCargando(true)
    try {
      const r = await proveedoresService.listar({ buscar: texto, estado: filtroEstado, pagina: pag, limite: 30 })
      if (mia !== peticion.current) return
      setProveedores(r.proveedores)
      setPaginacion(r.paginacion)
    } catch (error) {
      if (mia !== peticion.current) return
      showToast(error.response?.data?.message || 'No se pudieron cargar los proveedores', 'error')
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
    proveedoresService.plazos().then(setPlazos).catch(() => setPlazos([]))
  }, [])

  const refrescar = () => cargar(busqueda, estado, pagina)

  /** Abre la ficha con su detalle; si el detalle falla, abre igual lo que ya se tiene. */
  const abrirFicha = async (proveedor) => {
    setAbriendo(proveedor.id)
    try {
      setEditando(await proveedoresService.obtener(proveedor.id))
    } catch {
      setEditando(proveedor)
    } finally {
      setAbriendo(null)
    }
  }

  const guardar = async (valores) => {
    setGuardando(true)
    try {
      if (editando?.id) {
        await proveedoresService.editar(editando.id, valores)
        showToast('Proveedor actualizado', 'success')
      } else {
        await proveedoresService.crear(valores)
        showToast('Proveedor creado', 'success')
      }
      setEditando(null)
      await refrescar()
      return true
    } catch (error) {
      // El servidor dice qué corregir ("ya hay un proveedor con esa cédula"):
      // se muestra tal cual y el formulario no se cierra.
      showToast(error.response?.data?.message || 'No se pudo guardar', 'error')
      return false
    } finally {
      setGuardando(false)
    }
  }

  const cambiarEstado = async (proveedor) => {
    const activar = !proveedor.activo
    const ok = await confirm(
      activar
        ? `${proveedor.nombre} vuelve a aparecer en la lista.`
        : `${proveedor.nombre} deja de aparecer en la lista. Sus compras y sus productos quedan como están.`,
      {
        title: activar ? 'Reactivar proveedor' : 'Desactivar proveedor',
        confirmLabel: activar ? 'Reactivar' : 'Desactivar',
        variant: activar ? 'default' : 'danger'
      }
    )
    if (!ok) return
    setProcesando(proveedor.id)
    try {
      await proveedoresService.cambiarEstado(proveedor.id, activar)
      showToast(activar ? 'Proveedor reactivado' : 'Proveedor desactivado', 'success')
      await refrescar()
    } catch (error) {
      showToast(error.response?.data?.message || 'No se pudo cambiar el estado', 'error')
    } finally {
      setProcesando(null)
    }
  }

  return {
    proveedores, paginacion, cargando,
    busqueda, setBusqueda,
    estado, setEstado,
    pagina, setPagina,
    plazos,
    editando, setEditando, abrirFicha, abriendo,
    guardando, guardar,
    procesando, cambiarEstado,
    refrescar
  }
}
