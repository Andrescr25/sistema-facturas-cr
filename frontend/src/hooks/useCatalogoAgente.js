import { useState, useEffect, useMemo, useCallback } from 'react'
import api from '../services/api'
import { catalogoAgenteDb } from '../utils/catalogoAgenteDb'
import { construirStats, productosHabituales, productosPerdidos, ordenarCatalogoParaCliente } from '../utils/catalogoAgentePersonalizacion'

const PRODUCTOS_PATH = '/catalogo-agente/productos'
const OFERTAS_PATH = '/catalogo-agente/ofertas'
const HISTORIAL_CLIENTES_PATH = '/catalogo-agente/historial-clientes'
const ALEGRA_PAGE_LIMIT = 30
const SYNC_CONCURRENCY = 5
const IMAGE_PREFETCH_CONCURRENCY = 10
const MAX_LOTES_FALLIDOS_CONSECUTIVOS = 3

const SIN_STATS = new Map()

export function useCatalogoAgente() {
  const [products, setProducts] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ message: '', percent: 0 })

  // ---- Personalización por cliente ----
  const [clientes, setClientes] = useState([])
  const [clienteActivoId, setClienteActivoId] = useState(null)

  useEffect(() => {
    const loadFromCache = async () => {
      try {
        const storedProducts = await catalogoAgenteDb.getAllProducts()
        const lastUpdate = await catalogoAgenteDb.getLastUpdate()
        const storedOfertas = await catalogoAgenteDb.getOfertas()
        const storedClientes = await catalogoAgenteDb.getAllClientes()
        const storedClienteActivoId = await catalogoAgenteDb.getClienteActivo()
        if (storedProducts && storedProducts.length > 0) {
          setProducts(storedProducts)
          setLastSync(lastUpdate)
        }
        if (storedOfertas) {
          setOfertas(storedOfertas)
        }
        if (storedClientes) {
          setClientes(storedClientes)
        }
        if (storedClienteActivoId) {
          setClienteActivoId(storedClienteActivoId)
        }
      } catch (error) {
        console.error('No se pudo cargar el catálogo local:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadFromCache()
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const clienteActivo = useMemo(
    () => clientes.find((c) => c.id === clienteActivoId) || null,
    [clientes, clienteActivoId]
  )

  // Recalcula contra la fecha real de HOY en cada carga — no se guarda el
  // score, se guarda la compra cruda (ver catalogoAgentePersonalizacion.js), así que
  // sigue siendo correcto días después de sincronizar.
  const statsPorProducto = useMemo(() => {
    if (!clienteActivo) return SIN_STATS
    return construirStats(clienteActivo)
  }, [clienteActivo])

  const seleccionarCliente = useCallback(async (id) => {
    setClienteActivoId(id)
    try {
      await catalogoAgenteDb.saveClienteActivo(id)
    } catch (error) {
      console.error('No se pudo guardar el cliente activo:', error)
    }
  }, [])

  const salirDeCliente = useCallback(async () => {
    setClienteActivoId(null)
    try {
      await catalogoAgenteDb.saveClienteActivo(null)
    } catch (error) {
      console.error('No se pudo limpiar el cliente activo:', error)
    }
  }, [])

  // Se calculan antes que filteredData porque el agrupado por categoría los
  // necesita para excluirlos y no duplicarlos. Vacías (sin recalcular nada)
  // cuando no hay cliente seleccionado.
  const habitualesCliente = useMemo(
    () => productosHabituales(products, statsPorProducto),
    [products, statsPorProducto]
  )
  const perdidosCliente = useMemo(
    () => productosPerdidos(products, statsPorProducto),
    [products, statsPorProducto]
  )

  const filteredData = useMemo(() => {
    let result = products

    if (searchQuery) {
      const term = searchQuery.toLowerCase().trim()
      result = result.filter((p) => {
        const name = p.name ? p.name.toLowerCase() : ''
        const ref = p.reference?.reference ? p.reference.reference.toLowerCase() : ''
        return name.includes(term) || ref.includes(term)
      })
    }

    // Los productos que ya salen destacados arriba ("compra seguido" y "dejó
    // de comprar") se sacan del agrupado por categoría: si no, aparecen dos
    // veces y el agente cree que son productos distintos.
    //
    // Solo cuando NO hay búsqueda: durante una búsqueda esas dos secciones no
    // se renderizan (ver CatalogoAgente.jsx), así que excluirlos ahí los
    // haría desaparecer del catálogo por completo.
    //
    // `flat` se deja SIN filtrar a propósito — alimenta el estado "Catálogo
    // Vacío", y un cliente cuyos productos estén todos destacados arriba no
    // tiene un catálogo vacío.
    let paraCategorias = result
    if (!searchQuery) {
      const yaDestacados = new Set(
        [...habitualesCliente, ...perdidosCliente].map((p) => String(p.id))
      )
      if (yaDestacados.size > 0) {
        paraCategorias = result.filter((p) => !yaDestacados.has(String(p.id)))
      }
    }

    // Sin cliente activo, ordenarCatalogoParaCliente con un Map vacío se
    // comporta idéntico al agrupado alfabético de siempre — no hay una rama
    // "especial" que mantener sincronizada con la de antes.
    const { grouped, sortedKeys } = ordenarCatalogoParaCliente(paraCategorias, statsPorProducto)

    return { flat: result, grouped, sortedKeys }
  }, [products, searchQuery, statsPorProducto, habitualesCliente, perdidosCliente])

  const featuredProducts = useMemo(() => {
    if (!ofertas || ofertas.length === 0) return []
    return ofertas
      .map((oferta) => {
        const product = products.find((p) => String(p.id) === String(oferta.id))
        if (!product) return null
        return { ...product, descuentoPorcentaje: oferta.descuentoPorcentaje }
      })
      .filter(Boolean)
      .sort((a, b) => b.descuentoPorcentaje - a.descuentoPorcentaje)
  }, [products, ofertas])


  const updateSyncUI = useCallback((message, percent) => {
    setSyncProgress({ message, percent })
  }, [])

  const synchronize = useCallback(async () => {
    setIsSyncing(true)
    updateSyncUI('Iniciando sincronización...', 5)

    try {
      let start = 0
      let hasMore = true
      let totalSynced = 0
      const newBuffer = []

      await catalogoAgenteDb.clearProducts()

      let lotesFallidosConsecutivos = 0

      while (hasMore) {
        const promises = []
        for (let i = 0; i < SYNC_CONCURRENCY; i++) {
          if (!hasMore) break
          const currentStart = start + i * ALEGRA_PAGE_LIMIT
          const p = api
            .get(PRODUCTOS_PATH, { params: { start: currentStart, limit: ALEGRA_PAGE_LIMIT } })
            .then((res) => ({ start: currentStart, data: res.data, ok: true }))
            .catch((err) => ({ start: currentStart, err, ok: false }))
          promises.push(p)
        }

        if (promises.length === 0) break

        const results = await Promise.all(promises)

        if (results.every((result) => !result.ok)) {
          lotesFallidosConsecutivos++
          if (lotesFallidosConsecutivos >= MAX_LOTES_FALLIDOS_CONSECUTIVOS) {
            throw new Error('No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.')
          }
        } else {
          lotesFallidosConsecutivos = 0
        }

        for (const result of results) {
          if (!result.ok) continue

          const data = result.data
          const batch = data.products || (Array.isArray(data) ? data : [])

          if (batch.length === 0) {
            hasMore = false
          }

          const activeBatch = batch.filter((p) => p.status === 'active')
          if (activeBatch.length > 0) {
            newBuffer.push(...activeBatch)
            totalSynced += activeBatch.length
          }

          updateSyncUI(`Cargando productos: ${totalSynced} ...`, Math.min(95, (totalSynced / 600) * 100))

          if (data.debug && typeof data.debug.has_more === 'boolean') {
            if (!data.debug.has_more) hasMore = false
          } else if (batch.length < ALEGRA_PAGE_LIMIT) {
            hasMore = false
          }
        }

        start += promises.length * ALEGRA_PAGE_LIMIT
      }

      await catalogoAgenteDb.saveProducts(newBuffer)

      // Ofertas e historial de clientes se guardan ANTES del prefetch de
      // imágenes (que sigue abajo) a propósito: ese prefetch puede llenar la
      // cuota de almacenamiento del dispositivo con ~2000 fotos y hacer que
      // el guardado de estos dos, que pesa muchísimo menos, falle por
      // QuotaExceededError si quedara después (visto en pruebas). Un fallo
      // acá no debe tumbar el resto de la sincronización.
      updateSyncUI('Actualizando ofertas...', 90)
      try {
        const ofertasRes = await api.get(OFERTAS_PATH)
        const nuevasOfertas = ofertasRes.data.ofertas || []
        await catalogoAgenteDb.saveOfertas(nuevasOfertas)
        setOfertas(nuevasOfertas)
      } catch (ofertasError) {
        console.error('No se pudieron actualizar las ofertas:', ofertasError)
      }

      updateSyncUI('Actualizando historial de clientes...', 92)
      try {
        const historialRes = await api.get(HISTORIAL_CLIENTES_PATH)
        const nuevosClientes = historialRes.data?.clientes || []
        await catalogoAgenteDb.clearClientes()
        await catalogoAgenteDb.saveClientes(nuevosClientes)
        setClientes(nuevosClientes)
      } catch (historialError) {
        console.error('No se pudo actualizar el historial de clientes:', historialError)
      }

      updateSyncUI('Preparando descarga de imágenes...', 95)
      const imageUrls = new Set()
      newBuffer.forEach((product) => {
        if (product.images && product.images.length > 0) {
          const favoriteImage = product.images.find((img) => img.favorite === true) || product.images[0]
          if (favoriteImage && favoriteImage.url) {
            imageUrls.add(favoriteImage.url)
          }
        }
      })

      const urlsArray = Array.from(imageUrls)
      const totalImages = urlsArray.length
      let downloadedImages = 0

      if (totalImages > 0) {
        for (let i = 0; i < urlsArray.length; i += IMAGE_PREFETCH_CONCURRENCY) {
          const chunk = urlsArray.slice(i, i + IMAGE_PREFETCH_CONCURRENCY)
          await Promise.all(
            chunk.map(
              (url) =>
                new Promise((resolve) => {
                  const img = new Image()
                  img.onload = () => resolve()
                  img.onerror = () => resolve()
                  img.src = url
                })
            )
          )
          downloadedImages += chunk.length
          updateSyncUI(
            `Guardando imágenes: ${Math.min(downloadedImages, totalImages)} / ${totalImages}`,
            Math.min(100, (downloadedImages / totalImages) * 100)
          )
        }
      }

      const timestamp = Date.now()
      await catalogoAgenteDb.saveLastUpdate(timestamp)
      setProducts(newBuffer)
      setLastSync(timestamp)
      setIsSyncing(false)
      return { success: true, count: newBuffer.length }
    } catch (error) {
      console.error('Error sincronizando catálogo:', error)
      setIsSyncing(false)
      window.alert(error.message || 'No se pudo sincronizar el catálogo. Intenta de nuevo.')
      return { success: false, error: error.message }
    }
  }, [updateSyncUI])

  return {
    isLoading,
    isOnline,
    isSyncing,
    syncProgress,
    lastSync,
    searchQuery,
    setSearchQuery,
    filteredData,
    featuredProducts,
    synchronize,
    clientes,
    clienteActivo,
    statsPorProducto,
    seleccionarCliente,
    salirDeCliente,
    productosHabitualesDelCliente: habitualesCliente,
    productosPerdidosDelCliente: perdidosCliente
  }
}
