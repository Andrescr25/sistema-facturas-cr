import { useState, useEffect, useMemo, useCallback } from 'react'
import { catalogoPublicoDb } from '../utils/catalogoPublicoDb'

const API_URL = '/api/catalogo-publico/productos'
const OFERTAS_URL = '/api/catalogo-publico/ofertas'
const ALEGRA_PAGE_LIMIT = 30
const SYNC_CONCURRENCY = 5
const IMAGE_PREFETCH_CONCURRENCY = 10

export function useCatalogoPublico() {
  const [products, setProducts] = useState([])
  const [ofertas, setOfertas] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ message: '', percent: 0 })

  useEffect(() => {
    const loadFromCache = async () => {
      try {
        const storedProducts = await catalogoPublicoDb.getAllProducts()
        const lastUpdate = await catalogoPublicoDb.getLastUpdate()
        const storedOfertas = await catalogoPublicoDb.getOfertas()
        if (storedProducts && storedProducts.length > 0) {
          setProducts(storedProducts)
          setLastSync(lastUpdate)
        }
        if (storedOfertas) {
          setOfertas(storedOfertas)
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

    const categories = {}
    result.forEach((p) => {
      const catName = p.itemCategory?.name || 'Otros'
      if (!categories[catName]) categories[catName] = []
      categories[catName].push(p)
    })

    const sortedKeys = Object.keys(categories).sort((a, b) => {
      if (a === 'Otros') return 1
      if (b === 'Otros') return -1
      return a.localeCompare(b)
    })

    return { flat: result, grouped: categories, sortedKeys }
  }, [products, searchQuery])

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

      await catalogoPublicoDb.clearProducts()

      while (hasMore) {
        const promises = []
        for (let i = 0; i < SYNC_CONCURRENCY; i++) {
          if (!hasMore) break
          const currentStart = start + i * ALEGRA_PAGE_LIMIT
          const p = fetch(`${window.location.origin}${API_URL}?start=${currentStart}&limit=${ALEGRA_PAGE_LIMIT}`)
            .then((res) => (res.ok ? res.json() : Promise.reject(`Status ${res.status}`)))
            .then((data) => ({ start: currentStart, data, ok: true }))
            .catch((err) => ({ start: currentStart, err, ok: false }))
          promises.push(p)
        }

        if (promises.length === 0) break

        const results = await Promise.all(promises)

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

      await catalogoPublicoDb.saveProducts(newBuffer)

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

      updateSyncUI('Actualizando ofertas...', 98)
      try {
        const ofertasRes = await fetch(`${window.location.origin}${OFERTAS_URL}`)
        if (ofertasRes.ok) {
          const ofertasData = await ofertasRes.json()
          const nuevasOfertas = ofertasData.ofertas || []
          await catalogoPublicoDb.saveOfertas(nuevasOfertas)
          setOfertas(nuevasOfertas)
        }
      } catch (ofertasError) {
        console.error('No se pudieron actualizar las ofertas:', ofertasError)
      }

      const timestamp = Date.now()
      await catalogoPublicoDb.saveLastUpdate(timestamp)
      setProducts(newBuffer)
      setLastSync(timestamp)
      setIsSyncing(false)
      return { success: true, count: newBuffer.length }
    } catch (error) {
      console.error('Error sincronizando catálogo:', error)
      setIsSyncing(false)
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
    synchronize
  }
}
