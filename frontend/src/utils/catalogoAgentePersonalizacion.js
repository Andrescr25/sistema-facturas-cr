/**
 * Lógica pura de personalización del catálogo público por cliente. Todo
 * fuera de React para que sea fácil de razonar y (a futuro) testear: recibe
 * datos, devuelve datos.
 *
 * El registro de cliente que llega desde IndexedDB tiene forma compacta
 * (así se guarda igual de compacto que llega del backend, ver
 * catalogo-agente.service.js#obtenerHistorialParaCatalogo):
 *   { id, n, p: [[alegraItemId, veces, ultimaCompraISO], ...] }
 */

// Sin tope artificial real — el backend ya limita a los top 120 productos
// por cliente (por veces comprado), así que estos números solo existen como
// salvaguarda. La visita del agente se apoya en estas dos secciones, así que
// deben mostrar prácticamente todo lo que califica, no una selección corta.
const TOP_HABITUALES = 120
const TOP_PERDIDOS = 120
const DIAS_MIN_PERDIDO = 60
const VECES_MIN_PERDIDO = 3
const VECES_MIN_HABITUAL = 2

/** Decaimiento por recencia — más peso a lo comprado hace poco. */
function factorRecencia(dias) {
  if (dias <= 30) return 1
  if (dias <= 90) return 0.7
  if (dias <= 180) return 0.4
  return 0.15
}

/**
 * Arma un Map<itemId, stats> a partir del registro compacto de un cliente.
 * `stats` = { veces, ultimaCompra, dias, score, esHabitual, esPerdido }.
 * `hoy` es inyectable para tests; por defecto usa la fecha real del
 * dispositivo (el cálculo de recencia SIEMPRE es local, no del servidor,
 * para que siga siendo correcto días después de sincronizar).
 */
export function construirStats(cliente, hoy = new Date()) {
  const stats = new Map()
  if (!cliente || !Array.isArray(cliente.p)) return stats

  // Medianoche local, sin mutar el `hoy` recibido (importante para tests
  // que pasan un Date propio y luego lo siguen usando).
  const hoyMs = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()

  for (const [itemId, veces, ultimaCompra] of cliente.p) {
    const fechaCompra = new Date(ultimaCompra)
    const dias = Math.max(0, Math.round((hoyMs - fechaCompra.getTime()) / (1000 * 60 * 60 * 24)))
    const score = veces * factorRecencia(dias)
    stats.set(String(itemId), {
      veces,
      ultimaCompra,
      dias,
      score,
      esHabitual: veces >= VECES_MIN_HABITUAL,
      esPerdido: veces >= VECES_MIN_PERDIDO && dias > DIAS_MIN_PERDIDO
    })
  }
  return stats
}

/**
 * Top N productos por score, cruzando contra el catálogo real (productos
 * activos). Excluye explícitamente los "perdidos" (esPerdido implica
 * esHabitual, por veces>=3) — cada producto vive en UNA sola sección, nunca
 * en las dos a la vez con badges contradictorios ("Ya no pide" adentro de
 * "Lo que más compra").
 */
export function productosHabituales(products, statsPorProducto, limite = TOP_HABITUALES) {
  if (!statsPorProducto || statsPorProducto.size === 0) return []
  return products
    .map((p) => {
      const stats = statsPorProducto.get(String(p.id))
      if (!stats || !stats.esHabitual || stats.esPerdido) return null
      return { ...p, _stats: stats }
    })
    .filter(Boolean)
    .sort((a, b) => b._stats.score - a._stats.score)
    .slice(0, limite)
}

/** Top N productos que el cliente pedía seguido y dejó de pedir. */
export function productosPerdidos(products, statsPorProducto, limite = TOP_PERDIDOS) {
  if (!statsPorProducto || statsPorProducto.size === 0) return []
  return products
    .map((p) => {
      const stats = statsPorProducto.get(String(p.id))
      if (!stats || !stats.esPerdido) return null
      return { ...p, _stats: stats }
    })
    .filter(Boolean)
    .sort((a, b) => b._stats.veces - a._stats.veces)
    .slice(0, limite)
}

/**
 * Reordena el catálogo entero alrededor de un cliente: categorías por suma
 * de score de sus productos (desc, 'Otros' siempre al final), y dentro de
 * cada categoría los ya comprados primero (por score) y el resto por el
 * orden manual (ver `ordenDeCategorias`). Sin cliente activo (statsPorProducto
 * vacío) el resultado es idéntico a ordenar solo por ese orden manual — no
 * hay comportamiento especial que "apagar".
 *
 * `configCatalogo` es lo que devuelve GET /catalogo-agente/config-catalogo
 * ({ categorias, subcategorias }), acomodado en Gestión de Catálogo. Sin él
 * (todavía no sincronizó, o falló), todo sale alfabético — el orden de
 * siempre antes de que existiera esta pantalla.
 */
