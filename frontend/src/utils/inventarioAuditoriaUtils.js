/**
 * Cálculos puros de la auditoría de inventario: formateo, KPIs del
 * dashboard, filtrado/estadísticas de la hoja de conteo, vista previa de
 * ajustes, e impacto financiero en vivo. Extraído de InventarioAuditoria.jsx.
 */

export const formatCurrency = (value) =>
  `₡${(Number(value) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}`

// Tamaño de fuente para un monto en un KPI, según la longitud del texto ya
// formateado: montos grandes (muchos dígitos) se ven cada vez más chicos
// para no desbordar la tarjeta, en vez de quedar fijos en un tamaño enorme.
export function tamanoTextoMonto(valorFormateado) {
  if (valorFormateado.length > 16) return 'text-lg'
  if (valorFormateado.length > 12) return 'text-2xl'
  return 'text-3xl'
}

export const formatDate = (value) =>
  new Date(value).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

export function calcularKpis(auditorias) {
  const finalizadas = auditorias.filter(a => a.estado === 'finalizado')
  if (finalizadas.length === 0) {
    return { precision: 100, descuadre: 0, total: 0 }
  }

  const sumPrecision = finalizadas.reduce((acc, curr) => acc + Number(curr.precision_porcentaje || 0), 0)
  const sumDescuadre = finalizadas.reduce((acc, curr) => acc + Number(curr.descuadre_dinero || 0), 0)

  return {
    precision: sumPrecision / finalizadas.length,
    descuadre: sumDescuadre,
    total: auditorias.length
  }
}

export function filtrarItemsAuditoria(items, { executionSearch, executionFilter, conteosDraft }) {
  if (!items) return []

  return items.filter(item => {
    // 1. Search text
    const searchMatch =
      item.nombre_producto.toLowerCase().includes(executionSearch.toLowerCase()) ||
      (item.referencia && item.referencia.toLowerCase().includes(executionSearch.toLowerCase()))

    if (!searchMatch) return false

    // 2. Filter status
    const conteoReal = conteosDraft[item.id]
    const stockSistema = Number(item.stock_sistema)

    if (executionFilter === 'pendiente') {
      return conteoReal === ''
    }
    if (executionFilter === 'correcto') {
      return item.ajustado_inventario || (conteoReal !== '' && Number(conteoReal) === stockSistema)
    }
    if (executionFilter === 'descuadre') {
      return !item.ajustado_inventario && conteoReal !== '' && Number(conteoReal) !== stockSistema
    }

    return true
  })
}

export function calcularItemsStats(items, conteosDraft) {
  if (!items) return { total: 0, pendientes: 0, correctos: 0, descuadres: 0 }

  let pendientes = 0
  let correctos = 0
  let descuadres = 0

  items.forEach(item => {
    const conteo = conteosDraft[item.id]
    const stockSistema = Number(item.stock_sistema)

    if (item.ajustado_inventario) {
      correctos++
    } else if (conteo === '') {
      pendientes++
    } else if (Number(conteo) === stockSistema) {
      correctos++
    } else {
      descuadres++
    }
  })

  return {
    total: items.length,
    pendientes,
    correctos,
    descuadres
  }
}

export function calcularAjustesPreview(items, conteosDraft) {
  if (!items) return []
  return items.filter(item => {
    const conteo = conteosDraft[item.id]
    return conteo !== '' && Number(conteo) !== Number(item.stock_sistema)
  }).map(item => {
    const conteoVal = Number(conteosDraft[item.id])
    const diff = conteoVal - Number(item.stock_sistema)
    const costoVal = Number(item.costo_unitario || 0)
    return {
      id: item.id,
      nombre: item.nombre_producto,
      referencia: item.referencia,
      stock_sistema: item.stock_sistema,
      stock_real: conteoVal,
      diferencia: diff,
      costo_unitario: costoVal,
      impacto_dinero: diff * costoVal,
      ajustado_inventario: item.ajustado_inventario
    }
  })
}

export function calcularImpactoFinanciero(conteosDraft, items) {
  let sum = 0
  Object.entries(conteosDraft).forEach(([itemId, val]) => {
    if (val === '') return
    const item = items?.find(i => i.id === Number(itemId))
    if (!item || item.ajustado_inventario) return
    const diff = Number(val) - Number(item.stock_sistema)
    sum += (diff * Number(item.costo_unitario || 0))
  })
  return sum
}

// Vista previa del nombre autoincremental "Ajuste N" que asignará el backend
// al crear la próxima devolución (el backend es quien decide el nombre real
// — esto es solo informativo para el modal, calculado del mismo modo).
export function calcularSiguienteNombreDevolucion(devoluciones) {
  let maxNumero = 0
  ;(devoluciones || []).forEach(dev => {
    const match = /^ajuste\s+(\d+)$/i.exec((dev.nombre || '').trim())
    if (match) {
      const numero = parseInt(match[1], 10)
      if (numero > maxNumero) maxNumero = numero
    }
  })
  return `Ajuste ${maxNumero + 1}`
}

// Clasifica un producto de la hoja de conteo según su estado actual, para
// que el componente decida bordes/badge sin repetir la lógica numérica.
export function clasificarItemConteo(item, conteoRaw) {
  const stockSis = Number(item.stock_sistema)

  if (item.ajustado_inventario) {
    const realVal = item.stock_real !== null ? Number(item.stock_real) : stockSis
    const diff = realVal - stockSis
    return { estado: 'ajustado', stockSis, diff, diffCost: null }
  }

  if (conteoRaw === '') {
    return { estado: 'pendiente', stockSis, diff: null, diffCost: null }
  }

  const diff = Number(conteoRaw) - stockSis
  const diffCost = diff * Number(item.costo_unitario || 0)

  if (diff === 0) return { estado: 'coincide', stockSis, diff, diffCost }
  if (diff < 0) return { estado: 'falta', stockSis, diff, diffCost }
  return { estado: 'sobra', stockSis, diff, diffCost }
}
