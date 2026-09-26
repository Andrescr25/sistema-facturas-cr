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
 * Una lista corta —las rebajas de "Bajamos el precio"— en el orden del
 * catálogo: un bloque por categoría, en el orden de Gestión de Catálogo, y
 * dentro de cada una sus productos por subcategoría (en su orden; lo sin
 * clasificar al final de su categoría). Antes salían por porcentaje de rebaja,
 * revueltas: el PVC entre un cortaúñas y un bombillo.
 *
 * Es `ordenarCatalogoParaCliente` sin cliente, a propósito: el mismo orden
 * que el resto del catálogo, no uno aparte que se pueda desacomodar.
 */
export function enOrdenDelCatalogo(productos, configCatalogo = null) {
  const { grouped, sortedKeys, subgrupos } = ordenarCatalogoParaCliente(productos, new Map(), configCatalogo)
  return sortedKeys.map((clave) => ({
    clave,
    nombre: nombreVisibleDeCategoria(clave, configCatalogo),
    productos: subgrupos[clave] ? subgrupos[clave].flatMap((f) => f.productos) : grouped[clave],
    // Las familias (subcategorías) de la categoría, o null si no tiene: el
    // catálogo de "Cliente nuevo" las dibuja con su encabezado.
    familias: subgrupos[clave] || null
  }))
}

/**
 * "Cliente nuevo": un cliente que NO existe en Alegra, a propósito. Es el
 * que elige el agente cuando sale a buscar clientes; en vez de todo el
 * catálogo le enseña solo lo más fácil de vender (ver `catalogoClienteNuevo`).
 * Va en la lista de clientes de la tablet sin compras (`p` vacío), así que
 * no tiene "lo que más compra" ni "dejó de comprar".
 */
export const CLIENTE_NUEVO_ID = '__cliente_nuevo__'
export const CLIENTE_NUEVO = { id: CLIENTE_NUEVO_ID, n: 'Cliente nuevo', p: [], nuevo: true }

export function esClienteNuevo(cliente) {
  return cliente?.id === CLIENTE_NUEVO_ID
}

/**
 * El catálogo para un cliente nuevo, en cuatro partes y en este orden:
 *
 *   1. OFERTA: lo que bajó de precio (las mismas rebajas de "Bajamos el
 *      precio"; a quien no conoce el precio de antes se le dice "oferta").
 *   2. LIQUIDACIÓN: los excesos de inventario, con su descuento (agregada el
 *      2026-09-25 a pedido del usuario).
 *   3. Rotación A: lo que más se vende, que es lo más fácil de vender.
 *   4. Rotación B: cuando se termina la A.
 *
 * Cada parte en bloques por categoría y, dentro, por subcategoría — el mismo
 * orden que el resto del catálogo (`enOrdenDelCatalogo`).
 *
 * NINGÚN PRODUCTO SALE DOS VECES: el agente creería que son productos
 * distintos. Lo que está en Liquidación no se repite en ninguna otra parte
 * —ni siquiera en Oferta si además bajó de precio: el descuento de
 * liquidación se cobra ENCIMA del precio rebajado, así que el precio de
 * Liquidación es el que el cliente paga de verdad—. Lo de Oferta no se
 * repite en A ni en B. La C no se muestra; si el cliente pregunta por algo
 * que no está, lo encuentra la búsqueda, que siempre mira el catálogo entero.
 *
 * Las existencias no cuentan para nada: el negocio vende con el stock del
 * proveedor.
 *
 * `rotacion` es lo que devuelve GET /catalogo-agente/rotacion ({ A, B }, ids
 * de Alegra). Sin él (nunca sincronizó) no hay A ni B: solo las ofertas.
 */
export function catalogoClienteNuevo(products, { rebajados = [], liquidacion = [], rotacion = null, configCatalogo = null } = {}) {
  const enLiquidacion = new Set(liquidacion.map((p) => String(p.id)))
  const oferta = rebajados.filter((p) => !enLiquidacion.has(String(p.id)))
  const yaMostrados = new Set([...enLiquidacion, ...oferta.map((p) => String(p.id))])
  const claseA = new Set((rotacion?.A || []).map(String))
  const claseB = new Set((rotacion?.B || []).map(String))

  const deClase = (clase) => products.filter((p) => clase.has(String(p.id)) && !yaMostrados.has(String(p.id)))
  const a = deClase(claseA)
  const b = deClase(claseB)

  return {
    oferta: enOrdenDelCatalogo(oferta, configCatalogo),
    liquidacion: enOrdenDelCatalogo(liquidacion, configCatalogo),
    A: enOrdenDelCatalogo(a, configCatalogo),
    B: enOrdenDelCatalogo(b, configCatalogo),
    totales: { oferta: oferta.length, liquidacion: liquidacion.length, A: a.length, B: b.length }
  }
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

    const conOrden = (nombre) => ({ nombre, orden: ordenSub.has(nombre) ? ordenSub.get(nombre) : null })
    const ordenados = [...bloques.entries()]
      .sort((a, b) => compararSubcategorias(conOrden(a[0]), conOrden(b[0])))
      .map(([nombre, lista]) => ({ nombre, productos: lista }))

    if (sueltos.length > 0) ordenados.push({ nombre: 'Otros', productos: sueltos, sinClasificar: true })

    porCategoria[nombreCategoria] = ordenados
  }

  return porCategoria
}

/**
 * El orden de dos subcategorías `{nombre, orden}`: el manual primero (`orden`
 * null = sin configurar, va después); sin él, por nombre con los números en
 * su lugar — "PVC 2" antes que "PVC 10".
 *
 * Una sola definición para las dos pantallas: la usa partirPorSubcategoria
 * (el agente) y la usa Gestión de Catálogo para pintar sus secciones, incluso
 * las que todavía no tienen productos.
 */
export function compararSubcategorias(a, b) {
  const oa = a.orden ?? null
  const ob = b.orden ?? null
  if (oa !== null && ob !== null && oa !== ob) return oa - ob
  if (oa !== null && ob === null) return -1
  if (oa === null && ob !== null) return 1
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true })
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
