import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { alegraService } from '../services/alegraService'
import {
  filtrarPendientesPorFecha,
  getItemIdFromFacturaItem,
  buildDraftForFactura,
  filtrarPorBusqueda,
  calcularDiasYLimite,
  normalizeReferenceValue,
  aplicarEstadosGuardados
} from '../utils/facturasBodegaUtils'

// Cada 2 minutos: el servidor contesta con lo guardado al toque y se
// actualiza por detrás, así que refrescar seguido ya no cuesta esperar a Alegra.
const REFRESCO_MS = 2 * 60 * 1000
// Si el servidor avisó que estaba actualizando, se vuelve a pedir en un rato
// corto para traer lo nuevo sin esperar al próximo refresco.
const REPREGUNTA_MS = 20 * 1000
const STORAGE_KEYS = {
  data: 'facturasBodega:data',
  selected: 'facturasBodega:selectedId',
  vista: 'facturasBodega:vista',
  filtros: 'facturasBodega:filtros',
  draft: (alegraId) => `facturasBodega:draft:${alegraId}`
}

const leer = (clave) => { try { return localStorage.getItem(clave) } catch { return null } }
const escribir = (clave, valor) => { try { localStorage.setItem(clave, valor) } catch { /* sin espacio: no bloquea */ } }
const borrar = (clave) => { try { localStorage.removeItem(clave) } catch { /* nada */ } }

/**
 * Estado y lógica de Facturas en Bodega.
 *
 * QUÉ SE ARREGLÓ AL REDISEÑARLA (2026-09-23)
 *  - Una sola carga. El efecto de carga dependía de la factura abierta, así
 *    que abrir o cerrar una factura volvía a sincronizar; cambiar el filtro
 *    de fecha disparaba DOS sincronizaciones (una forzada).
 *  - El historial va en orden de despacho: la última despachada primero (lo
 *    ordena el servidor por `despachada_en`; acá, al despachar, se pone arriba).
 *  - Abrir una del historial ya no le pide el detalle a Alegra: lo registrado
 *    sale de la base, y mientras llega los botones quedan quietos. Antes el
 *    detalle llegaba 2-6 s después y PISABA lo que el bodeguero ya había
 *    marcado.
 *  - Lo marcado se guarda en el teléfono por factura: si la pantalla se
 *    bloquea o se recarga a mitad del despacho, no se pierde.
 *  - Un error de sincronización no borra la lista: se sigue mostrando la
 *    guardada, con un aviso.
 */
