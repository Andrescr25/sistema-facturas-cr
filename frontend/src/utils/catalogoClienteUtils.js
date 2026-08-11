/**
 * Lógica pura de personalización del catálogo público por cliente. Todo
 * fuera de React para que sea fácil de razonar y (a futuro) testear: recibe
 * datos, devuelve datos.
 *
 * El registro de cliente que llega desde IndexedDB tiene forma compacta
 * (así se guarda igual de compacto que llega del backend, ver
 * catalogo-publico.service.js#obtenerHistorialParaCatalogo):
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
 * cada categoría los ya comprados primero (por score) y el resto alfabético.
 * Sin cliente activo (statsPorProducto vacío) el resultado es idéntico al
 * orden de siempre — no hay comportamiento especial que "apagar".
 */
export function ordenarCatalogoParaCliente(products, statsPorProducto) {
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

  const sortedKeys = Object.keys(categorias).sort((a, b) => {
    if (a === 'Otros') return 1
    if (b === 'Otros') return -1
    if (statsPorProducto.size > 0) {
      const diff = scoreDeCategoria(b) - scoreDeCategoria(a)
      if (diff !== 0) return diff
    }
    return a.localeCompare(b)
  })

  return { grouped: categorias, sortedKeys }
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
