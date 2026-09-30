import { useState, useEffect, useMemo, useCallback, useLayoutEffect, useRef } from 'react'
import api from '../services/api'
import { buscarProductos } from '../utils/buscarCatalogoAgente'
import { catalogoAgenteDb } from '../utils/catalogoAgenteDb'
import {
  construirStats, productosHabituales, productosPerdidos, ordenarCatalogoParaCliente,
  CLIENTE_NUEVO, CLIENTE_NUEVO_ID, esClienteNuevo, catalogoClienteNuevo, enOrdenDelCatalogo
} from '../utils/catalogoAgentePersonalizacion'
import { fotosEnOrden, guardarFotosDelCatalogo } from '../utils/cacheImagenesCatalogo'

const PRODUCTOS_PATH = '/catalogo-agente/productos'
const OFERTAS_PATH = '/catalogo-agente/ofertas'
const OFERTAS_BAJA_PATH = '/catalogo-agente/ofertas-baja'
const PRODUCTOS_NUEVOS_PATH = '/catalogo-agente/productos-nuevos'
const HISTORIAL_CLIENTES_PATH = '/catalogo-agente/historial-clientes'
const CONFIG_CATALOGO_PATH = '/catalogo-agente/config-catalogo'
const ROTACION_PATH = '/catalogo-agente/rotacion'
const ALEGRA_PAGE_LIMIT = 30
const SYNC_CONCURRENCY = 5
const MAX_LOTES_FALLIDOS_CONSECUTIVOS = 3

const SIN_STATS = new Map()

// Cuánto se espera desde la última tecla antes de filtrar. 180 ms no se nota
// al escribir y evita filtrar cinco veces mientras se teclea "bolsa".
const RETARDO_BUSQUEDA = 180

// Cuántos resultados se pintan. Buscar "a" calza con más de mil productos, y
// montar mil tarjetas es lo que congelaba la tablet. La búsqueda ordena por
// parecido, así que lo que sirve está arriba; si no aparece, se afina el
// término. El total se sigue diciendo para que nadie crea que hay menos.
const MAX_RESULTADOS = 60