export function ordenarCatalogoParaCliente(products, statsPorProducto, configCatalogo = null) {
  const categorias = {}
  for (const p of products) {
    const catName = p.itemCategory?.name || 'Otros'
    if (!categorias[catName]) categorias[catName] = []
    categorias[catName].push(p)
  }

  const scoreDeCategoria = (nombre) =>
    categorias[nombre].reduce((suma, p) => suma + (statsPorProducto.get(String(p.id))?.score || 0), 0)

  for (const nombre of Object.keys(categorias)) {
    categorias[nombre].sort((a, b) => {
      const scoreA = statsPorProducto.get(String(a.id))?.score || 0
      const scoreB = statsPorProducto.get(String(b.id))?.score || 0
      if (scoreA !== scoreB) return scoreB - scoreA
      return (a.name || '').localeCompare(b.name || '')
    })
  }

  const ordenDe = ordenDeCategorias(configCatalogo)

  const sortedKeys = Object.keys(categorias).sort((a, b) => {
    if (a === 'Otros') return 1
    if (b === 'Otros') return -1
    if (statsPorProducto.size > 0) {
      const diff = scoreDeCategoria(b) - scoreDeCategoria(a)
      if (diff !== 0) return diff
    }
    const diffOrden = ordenDe(a) - ordenDe(b)
    if (diffOrden !== 0) return diffOrden
    return a.localeCompare(b)
  })

  return { grouped: categorias, sortedKeys, subgrupos: partirPorSubcategoria(categorias, configCatalogo) }
}

/**
 * El `name` real de Alegra -> su orden manual. Sin config, todo empata.
 *
 * Exportada para que Gestión de Catálogo pinte su riel en el MISMO orden
 * canónico que ve el agente, sin una segunda implementación por separado
 * (la que había en FiltrosCatalogo.jsx ordenaba por `indexOf`, un criterio
 * distinto que podía desacomodarse con categorías huérfanas de config).
 */
export function ordenDeCategorias(configCatalogo) {
  const mapa = new Map((configCatalogo?.categorias || []).map((c) => [c.name, c.orden]))
  return (nombre) => (mapa.has(nombre) ? mapa.get(nombre) : Number.MAX_SAFE_INTEGER)
}

/** El nombre visible de una categoría, o el real si no se le puso otro. */
export function nombreVisibleDeCategoria(nombre, configCatalogo) {
  const cat = (configCatalogo?.categorias || []).find((c) => c.name === nombre)
  return cat?.nombreVisible || nombre
}

/**
 * Parte cada categoría en bloques por subcategoría.
 *
 * PARA QUÉ. "Productos de PVC" son 118 piezas revueltas: el de 1/2 al lado
 * del de 3/4 y del sanitario. Mostrándole eso a un cliente en el mostrador no
 * se encuentra nada. Con los bloques, se le enseña "PVC 1/2" y ahí está todo
 * lo de 1/2 junto.
 *
 * SOLO SE PARTE LA CATEGORÍA QUE TIENE SUBCATEGORÍAS — con una excepción:
 * `sinClasificarSiempre` (que usa Gestión de Catálogo, nunca el agente) la
 * fuerza a partirse igual, para poder mostrar "Sin clasificar" como punto de
 * entrada incluso en una categoría que todavía no tiene NINGUNA
 * subcategoría creada — que es justo el caso más común al empezar a
 * clasificar una categoría nueva. Sin la excepción (comportamiento del
 * agente), esa categoría se dibuja de una sola tirada: hoy hay una sola
 * subcategoría en todo el catálogo, y si esto devolviera bloques para todas,
 * las otras cuarenta categorías se llenarían de encabezados que no dicen
 * nada.
 *
 * LO QUE NO TIENE SUBCATEGORÍA VA AL FINAL, bajo "Otros". No se esconde: es
 * la lista que hay que ir vaciando a medida que se clasifica, y si
 * desapareciera, un producto sin clasificar dejaría de verse sin que nadie
 * se diera cuenta.
 */
export function partirPorSubcategoria(categorias, configCatalogo = null, { sinClasificarSiempre = false } = {}) {
  const porCategoria = {}

  for (const [nombreCategoria, productos] of Object.entries(categorias)) {
    const bloques = new Map()
    const sueltos = []

    for (const p of productos) {
      const sub = p.subcategoria?.nombre
      if (!sub) { sueltos.push(p); continue }
      if (!bloques.has(sub)) bloques.set(sub, [])
      bloques.get(sub).push(p)
    }

    if (bloques.size === 0 && !sinClasificarSiempre) continue

    // Orden manual (Gestión de Catálogo) primero; sin configurar, cae al
    // alfabético `numeric` de siempre, para que "PVC 2" vaya antes que
    // "PVC 10" (comparadas como texto, "10" queda antes que "2").
    const ordenSub = new Map(
      (configCatalogo?.subcategorias || [])
        .filter((s) => s.categoria === nombreCategoria)
        .map((s) => [s.nombre, s.orden])
    )

    const ordenados = [...bloques.entries()]
      .sort((a, b) => {
        const oa = ordenSub.has(a[0]) ? ordenSub.get(a[0]) : null
        const ob = ordenSub.has(b[0]) ? ordenSub.get(b[0]) : null
        if (oa !== null && ob !== null && oa !== ob) return oa - ob
        if (oa !== null && ob === null) return -1
        if (oa === null && ob !== null) return 1
        return a[0].localeCompare(b[0], 'es', { numeric: true })
      })
      .map(([nombre, lista]) => ({ nombre, productos: lista }))

    if (sueltos.length > 0) ordenados.push({ nombre: 'Otros', productos: sueltos, sinClasificar: true })

    porCategoria[nombreCategoria] = ordenados
  }

  return porCategoria
}

/** Minúsculas sin tildes, para que "MARIA" encuentre "María". */
export function normalizarTexto(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export function filtrarClientes(clientes, termino) {
  const t = normalizarTexto(termino)
  if (!t) return clientes
  return clientes.filter((c) => normalizarTexto(c.n).includes(t))
}
