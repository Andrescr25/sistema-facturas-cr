import { useState, useEffect, useMemo, useCallback, useLayoutEffect, useRef } from 'react'
import api from '../services/api'
import { buscarProductos } from '../utils/buscarCatalogoAgente'
import { catalogoAgenteDb, validarVersionIds } from '../utils/catalogoAgenteDb'
import {
  construirStats, productosHabituales, productosPerdidos, ordenarCatalogoParaCliente,
  CLIENTE_NUEVO, CLIENTE_NUEVO_ID, esClienteNuevo, catalogoClienteNuevo, enOrdenDelCatalogo
} from '../utils/catalogoAgentePersonalizacion'
import { fotosEnOrden, guardarFotosDelCatalogo } from '../utils/cacheImagenesCatalogo'
import { conPromocionesDelCatalogo } from '../utils/promocionesCatalogoAgente'

const PRODUCTOS_PATH = '/catalogo-agente/productos'
const OFERTAS_PATH = '/catalogo-agente/ofertas'
const OFERTAS_BAJA_PATH = '/catalogo-agente/ofertas-baja'
const PRODUCTOS_NUEVOS_PATH = '/catalogo-agente/productos-nuevos'
const HISTORIAL_CLIENTES_PATH = '/catalogo-agente/historial-clientes'
const CONFIG_CATALOGO_PATH = '/catalogo-agente/config-catalogo'
const ROTACION_PATH = '/catalogo-agente/rotacion'
const PAGINA_CATALOGO = 30
const SYNC_CONCURRENCY = 5
const MAX_INTENTOS_PAGINA = 3

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
  const [requiereActualizar, setRequiereActualizar] = useState(false)
  const [errorCatalogo, setErrorCatalogo] = useState('')

  useEffect(() => {
    const loadFromCache = async () => {
      try {
        setRequiereActualizar(await catalogoAgenteDb.getRequiereActualizar())
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
        setErrorCatalogo(error.message || 'No se pudo abrir el catálogo guardado.')
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

  // "Cliente nuevo" es una vista sin ficha propia: se reconoce por su id fijo.
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
        const product = products.find((p) => String(p.id) === String(o.productoId))
        if (!product) return null
        // NO se pasa `descuentoPorcentaje`: esa prop hace que la tarjeta
        // recalcule el precio, y acá el del catálogo ya es el rebajado.
        return { ...product, precioAntes: o.precioAntes, bajaPorcentaje: o.descuentoPorcentaje }
      })
      .filter(Boolean)
      .sort((a, b) => b.bajaPorcentaje - a.bajaPorcentaje)
  }, [products, ofertasBaja])

  // La oferta viaja con la ficha en categoría, búsqueda e historial del
  // cliente. Mostrarla aparte arriba duplicaba productos y separaba familias.
  const catalogoPromocionado = useMemo(
    () => conPromocionesDelCatalogo(products, productosRebajados, featuredProducts),
    [products, productosRebajados, featuredProducts]
  )

  // Se calculan antes que filteredData porque el agrupado por categoría los
  // necesita para excluirlos y no duplicarlos. Vacías (sin recalcular nada)
  // cuando no hay cliente seleccionado.
  const habitualesCliente = useMemo(
    () => productosHabituales(catalogoPromocionado, statsPorProducto),
    [catalogoPromocionado, statsPorProducto]
  )
  const perdidosCliente = useMemo(
    () => productosPerdidos(catalogoPromocionado, statsPorProducto),
    [catalogoPromocionado, statsPorProducto]
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
    let result = catalogoPromocionado
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
  }, [catalogoPromocionado, busquedaAplicada, statsPorProducto, habitualesCliente, perdidosCliente, configCatalogo])

  // "Productos nuevos" cruzados con el catálogo descargado: la tarjeta
  // necesita el producto completo, y un id que la tablet no tiene (inactivo,
  // o todavía no sincronizado) no se puede mostrar.
  const productosNuevos = useMemo(() => {
    if (!productosNuevosIds || productosNuevosIds.length === 0) return []
    const porId = new Map(catalogoPromocionado.map((p) => [String(p.id), p]))
    return productosNuevosIds.map((n) => porId.get(String(n.productoId))).filter(Boolean)
  }, [catalogoPromocionado, productosNuevosIds])

  // "Cliente nuevo" reúne oferta, liquidación, A y B por categoría/familia,
  // con filtros que conservan las cuatro selecciones. Solo se arma con ese
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
    setErrorCatalogo('')
    updateSyncUI('Iniciando actualización...', 5)
    const sinSesion = [], destacados = new Set()
    try {
      let start = 0, hasMore = true
      const newBuffer = []
      // Reintentar LA MISMA página. Saltar un error y avanzar el offset
      // guardaba un catálogo incompleto como si se hubiera actualizado bien.
      const descargarPagina = async (offset) => {
        for (let intento = 1; intento <= MAX_INTENTOS_PAGINA; intento++) {
          try {
            const { data } = await api.get(PRODUCTOS_PATH, { params: { start: offset, limit: PAGINA_CATALOGO } })
            validarVersionIds(data)
            return data
          } catch (error) {
            if (intento === MAX_INTENTOS_PAGINA || error.response?.status === 401 || (!error.response && error.message?.includes('servidor cambió'))) throw error
          }
        }
      }
      while (hasMore) {
        const paginas = await Promise.all(Array.from({ length: SYNC_CONCURRENCY }, (_,i) => descargarPagina(start+i*PAGINA_CATALOGO)))
        for (const data of paginas) {
          const batch = data.products
          if (!Array.isArray(batch) || typeof data.debug?.has_more !== 'boolean') throw new Error('El servidor devolvió un catálogo incompleto.')
          newBuffer.push(...batch.filter(p => p.status === 'active'))
          updateSyncUI(`Cargando productos: ${newBuffer.length} ...`, Math.min(85, newBuffer.length/600*100))
          if (!data.debug.has_more) hasMore = false
        }
        start += SYNC_CONCURRENCY*PAGINA_CATALOGO
      }
      // Extras independientes. Un 401 conserva el último orden y rotación
      // propios y se avisa; no expulsa al agente a mitad de la actualización.
      updateSyncUI('Actualizando ofertas y clientes...', 90)
      const solicitudes = [
        ['ofertas', OFERTAS_PATH, 'ofertas'], ['ofertasBaja', OFERTAS_BAJA_PATH, 'ofertas'],
        ['productosNuevos', PRODUCTOS_NUEVOS_PATH, 'productos'], ['clientes', HISTORIAL_CLIENTES_PATH, 'clientes'],
        ['configCatalogo', CONFIG_CATALOGO_PATH, null], ['rotacion', ROTACION_PATH, null]
      ]
      const resultados = await Promise.allSettled(solicitudes.map(async ([clave,ruta,campo]) => {
        const { data } = await api.get(ruta)
        if (clave !== 'configCatalogo') validarVersionIds(data)
        if (campo && !Array.isArray(data[campo])) throw new Error(`No se pudo verificar ${clave}.`)
        return campo ? data[campo] : data
      }))
      const snapshot = { products: newBuffer, timestamp: Date.now() }
      resultados.forEach((r,i) => {
        const [clave] = solicitudes[i]
        if (r.status === 'fulfilled') snapshot[clave] = r.value
        else {
          if (r.reason.response?.status === 401) sinSesion.push(clave === 'rotacion' ? 'lo más vendido' : clave === 'configCatalogo' ? 'el orden del catálogo' : 'el historial de clientes')
          console.error(`No se pudo actualizar ${clave}:`, r.reason)
        }
      })
      // No publicar ni borrar la copia anterior hasta tener TODAS las páginas.
      // Productos, clientes y metadatos se confirman en una transacción IDB.
      // Las fotos van después: una cuota llena nunca deja el catálogo a medias.
      await catalogoAgenteDb.guardarCatalogo(snapshot)
      setProducts(newBuffer)
      setLastSync(snapshot.timestamp)
      setRequiereActualizar(false)
      if (snapshot.ofertas) setOfertas(snapshot.ofertas)
      if (snapshot.ofertasBaja) setOfertasBaja(snapshot.ofertasBaja)
      if (snapshot.productosNuevos) setProductosNuevosIds(snapshot.productosNuevos)
      if (snapshot.clientes) setClientes(snapshot.clientes)
      if (snapshot.configCatalogo) setConfigCatalogo(snapshot.configCatalogo)
      if (snapshot.rotacion) setRotacion(snapshot.rotacion)
      setSinSesionEnSync(sinSesion)
      // Prioridad de fotos: liquidación, rebajas y nuevos; luego el orden
      // canónico de Gestión de Catálogo. Son rutas de imagen, no ids de venta.
      const ofertasActuales = snapshot.ofertas || await catalogoAgenteDb.getOfertas() || []
      const bajasActuales = snapshot.ofertasBaja || await catalogoAgenteDb.getOfertasBaja() || []
      const nuevosActuales = snapshot.productosNuevos || await catalogoAgenteDb.getProductosNuevos() || []
      ofertasActuales.forEach(o => destacados.add(String(o.id)))
      bajasActuales.forEach(o => destacados.add(String(o.productoId)))
      nuevosActuales.forEach(n => destacados.add(String(n.productoId)))
      updateSyncUI('Preparando las fotos...', 95)
      let resultadoFotos = { sinLugar: 0 }
      try {
        const configParaOrden = await catalogoAgenteDb.getConfigCatalogo().catch(() => null)
        const enOrden = [...newBuffer.filter(p => destacados.has(String(p.id))),
          ...enOrdenDelCatalogo(newBuffer, configParaOrden).flatMap(b => b.productos)]
        resultadoFotos = await guardarFotosDelCatalogo(fotosEnOrden(enOrden), (hechas,total) => {
          updateSyncUI(`Guardando fotos: ${hechas} / ${total}`, total ? Math.min(100, hechas/total*100) : 100)
        })
      } catch (error) { console.error('No se pudieron guardar las fotos:', error) }
      setFotosSinLugar(resultadoFotos.sinLugar || 0)
      return { success: true, count: newBuffer.length }
    } catch (error) {
      console.error('Error actualizando catálogo:', error)
      setErrorCatalogo(error.response?.data?.message || error.message || 'No se pudo actualizar el catálogo. Se conserva la copia anterior.')
      return { success: false, error: error.message }
    } finally { setIsSyncing(false) }
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
    requiereActualizar,
    errorCatalogo,
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
