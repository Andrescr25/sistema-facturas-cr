/**
 * Detección de medicamentos (por CABYS/categoría/descripción), factor de
 * conversión, y estadísticas de progreso de relación de productos.
 * Extraído de RelacionarProductos.jsx.
 */

export function normalizarTexto(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Grupo CABYS de productos farmacéuticos.
 *
 * Antes esto comparaba contra '35', que en el catálogo CABYS es la división
 * entera de "otros productos químicos": ahí adentro viven pinturas (351),
 * jabones y cosméticos (353), pegamentos y aceites (354), venenos (356)...
 * Sobre este catálogo, 276 productos caían en esa regla y NINGUNO era un
 * medicamento — se marcaban solos como fármaco y no había forma de
 * desmarcarlos.
 *
 * El grupo de medicamentos es 352. En este catálogo hoy no hay ninguno, así
 * que la sugerencia simplemente no se dispara, que es lo correcto.
 */
const CABYS_MEDICAMENTOS = '352'

export function cabysPareceMedicamento(codigoCabys) {
  return String(codigoCabys || '').startsWith(CABYS_MEDICAMENTOS)
}

/**
 * Si el producto PARECE un medicamento. Es una sugerencia para premarcar la
 * casilla, nunca la decisión final: quien crea el producto puede desmarcarla
 * y eso manda (ver useRelacionarProductos).
 */
export function pareceMedicamento(codigoCabys, categoriaId, categorias) {
  return cabysPareceMedicamento(codigoCabys) || categoriaPareceMedicamento(categoriaId, categorias)
}

export function categoriaPareceMedicamento(categoriaId, categorias) {
  // Sin lista de categorías no se puede saber nada: se responde que no en
  // vez de reventar. Pasa mientras la pantalla todavía las está cargando.
  if (!Array.isArray(categorias)) return false

  const categoria = categorias.find(cat => String(cat.id) === String(categoriaId))
  const textoCategoria = normalizarTexto(`${categoria?.name || ''} ${categoria?.description || ''}`)
  return textoCategoria.includes('medicamento') || textoCategoria.includes('farmac')
}

// Sugiere la forma farmacéutica basada solo en la descripción (para ayudar al usuario)
export function detectarFormaSugerida(descripcion) {
  const desc = (descripcion || '').toLowerCase()

  // Jarabe (101)
  if (desc.match(/jarabe/i)) {
    return '101'
  }

  // Crema (65)
  if (desc.match(/crema/i)) {
    return '65'
  }

  // Ungüento (229)
  if (desc.match(/ungue|pomada/i)) {
    return '229'
  }

  // Gel (79)
  if (desc.match(/gel/i)) {
    return '79'
  }

  // Cápsula (04)
  if (desc.match(/capsul|caps/i)) {
    return '04'
  }

  // Sólidos comunes (199) - tabletas, comprimidos, grageas, pastillas, polvos, granulos
  if (desc.match(/tableta|comprimido|pastilla|polvo|granulo|blister|blist|compri|grag|pild/i)) {
    return '199' // Tableta
  }

  // Gases / Aerosoles (163)
  if (desc.match(/gas|aerosol|spray|inhalador/i)) {
    return '163'
  }

  // Por defecto: Solución (158)
  return '158'
}

export function calcularFactorConversion(cantidadProveedor, cantidadMia) {
  return parseFloat(cantidadMia) / parseFloat(cantidadProveedor)
}

// Solo debe llamarse cuando factorConversion existe y es distinto de 1.
export function inferirCantidadesDesdeFactor(factorConversion) {
  if (factorConversion < 1) {
    // Ejemplo: 0.5 significa 1 del proveedor = 0.5 mío (2:1)
    return { cantidadProveedor: Math.round(1 / factorConversion), cantidadMia: 1 }
  }
  // Ejemplo: 2 significa 1 del proveedor = 2 míos (1:2)
  return { cantidadProveedor: 1, cantidadMia: Math.round(factorConversion) }
}

// Vista previa numérica del modal de conversión: factor y dos ejemplos.
export function calcularVistaPreviaConversion(cantidadProveedor, cantidadMia) {
  const cantProv = parseFloat(cantidadProveedor) || 1
  const cantMia = parseFloat(cantidadMia) || 1
  const factor = calcularFactorConversion(cantProv, cantMia)

  const ejemplo1Prov = cantProv * 2 // El doble
  const ejemplo1Mia = (ejemplo1Prov * factor).toFixed(2)

  const ejemplo2Prov = cantProv // Lo que configuraste
  const ejemplo2Mia = (ejemplo2Prov * factor).toFixed(2)

  return { cantProv, cantMia, factor, ejemplo1Prov, ejemplo1Mia, ejemplo2Prov, ejemplo2Mia }
}

export function calcularStatsProductos(productos) {
  return {
    total: productos.length,
    relacionados: productos.filter(p => p.estadoRelacionado === 'RELACIONADO').length,
    noRelacionados: productos.filter(p => p.estadoRelacionado !== 'RELACIONADO').length
  }
}

export function filtrarProductosPorEstado(productos, filtro) {
  return productos.filter(p => {
    if (filtro === 'relacionados') return p.estadoRelacionado === 'RELACIONADO'
    if (filtro === 'no-relacionados') return p.estadoRelacionado !== 'RELACIONADO'
    return true
  })
}
