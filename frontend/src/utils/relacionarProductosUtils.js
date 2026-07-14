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

export function categoriaPareceMedicamento(categoriaId, categorias) {
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