export function useCatalogoAgente() {
  const [products, setProducts] = useState([])
  const [ofertas, setOfertas] = useState([])
  // Los productos a los que se les bajó el precio resignando margen. Aparte
  // de `ofertas`, que son excesos de inventario.
  const [ofertasBaja, setOfertasBaja] = useState([])
  // "Productos nuevos": lista manual de Auditoría de Inventario, solo ids.
  const [productosNuevosIds, setProductosNuevosIds] = useState([])
  // Lo que se TIPEA y lo que se BUSCA son dos cosas distintas.
  //
  // El input tiene que responder a cada tecla, pero filtrar 2.000 productos y
  // volver a pintar la cuadrícula en cada una hacía que la pantalla se quedara
  // pensando un par de segundos. Se espera a que la persona deje de escribir.
  const [searchQuery, setSearchQuery] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setBusquedaAplicada(searchQuery), RETARDO_BUSQUEDA)
    return () => clearTimeout(t)
  }, [searchQuery])
  const [isLoading, setIsLoading] = useState(true)
  const [lastSync, setLastSync] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ message: '', percent: 0 })

  // ---- Personalización por cliente ----
  const [clientes, setClientes] = useState([])
  const [clienteActivoId, setClienteActivoId] = useState(null)

  // Orden y nombre visible de categorías/subcategorías, acomodado en Gestión
  // de Catálogo. `null` hasta la primera sincronización (o si nunca se
  // configuró nada): ordenarCatalogoParaCliente cae al alfabético de siempre.
  const [configCatalogo, setConfigCatalogo] = useState(null)
  // Qué productos son A y B en rotación: el catálogo de "Cliente nuevo".
  // `null` hasta la primera sincronización que la traiga.
  const [rotacion, setRotacion] = useState(null)
  // Qué no se pudo actualizar por falta de sesión en la última
  // sincronización (el orden y la rotación la piden). Se conserva lo que ya
  // estaba guardado y se avisa, en vez de mandar al agente al ingreso.
  const [sinSesionEnSync, setSinSesionEnSync] = useState([])
  // Cuántas fotos no cupieron en la tablet en la última sincronización (se
  // ven con internet). Ver utils/cacheImagenesCatalogo.js.
  const [fotosSinLugar, setFotosSinLugar] = useState(0)

  useEffect(() => {
    const loadFromCache = async () => {
      try {
        const storedProducts = await catalogoAgenteDb.getAllProducts()
        const lastUpdate = await catalogoAgenteDb.getLastUpdate()
        const storedOfertas = await catalogoAgenteDb.getOfertas()
        const storedClientes = await catalogoAgenteDb.getAllClientes()
        const storedClienteActivoId = await catalogoAgenteDb.getClienteActivo()
        const storedConfig = await catalogoAgenteDb.getConfigCatalogo()
        const storedRotacion = await catalogoAgenteDb.getRotacion()
        if (storedProducts && storedProducts.length > 0) {
          setProducts(storedProducts)
          setLastSync(lastUpdate)
        }
        if (storedOfertas) {
          setOfertas(storedOfertas)
        }
        const storedBaja = await catalogoAgenteDb.getOfertasBaja()
        if (storedBaja) {
          setOfertasBaja(storedBaja)
        }
        const storedNuevos = await catalogoAgenteDb.getProductosNuevos()
        if (storedNuevos) {
          setProductosNuevosIds(storedNuevos)
        }
        if (storedClientes) {
          setClientes(storedClientes)
        }
        if (storedClienteActivoId) {
          setClienteActivoId(storedClienteActivoId)
        }
        if (storedConfig) {
          setConfigCatalogo(storedConfig)
        }
        if (storedRotacion) {
          setRotacion(storedRotacion)
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

  // "Cliente nuevo" no está en la lista que baja del servidor (no existe en
  // Alegra): se reconoce por su id fijo.
  const clienteActivo = useMemo(
    () => (clienteActivoId === CLIENTE_NUEVO_ID
      ? CLIENTE_NUEVO
      : clientes.find((c) => c.id === clienteActivoId) || null),
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
    // El catálogo vuelve arriba del todo al soltar el cliente: lo que se veía
    // era SU pedido armado a medida (lo que más compra, lo que dejó de
    // pedir); para el próximo cliente no significa nada, y sin esto quedaba
    // a media pantalla justo cuando el agente va a buscar a otro.
    window.scrollTo(0, 0)
    posicionEnCatalogo.current = 0
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

  // --- Conservar el lugar del catálogo al buscar y volver ---------------
  //
  // El agente va bajando por el catálogo, el cliente se acuerda de algo, lo
  // busca por referencia, lo agrega y borra la búsqueda. Sin esto el catálogo
  // se rearma entero y lo devuelve al principio: tiene que volver a bajar
  // hasta donde estaba, con el cliente esperando.
  //
  // La posición se recuerda de forma CONTINUA mientras se ve el catálogo
  // completo, no en el momento de empezar a buscar. Ese fue el primer intento
  // y no servía: tocar el campo de búsqueda lo enfoca, y enfocarlo ya lleva
  // la página al principio — cuando se iba a guardar, la posición era 0.
  const posicionEnCatalogo = useRef(0)
  const buscandoRef = useRef(false)
  const busquedaPrevia = useRef('')

  useEffect(() => {
    const alDesplazar = () => {
      // Mientras hay una búsqueda activa lo que se ve son resultados, no el
      // catálogo: esa posición no es la que hay que recuperar.
      if (!buscandoRef.current) posicionEnCatalogo.current = window.scrollY
    }
    window.addEventListener('scroll', alDesplazar, { passive: true })
    return () => window.removeEventListener('scroll', alDesplazar)
  }, [])

  // useLayoutEffect y no useEffect: corre después de armar el DOM pero ANTES
  // de pintar, así el salto al principio no se llega a ver.
  useLayoutEffect(() => {
    const antes = busquedaPrevia.current
    const ahora = searchQuery
    busquedaPrevia.current = ahora
    buscandoRef.current = Boolean(ahora)

    // Se vuelve del buscador al catálogo completo: se recupera el lugar.
    if (antes && !ahora && posicionEnCatalogo.current > 0) {
      window.scrollTo(0, posicionEnCatalogo.current)
    }
  }, [searchQuery])

  const filteredData = useMemo(() => {
    let result = products
    const searchQuery = busquedaAplicada

    // Búsqueda ordenada por PARECIDO, no alfabética: lo que el agente
    // escribió tiene que salir primero, y una referencia exacta antes que
    // cualquier coincidencia parcial. Ver utils/buscarCatalogoAgente.js.
    if (searchQuery) {
      result = buscarProductos(result, searchQuery)
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
    const { grouped, sortedKeys, subgrupos } = ordenarCatalogoParaCliente(paraCategorias, statsPorProducto, configCatalogo)

    return {
      flat: searchQuery ? result.slice(0, MAX_RESULTADOS) : result,
      totalCoincidencias: result.length,
      recortado: Boolean(searchQuery) && result.length > MAX_RESULTADOS,
      grouped,
      sortedKeys,
      subgrupos
    }
  }, [products, busquedaAplicada, statsPorProducto, habitualesCliente, perdidosCliente, configCatalogo])

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

  // Las bajas de precio traen su propia forma; se cruzan con el catálogo
  // descargado para que la tarjeta reciba el producto completo (foto, subcategoría)
  // y de paso se descartan las de productos que el agente no tiene bajados.
  const productosRebajados = useMemo(() => {
    if (!ofertasBaja || ofertasBaja.length === 0) return []
    return ofertasBaja
      .map((o) => {
        const product = products.find((p) => String(p.id) === String(o.alegraItemId))
        if (!product) return null
        // NO se pasa `descuentoPorcentaje`: esa prop hace que la tarjeta
        // recalcule el precio, y acá el del catálogo ya es el rebajado.
        return { ...product, precioAntes: o.precioAntes, bajaPorcentaje: o.descuentoPorcentaje }
      })
      .filter(Boolean)
      .sort((a, b) => b.bajaPorcentaje - a.bajaPorcentaje)
  }, [products, ofertasBaja])

  // "Productos nuevos" cruzados con el catálogo descargado: la tarjeta
  // necesita el producto completo, y un id que la tablet no tiene (inactivo,
  // o todavía no sincronizado) no se puede mostrar.
  const productosNuevos = useMemo(() => {
    if (!productosNuevosIds || productosNuevosIds.length === 0) return []
    const porId = new Map(products.map((p) => [String(p.id), p]))
    return productosNuevosIds.map((n) => porId.get(String(n.alegraItemId))).filter(Boolean)
  }, [products, productosNuevosIds])

  // El catálogo de "Cliente nuevo": oferta, liquidación, rotación A y
  // rotación B, cada una por categoría y subcategoría. Solo se arma con ese
  // cliente elegido.
  const clienteNuevo = useMemo(() => {
    if (!esClienteNuevo(clienteActivo)) return null
    return catalogoClienteNuevo(products, {
      rebajados: productosRebajados, liquidacion: featuredProducts, rotacion, configCatalogo
    })
  }, [clienteActivo, products, productosRebajados, featuredProducts, rotacion, configCatalogo])


  const updateSyncUI = useCallback((message, percent) => {
    setSyncProgress({ message, percent })
  }, [])

  const synchronize = useCallback(async () => {
    setIsSyncing(true)
    updateSyncUI('Iniciando sincronización...', 5)
    const sinSesion = []
    const faltoSesion = (error) => error?.response?.status === 401
    // Lo que va arriba del catálogo, para guardar sus fotos primero.
    const destacados = new Set()

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
        nuevasOfertas.forEach((o) => destacados.add(String(o.id)))
        await catalogoAgenteDb.saveOfertas(nuevasOfertas)
        setOfertas(nuevasOfertas)
      } catch (ofertasError) {
        console.error('No se pudieron actualizar las ofertas:', ofertasError)
      }

      try {
        const bajaRes = await api.get(OFERTAS_BAJA_PATH)
        const nuevasBaja = bajaRes.data.ofertas || []
        nuevasBaja.forEach((o) => destacados.add(String(o.alegraItemId)))
        await catalogoAgenteDb.saveOfertasBaja(nuevasBaja)
        setOfertasBaja(nuevasBaja)
      } catch (bajaError) {
        // Un fallo acá no debe tumbar la sincronización: el catálogo sirve
        // igual sin la sección de rebajas.
        console.error('No se pudieron actualizar las bajas de precio:', bajaError)
      }

      try {
        const nuevosRes = await api.get(PRODUCTOS_NUEVOS_PATH)
        const nuevos = nuevosRes.data.productos || []
        nuevos.forEach((n) => destacados.add(String(n.alegraItemId)))
        await catalogoAgenteDb.saveProductosNuevos(nuevos)
        setProductosNuevosIds(nuevos)
      } catch (nuevosError) {
        // Igual que las rebajas: sin esto solo falta esa sección.
        console.error('No se pudieron actualizar los productos nuevos:', nuevosError)
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

      try {
        const configRes = await api.get(CONFIG_CATALOGO_PATH)
        await catalogoAgenteDb.saveConfigCatalogo(configRes.data)
        setConfigCatalogo(configRes.data)
      } catch (configError) {
        // Sin esto el catálogo sale en el orden alfabético de siempre — no
        // vale la pena tumbar la sincronización por algo que es solo de orden.
        // Lo guardado antes se queda.
        if (faltoSesion(configError)) sinSesion.push('el orden del catálogo')
        console.error('No se pudo actualizar el orden del catálogo:', configError)
      }

      try {
        const rotacionRes = await api.get(ROTACION_PATH)
        await catalogoAgenteDb.saveRotacion(rotacionRes.data)
        setRotacion(rotacionRes.data)
      } catch (rotacionError) {
        // Sin esto "Cliente nuevo" muestra solo la oferta: no vale la pena
        // tumbar la sincronización.
        if (faltoSesion(rotacionError)) sinSesion.push('lo más vendido')
        console.error('No se pudo actualizar la rotación:', rotacionError)
      }

      // Las fotos, en el orden en que se ven: lo destacado (rebajas, nuevos,
      // liquidación) y después el catálogo en el orden de Gestión de Catálogo
      // (el recién bajado o, sin sesión, el último guardado). Si no caben
      // todas, las que quedan afuera son las del fondo.
      updateSyncUI('Preparando las fotos...', 95)
      let resultadoFotos = { sinLugar: 0 }
      try {
        const configParaOrden = await catalogoAgenteDb.getConfigCatalogo().catch(() => null)
        const enOrden = [
          ...newBuffer.filter((p) => destacados.has(String(p.id))),
          ...enOrdenDelCatalogo(newBuffer, configParaOrden).flatMap((b) => b.productos)
        ]
        resultadoFotos = await guardarFotosDelCatalogo(fotosEnOrden(enOrden), (hechas, total) => {
          updateSyncUI(`Guardando fotos: ${hechas} / ${total}`, total ? Math.min(100, (hechas / total) * 100) : 100)
        })
        console.info('Fotos del catálogo:', resultadoFotos)
      } catch (fotosError) {
        // Las fotos son lo último y lo menos grave: con internet se ven igual.
        console.error('No se pudieron guardar las fotos:', fotosError)
      }

      const timestamp = Date.now()
      await catalogoAgenteDb.saveLastUpdate(timestamp)
      setProducts(newBuffer)
      setLastSync(timestamp)
      setSinSesionEnSync(sinSesion)
      setFotosSinLugar(resultadoFotos.sinLugar || 0)
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
    // Lo YA filtrado, para que la pantalla no parpadee entre la tecla y el
    // filtro. Lo que se tipea es `searchQuery`.
    busquedaAplicada,
    isLoading,
    isOnline,
    isSyncing,
    syncProgress,
    lastSync,
    searchQuery,
    setSearchQuery,
    filteredData,
    featuredProducts,
    productosRebajados,
    productosNuevos,
    sinSesionEnSync,
    fotosSinLugar,
    synchronize,
    clientes,
    clienteActivo,
    statsPorProducto,
    seleccionarCliente,
    salirDeCliente,
    productosHabitualesDelCliente: habitualesCliente,
    productosPerdidosDelCliente: perdidosCliente,
    configCatalogo,
    clienteNuevo,
    rotacionCalculadaEn: rotacion?.calculadoEn || null
  }
}
