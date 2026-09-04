import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import apiPortal from '../services/apiPortal'

const POR_PAGINA = 60

/**
 * Catálogo que ve el cliente.
 *
 * A diferencia de useCatalogoAgente (el del agente, que se descarga todo a
 * IndexedDB para sobrevivir sin señal), acá se pide por página al servidor.
 * El cliente abre un enlace y tiene que ver productos de inmediato: bajar
 * 2.000 fichas con sus imágenes antes de mostrar la primera es justo lo que
 * se quería evitar.
 */
export function useCatalogoClientes() {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [config, setConfig] = useState({ negocio: '', whatsapp: '', mensajeCabecera: '' })

  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [categoria, setCategoria] = useState('')

  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [hayMas, setHayMas] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [error, setError] = useState('')

  // Portada personalizada. `ofertas` se pide siempre (una oferta es pública);
  // habituales y perdidos solo si hay sesión, porque son el historial de
  // compras de ese cliente.
  const [habituales, setHabituales] = useState([])
  const [perdidos, setPerdidos] = useState([])
  const [ofertas, setOfertas] = useState([])
  // Los productos a los que se les bajó el precio resignando margen. Van
  // aparte de `ofertas`, que son excesos de inventario: el motivo es distinto
  // y el mensaje al cliente también.
  const [rebajados, setRebajados] = useState([])
  const [cargandoPortada, setCargandoPortada] = useState(false)

  // Cada búsqueda dispara una petición; si el usuario escribe rápido pueden
  // volver desordenadas y pintar un resultado viejo sobre uno nuevo. Solo se
  // acepta la respuesta de la última petición emitida.
  const peticionActual = useRef(0)

  useEffect(() => {
    api.get('/catalogo-clientes/ofertas')
      .then(({ data }) => setOfertas(data.data))
      .catch(() => {})
    api.get('/catalogo-clientes/ofertas-baja')
      .then(({ data }) => setRebajados(data.data || []))
      .catch(() => {})
    api.get('/catalogo-clientes/categorias')
      .then(({ data }) => setCategorias(data.data))
      .catch(() => {})
    api.get('/catalogo-clientes/configuracion')
      .then(({ data }) => setConfig(data.data))
      .catch(() => {})
  }, [])

  // Historial del cliente en sesión. El identificador NO viaja desde acá: el
  // backend lo saca del token, así que esta llamada no puede pedir la
  // portada de otro cliente.
  const cargarPortada = useCallback(async () => {
    setCargandoPortada(true)
    try {
      const { data } = await apiPortal.get('/portal/inicio')
      setHabituales(data.data.habituales)
      setPerdidos(data.data.perdidos)
      // Las ofertas de la portada vienen con el mismo formato, pero ya se
      // pidieron por la vía pública: se prefieren estas porque el llamado
      // con sesión es el más fresco de los dos.
      if (data.data.ofertas?.length) setOfertas(data.data.ofertas)
    } catch {
      // Sin sesión o sin historial: la pantalla simplemente no muestra
      // esas secciones.
      setHabituales([])
      setPerdidos([])
    } finally {
      setCargandoPortada(false)
    }
  }, [])

  const limpiarPortada = useCallback(() => {
    setHabituales([])
    setPerdidos([])
  }, [])

  // Rebote de la búsqueda: no consultar en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(busqueda.trim()), 350)
    return () => clearTimeout(t)
  }, [busqueda])

  const cargar = useCallback(async (paginaPedida, { acumular }) => {
    const id = ++peticionActual.current
    acumular ? setCargandoMas(true) : setCargando(true)
    setError('')
    try {
      const { data } = await api.get('/catalogo-clientes/productos', {
        params: { q: busquedaAplicada, categoria, pagina: paginaPedida, porPagina: POR_PAGINA }
      })
      if (id !== peticionActual.current) return
      setProductos(prev => acumular ? [...prev, ...data.data.productos] : data.data.productos)
      setTotal(data.data.total)
      setHayMas(data.data.hayMas)
      setPagina(paginaPedida)
    } catch (err) {
      if (id !== peticionActual.current) return
      setError('No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.')
    } finally {
      if (id === peticionActual.current) {
        acumular ? setCargandoMas(false) : setCargando(false)
      }
    }
  }, [busquedaAplicada, categoria])

  // Búsqueda o categoría nuevas: siempre se vuelve a la primera página.
  useEffect(() => { cargar(1, { acumular: false }) }, [cargar])

  // La usa el scroll infinito. Depende de `pagina` a propósito: si no,
  // quedaría capturada la página vieja y pediría siempre la misma.
  const verMas = useCallback(() => {
    if (!hayMas || cargandoMas || cargando) return
    cargar(pagina + 1, { acumular: true })
  }, [hayMas, cargandoMas, cargando, pagina, cargar])

  // Mientras el cliente busca o filtra por categoría está explorando, no
  // mirando su portada: las secciones estorban ahí.
  const mostrandoPortada = !busquedaAplicada && !categoria

  return {
    rebajados,
    productos, categorias, config,
    habituales, perdidos, ofertas, cargandoPortada, mostrandoPortada,
    cargarPortada, limpiarPortada,
    busqueda, setBusqueda, categoria, setCategoria,
    total, hayMas, cargando, cargandoMas, error, verMas
  }
}