export function useFacturasBodega() {
  const [pendientesRaw, setPendientesRaw] = useState([])
  const [listas, setListas] = useState([])
  const [ultimaSync, setUltimaSync] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState(null)

  const [vista, setVistaEstado] = useState(() => {
    const v = leer(STORAGE_KEYS.vista)
    return v === 'historial' ? 'historial' : 'pendientes'
  })
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState(() => {
    try {
      const guardados = JSON.parse(leer(STORAGE_KEYS.filtros) || 'null')
      if (guardados) return { fechaInicio: guardados.fechaInicio || '', mostrarSinFecha: guardados.mostrarSinFecha !== false }
    } catch { /* filtros viejos ilegibles: se usan los de siempre */ }
    return { fechaInicio: '', mostrarSinFecha: true }
  })

  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [faltantesDraft, setFaltantesDraft] = useState({})
  const [cargandoEstados, setCargandoEstados] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [clienteCompletado, setClienteCompletado] = useState(null)
  const [imagenesPorReferencia, setImagenesPorReferencia] = useState({})
  const [imagenProductoActivo, setImagenProductoActivo] = useState(null)

  const seleccionadaRef = useRef(null)
  const pedidoRef = useRef(0)
  const hayDatosRef = useRef(false)
  const repreguntaRef = useRef(null)
  const filtrosRef = useRef(filtros)
  filtrosRef.current = filtros

  const guardarLista = (pendientes, historial, sync) => {
    escribir(STORAGE_KEYS.data, JSON.stringify({ pendientes, listas: historial, ultimaSync: sync }))
  }

  /**
   * Trae la lista. `forzar` hace que el servidor hable con Alegra ya (botón
   * "Actualizar"); sin forzar, contesta al toque con lo que tenga.
   */
  const cargar = useCallback(async ({ forzar = false } = {}) => {
    const miPedido = ++pedidoRef.current
    setSincronizando(true)
    try {
      const { dias, limit } = calcularDiasYLimite(filtrosRef.current.fechaInicio)
      const response = await alegraService.getFacturasBodega({ force_refresh: forzar, dias, limit })
      if (miPedido !== pedidoRef.current) return
      if (!response.success) throw new Error(response.message || 'No se pudo cargar la información')

      const pendientesApi = response.data?.pendientes || []
      const historialApi = response.data?.listas || []
      const sync = response.metadata?.lastSync || new Date().toISOString()
      setPendientesRaw(pendientesApi)
      setListas(historialApi)
      setUltimaSync(sync)
      setAviso(response.metadata?.aviso || null)
      setError(null)
      hayDatosRef.current = true
      guardarLista(pendientesApi, historialApi, sync)

      // El servidor contestó con lo guardado y está trayendo lo nuevo: se
      // vuelve a preguntar en un rato, sin esperar al próximo refresco.
      clearTimeout(repreguntaRef.current)
      if (response.metadata?.actualizando) {
        repreguntaRef.current = setTimeout(() => {
          if (!seleccionadaRef.current) cargar()
        }, REPREGUNTA_MS)
      }
    } catch (err) {
      if (miPedido !== pedidoRef.current) return
      console.error('❌ Error cargando facturas de bodega:', err)
      if (hayDatosRef.current) {
        // Con una lista en pantalla, un error no la borra: se avisa y se sigue.
        setAviso(`${err.message} Se muestran las facturas de la última sincronización.`)
      } else {
        setError(err.message)
      }
    } finally {
      if (miPedido === pedidoRef.current) {
        setSincronizando(false)
        setCargando(false)
      }
    }
  }, [])

  // Arranque: lo guardado en el teléfono al instante, y después la red.
  useEffect(() => {
    try {
      const guardado = JSON.parse(leer(STORAGE_KEYS.data) || 'null')
      if (guardado) {
        setPendientesRaw(guardado.pendientes || [])
        setListas(guardado.listas || [])
        setUltimaSync(guardado.ultimaSync || null)
        setCargando(false)
        hayDatosRef.current = true

        // Si la pantalla se cerró a mitad de un despacho, se retoma.
        const idGuardado = leer(STORAGE_KEYS.selected)
        const todas = [...(guardado.pendientes || []), ...(guardado.listas || [])]
        const retomar = idGuardado && todas.find((f) => String(f.alegra_id) === String(idGuardado))
        if (retomar) abrirFactura(retomar)
      }
    } catch (storageError) {
      console.warn('⚠️ No se pudo leer la lista guardada de bodega:', storageError)
    }
    cargar()
    return () => clearTimeout(repreguntaRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresco: cada 2 minutos y al volver a la pantalla (el teléfono se
  // bloquea seguido), nunca en medio de un despacho.
  useEffect(() => {
    const refrescar = () => { if (!seleccionadaRef.current) cargar() }
    const intervalo = setInterval(refrescar, REFRESCO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [cargar])

  // Cambiar la fecha "desde" cambia la ventana que se le pide al servidor.
  const primeraVez = useRef(true)
  useEffect(() => {
    if (primeraVez.current) { primeraVez.current = false; return }
    cargar()
  }, [filtros.fechaInicio, cargar])

  // Arriba de todo al abrir una factura.
  useEffect(() => {
    if (facturaSeleccionada) window.scrollTo(0, 0)
  }, [facturaSeleccionada])

  // Lo marcado se guarda en el teléfono, factura por factura (solo las
  // pendientes: ver abrirFactura).
  useEffect(() => {
    if (!facturaSeleccionada || cargandoEstados || facturaSeleccionada.estado_bodega === 'procesado') return
    if (Object.keys(faltantesDraft).length === 0) return
    escribir(STORAGE_KEYS.draft(facturaSeleccionada.alegra_id), JSON.stringify(faltantesDraft))
  }, [faltantesDraft, facturaSeleccionada, cargandoEstados])

  // Las fotos ya asignadas en el catálogo, para los productos de la factura
  // abierta: las líneas de Alegra no traen foto propia.
  useEffect(() => {
    const items = facturaSeleccionada?.items
    const referencias = Array.from(new Set((items || [])
      .map((item) => normalizeReferenceValue(item?.referencia ?? item?.reference ?? ''))
      .filter(Boolean)))
    if (referencias.length === 0) { setImagenesPorReferencia({}); return }
    let cancelado = false
    alegraService.getImagenesPorReferencia(referencias).then((result) => {
      if (cancelado || !result.success) return
      const mapa = {}
      result.data.forEach((row) => { if (row.imageUrl) mapa[row.referencia] = row.imageUrl })
      setImagenesPorReferencia(mapa)
    })
    return () => { cancelado = true }
  }, [facturaSeleccionada])

  const handleVerImagenProducto = (item) => {
    const referencia = normalizeReferenceValue(item?.referencia ?? item?.reference ?? '')
    setImagenProductoActivo({
      nombre_producto: item?.nombre || item?.name || 'Producto',
      referencia: referencia || 'N/A',
      image_url: imagenesPorReferencia[referencia] || null
    })
  }
  const handleCerrarImagenProducto = () => setImagenProductoActivo(null)

  /** Abrir una factura: pendiente para despacharla, o del historial para revisarla. */
  async function abrirFactura(factura) {
    seleccionadaRef.current = factura.alegra_id
    setFacturaSeleccionada(factura)
    escribir(STORAGE_KEYS.selected, factura.alegra_id)

    const base = buildDraftForFactura(factura)
    const esPendiente = factura.estado_bodega !== 'procesado'

    // Lo marcado en este teléfono se retoma SOLO en una pendiente: si otro
    // teléfono ya la despachó, lo registrado manda sobre un borrador viejo.
    if (esPendiente) {
      let enProgreso = null
      try { enProgreso = JSON.parse(leer(STORAGE_KEYS.draft(factura.alegra_id)) || 'null') } catch { enProgreso = null }
      if (enProgreso && Object.keys(base).every((k) => enProgreso[k])) {
        setFaltantesDraft(enProgreso)
        return
      }
    }
    if (factura.estadosProductos) {
      setFaltantesDraft(factura.estadosProductos)
      return
    }
    setFaltantesDraft(base)
    if (esPendiente) return

    // Del historial: lo registrado, de la base. Mientras llega, los botones
    // quedan quietos para que nada de lo que se toque se pierda al llegar.
    setCargandoEstados(true)
    try {
      const estados = await alegraService.getEstadosFacturaBodega(factura.alegra_id)
      if (seleccionadaRef.current === factura.alegra_id) setFaltantesDraft(aplicarEstadosGuardados(base, estados))
    } catch (err) {
      console.error('Error cargando lo registrado de la factura:', err)
      setAviso('No se pudo cargar lo que ya se había registrado de esta factura.')
    } finally {
      if (seleccionadaRef.current === factura.alegra_id) setCargandoEstados(false)
    }
  }

  const cerrarFactura = () => {
    seleccionadaRef.current = null
    setFacturaSeleccionada(null)
    setFaltantesDraft({})
    setCargandoEstados(false)
    borrar(STORAGE_KEYS.selected)
  }

  const actualizarEntradaFaltante = (key, updater) => {
    setFaltantesDraft((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...updater(prev[key]) } } : prev))
  }

  const marcarModoFaltante = (key, modo, cantidadFactura) => {
    if (modo === 'ninguno') actualizarEntradaFaltante(key, () => ({ tipo: 'ninguno', cantidadFaltante: 0 }))
    else if (modo === 'total') actualizarEntradaFaltante(key, () => ({ tipo: 'total', cantidadFaltante: cantidadFactura }))
  }

  const actualizarCantidadFaltante = (key, valor, cantidadFactura) => {
    const cantidad = Math.max(0, Math.min(cantidadFactura, Number(valor) || 0))
    actualizarEntradaFaltante(key, () => ({
      tipo: cantidad === 0 ? 'ninguno' : cantidad === cantidadFactura ? 'total' : 'parcial',
      cantidadFaltante: cantidad
    }))
  }

  const actualizarObservacionItem = (key, texto) => {
    actualizarEntradaFaltante(key, () => ({ observaciones: texto }))
  }

  const faltantesSeleccionados = useMemo(
    () => Object.values(faltantesDraft).filter((item) => item.tipo !== 'ninguno' && item.cantidadFaltante > 0),
    [faltantesDraft]
  )

  const esEdicion = facturaSeleccionada?.estado_bodega === 'procesado'
  const accionPrincipalLabel = guardando
    ? 'Guardando…'
    : esEdicion
      ? 'Guardar cambios'
      : faltantesSeleccionados.length > 0
        ? `Registrar ${faltantesSeleccionados.length} faltante${faltantesSeleccionados.length === 1 ? '' : 's'}`
        : 'Factura lista'

  /**
   * Guardar el despacho: se registran TODOS los productos (los completos
   * también, para que al abrirla del historial se vea igual) y la factura
   * pasa a despachada. Sin faltantes va a la cola de impresión.
   */
  const handleRegistrarFaltantes = async () => {
    if (!facturaSeleccionada || guardando) return
    const factura = facturaSeleccionada
    const sinFaltantes = faltantesSeleccionados.length === 0
    try {
      setGuardando(true)
      const payload = Object.values(faltantesDraft).map((item) => ({
        referencia: item.referenciaReal || null,
        alegra_item_id: item.alegra_id || null,
        nombre_producto: item.nombre,
        cantidad_faltante: item.cantidadFaltante || 0,
        tipo_faltante: (!item.tipo || item.tipo === 'ninguno' || item.tipo === 'completo')
          ? 'completo'
          : (item.tipo === 'total' ? 'total' : 'parcial'),
        observaciones: item.observaciones || ''
      }))
      if (payload.length > 0) {
        await alegraService.registrarFaltantes(factura.alegra_id, payload, 'Bodega', '')
      }
      await alegraService.actualizarEstadoFacturaBodega(factura.alegra_id, 'procesado', null, sinFaltantes)

      // Al historial, ARRIBA: es la última despachada.
      const despachada = {
        ...factura,
        estado_bodega: 'procesado',
        despachada_en: new Date().toISOString(),
        estadosProductos: { ...faltantesDraft }
      }
      setPendientesRaw((prev) => prev.filter((f) => f.alegra_id !== factura.alegra_id))
      setListas((prev) => [despachada, ...prev.filter((f) => f.alegra_id !== factura.alegra_id)])

      borrar(STORAGE_KEYS.draft(factura.alegra_id))
      cerrarFactura()
      setSuccessMessage(sinFaltantes
        ? 'Factura lista y enviada a impresión'
        : `${faltantesSeleccionados.length} faltante${faltantesSeleccionados.length === 1 ? '' : 's'} registrado${faltantesSeleccionados.length === 1 ? '' : 's'}`)
      setTimeout(() => setSuccessMessage(null), 3000)
      setClienteCompletado({
        nombre: factura.cliente_nombre || factura.client?.name || 'Cliente',
        tipo: sinFaltantes ? 'listo' : 'faltantes',
        cantidad: faltantesSeleccionados.length
      })
    } catch (err) {
      console.error('❌ Error guardando el despacho:', err)
      // Lo marcado sigue guardado en el teléfono: se puede reintentar.
      setAviso(`No se pudo guardar: ${err.message} Lo marcado sigue acá; probá de nuevo.`)
    } finally {
      setGuardando(false)
    }
  }

  const setVista = (v) => {
    const valor = v === 'historial' ? 'historial' : 'pendientes'
    setVistaEstado(valor)
    escribir(STORAGE_KEYS.vista, valor)
  }

  const cambiarFiltro = (campo, valor) => {
    setFiltros((prev) => {
      const nuevos = { ...prev, [campo]: valor }
      escribir(STORAGE_KEYS.filtros, JSON.stringify(nuevos))
      return nuevos
    })
  }
  const limpiarFiltros = () => {
    const nuevos = { fechaInicio: '', mostrarSinFecha: true }
    setFiltros(nuevos)
    escribir(STORAGE_KEYS.filtros, JSON.stringify(nuevos))
  }

  const pendientes = useMemo(() => filtrarPendientesPorFecha(pendientesRaw, filtros), [pendientesRaw, filtros])
  // Dos vistas: lo que hay que alistar y el historial. Los faltantes se
  // siguen en su propio módulo (decisión del usuario, 2026-09-23).
  const facturasMostradas = useMemo(
    () => filtrarPorBusqueda(vista === 'historial' ? listas : pendientes, busqueda),
    [vista, pendientes, listas, busqueda]
  )

  const checkedItemsCount = useMemo(() => {
    if (!facturaSeleccionada?.items) return 0
    return facturaSeleccionada.items.filter((item, index) => {
      const draft = faltantesDraft[getItemIdFromFacturaItem(item) || `item-${index}`]
      return draft && draft.tipo !== null && draft.tipo !== undefined
    }).length
  }, [facturaSeleccionada, faltantesDraft])
  const totalItems = facturaSeleccionada?.items?.length || 0
  const progressPercent = totalItems ? Math.round((checkedItemsCount / totalItems) * 100) : 0
  const allItemsChecked = totalItems > 0 && checkedItemsCount === totalItems

  return {
    // lista
    cargando, sincronizando, error, aviso, setAviso, ultimaSync,
    actualizar: () => cargar({ forzar: true }),
    vista, setVista, busqueda, setBusqueda,
    filtros, cambiarFiltro, limpiarFiltros,
    facturasMostradas,
    conteos: { porPreparar: pendientes.length, historial: listas.length },

    // despacho
    facturaSeleccionada, faltantesDraft, cargandoEstados, guardando, esEdicion,
    abrirFactura, cerrarFactura,
    marcarModoFaltante, actualizarCantidadFaltante, actualizarObservacionItem,
    accionPrincipalLabel, handleRegistrarFaltantes,
    checkedItemsCount, progressPercent, allItemsChecked,

    // avisos y modales
    successMessage, setSuccessMessage,
    clienteCompletado, setClienteCompletado,
    imagenProductoActivo, handleVerImagenProducto, handleCerrarImagenProducto
  }
}
