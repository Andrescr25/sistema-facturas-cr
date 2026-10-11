import { useState, useEffect, useCallback, useRef } from 'react'
import { useContextoConsulta } from './useContextoConsulta'
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
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('activos')
  const [pagina, setPagina] = useState(1)
  const [rutaId, setRutaId] = useState('')
  // Una selección nueva retira también el total/listado anterior durante el
  // debounce. La identidad distingue la primera respuesta A al volver A → B → A.
  const lectura = useContextoConsulta(JSON.stringify([busqueda, estado, pagina, rutaId]))
  const { esActual, confirmar } = lectura
  const [revisionFicha, setRevisionFicha] = useState(0)
  const [plazos, setPlazos] = useState([])
  const [editando, setEditando] = useState(null)   // ficha, o {} para una nueva
  const [guardando, setGuardando] = useState(false)
  const [procesando, setProcesando] = useState(null)

  // Para descartar la respuesta de una búsqueda vieja que llega tarde.
  const peticion = useRef(0)

  const cargar = useCallback(async (texto, filtroEstado, pag, filtroRuta) => {
    const mia = ++peticion.current
    setCargando(true)
    setError('')
    try {
      const r = await clientesService.listar({ buscar: texto, estado: filtroEstado, pagina: pag, limite: 30, rutaId: filtroRuta })
      if (mia !== peticion.current || !esActual()) return
      setClientes(r.clientes)
      setPaginacion(r.paginacion)
      confirmar()
    } catch (error) {
      if (mia !== peticion.current || !esActual()) return
      setClientes([])
      setError(error.response?.data?.message || 'No se pudieron cargar los clientes.')
      confirmar()
    } finally {
      if (mia === peticion.current) setCargando(false)
    }
  }, [esActual, confirmar])

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda, estado, pagina, rutaId), busqueda ? 300 : 0)
    return () => clearTimeout(t)
  }, [busqueda, estado, pagina, rutaId, cargar])

  useEffect(() => { setPagina(1) }, [busqueda, estado, rutaId])

  useEffect(() => {
    clientesService.plazos().then(setPlazos).catch(() => setPlazos([]))
  }, [])

  const refrescar = () => cargar(busqueda, estado, pagina, rutaId)

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
      setRevisionFicha(n => n + 1)
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
    clientes: lectura.vigente ? clientes : [],
    paginacion: lectura.vigente ? paginacion : { total: 0, pagina, paginas: 1 },
    cargando: cargando || !lectura.vigente, error: lectura.vigente ? error : '',
    busqueda, setBusqueda,
    estado, setEstado,
    pagina, setPagina,
    rutaId, setRutaId, revisionFicha,
    plazos,
    editando, setEditando,
    guardando, guardar,
    procesando, cambiarEstado,
    refrescar
  }
}
