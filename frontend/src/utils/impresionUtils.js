/**
 * Normalización de datos de Alegra (referencias/descripciones/precios/
 * impuestos vienen en formas muy variables), formateo, y la lógica pura de
 * armar/validar el payload de edición de una factura. Extraído de
 * Impresion.jsx.
 */

export function extractStringValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString()
  if (typeof value === 'object') {
    const keysPrioridad = ['code', 'reference', 'value', 'label', 'name', 'displayName', 'text']
    for (const key of keysPrioridad) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        return value[key]
      }
    }
    const primerString = Object.values(value).find(val => typeof val === 'string' && val.trim())
    if (primerString) return primerString
  }
  return ''
}

export const getReferenceFromInvoiceItem = (item) => {
  if (!item) return ''
  const candidatos = [
    item.reference,
    item.reference?.code,
    item.reference?.reference,
    item.reference?.value,
    item.code,
    item.sku,
    item.item?.reference,
    item.item?.reference?.code,
    item.item?.code,
    item.item?.sku,
    item.itemReference,
    item.externalReference
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

export const getDescriptionFromInvoiceItem = (item) => {
  if (!item) return ''
  const candidatos = [
    item.description,
    item.name,
    item.item?.name,
    item.reference?.label,
    item.reference?.name
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

export const getReferenceFromSearchProduct = (producto) => {
  if (!producto) return ''
  const candidatos = [
    producto.reference,
    producto.code,
    producto.itemCode,
    producto.reference?.code,
    producto.reference?.value,
    producto.reference?.reference,
    producto.reference?.label,
    producto.sku,
    producto.id
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

export const getDescriptionFromSearchProduct = (producto) => {
  if (!producto) return ''
  const candidatos = [
    producto.description,
    producto.name,
    producto.label,
    producto.reference?.label,
    producto.reference?.name
  ]

  for (const candidato of candidatos) {
    const valor = extractStringValue(candidato).trim()
    if (valor) return valor
  }

  return ''
}

export const getPriceValue = (price) => {
  if (Array.isArray(price)) {
    const main = price.find(p => p.main) || price[0]
    return Number(main?.price ?? 0)
  }
  if (price && typeof price === 'object') {
    return Number(price.price ?? price.value ?? 0)
  }
  return Number(price ?? 0)
}

export const getTaxesArray = (tax) => {
  if (!tax) return []
  if (Array.isArray(tax)) return tax
  if (Array.isArray(tax.taxes)) return tax.taxes
  return [tax]
}

export const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Puntaje de relevancia de un producto contra el término de búsqueda, usado
// para ordenar resultados (coincidencia exacta de referencia > empieza con
// > contiene; luego lo mismo con el nombre).
export function puntuarCoincidenciaProducto(producto, terminoLower) {
  const ref = getReferenceFromSearchProduct(producto).toLowerCase()
  const name = getDescriptionFromSearchProduct(producto).toLowerCase()
  let puntos = 0

  if (ref === terminoLower) puntos += 1000
  if (ref.startsWith(terminoLower)) puntos += 500
  if (ref.includes(terminoLower)) puntos += 200

  if (name === terminoLower) puntos += 150
  if (name.startsWith(terminoLower)) puntos += 120
  if (name.includes(terminoLower)) puntos += 80

  return puntos
}

// Normaliza los items de una factura de Alegra fusionando los ajustes/
// faltantes ya registrados localmente (reduce cantidad y marca los que se
// eliminarán por faltante sin recibir). Extraído de handleIniciarEdicion.
export function normalizarItemsFactura(items, factura) {
  const ajustesDetalle = Array.isArray(factura.ajustes_realizados) ? factura.ajustes_realizados : []
  const faltantesDetalle = Array.isArray(factura.faltantes_detalle) ? factura.faltantes_detalle : []

  // Un producto quitado por faltante puede volver al recuperar la factura.
  const itemsConOriginales = [...items]
  ajustesDetalle.forEach(ajuste => {
    if (ajuste.item_original && !itemsConOriginales.some(item =>
      String(item.item?.id ?? item.productId ?? item.itemId ?? item.id) === String(ajuste.producto_alegra_id))) {
      itemsConOriginales.push(ajuste.item_original)
    }
  })

  return itemsConOriginales.map(item => {
    const reference = getReferenceFromInvoiceItem(item)
    const description = getDescriptionFromInvoiceItem(item)
    const price = getPriceValue(item.price)
    const taxes = getTaxesArray(item.tax)
    const alegraItemId = item.item?.id ?? item.productId ?? item.itemId ?? item.id ?? null

    const coincide = detalle => detalle.producto_alegra_id != null
      ? String(detalle.producto_alegra_id) === String(alegraItemId)
      : String(detalle.producto_codigo ?? '').trim() === reference && Boolean(reference)
    const ajuste = ajustesDetalle.find(coincide)
    const faltante = faltantesDetalle.find(coincide)

    let cantidadOriginal = Number(item.quantity) || 0
    let cantidadFaltante = 0
    let eliminarPorFaltante = false
    let estadoAjuste = ajuste?.estado

    if (ajuste) {
      cantidadOriginal = Number(ajuste.cantidad_original ?? item.quantity) || 0
      const faltanteOriginal = Number(ajuste.cantidad_faltante ?? ajuste.cantidad_faltante_original ?? 0)
      const entregada = Number(ajuste.cantidad_entregada || 0)
      const faltantePendiente = ajuste.estado === 'completo' ? 0 : Math.max(faltanteOriginal - entregada, 0)
      cantidadFaltante = faltantePendiente
      if (faltantePendiente > 0) {
        cantidadOriginal = Math.max(cantidadOriginal - faltantePendiente, 0)
      }
      if (ajuste.cantidad_final_manual != null) cantidadOriginal = Number(ajuste.cantidad_final_manual)
      if (cantidadOriginal === 0) {
        eliminarPorFaltante = true
      }
    } else if (faltante) {
      const faltantePendiente = Number(faltante.cantidad_faltante || 0)
      if (faltantePendiente > 0) {
        cantidadFaltante = faltantePendiente
        cantidadOriginal = Math.max(cantidadOriginal - faltantePendiente, 0)
        eliminarPorFaltante = cantidadOriginal === 0
      }
    }

    return {
      id: item.id ?? null,
      reference,
      description,
      quantity: cantidadOriginal,
      price,
      tax: taxes,
      discount: Number(item.discount) || 0,
      precio_editado: false,
      itemId: item.item?.id ?? alegraItemId,
      alegraItemId,
      item: item.item?.id ? { id: item.item.id } : item.item ?? undefined,
      esNuevo: false,
      cantidad_faltante: cantidadFaltante,
      eliminar_por_faltante: eliminarPorFaltante,
      ajuste_estado: estadoAjuste
    }
  })
}

// Arma el payload que espera el backend a partir de los items editados en
// pantalla. Extraído de handleGuardarFactura.
export function construirPayloadItems(itemsEditados) {
  return itemsEditados.map(item => {
    const descripcion = (item.description ?? '').trim()
    const referencia = (item.reference ?? '').toString().trim()
    const quantity = Number(item.quantity) || 0
    const price = Number(item.price)
    const tax = Array.isArray(item.tax) ? item.tax : getTaxesArray(item.tax)

    const payload = {
      reference: referencia,
      description: descripcion || referencia,
      name: descripcion || referencia,
      quantity,
      price,
      tax,
      discount: Number(item.discount) || 0,
      precio_editado: item.precio_editado === true
    }

    if (item.id) {
      payload.id = item.id
    }

    if (item.item && item.item.id) {
      payload.item = { id: item.item.id }
    } else if (item.itemId) {
      payload.item = { id: item.itemId }
    }

    if (payload.tax.length === 0) {
      delete payload.tax
    }

    delete payload.esNuevo
    if (payload.alegraItemId !== undefined) {
      delete payload.alegraItemId
    }
    if (payload.itemId !== undefined) {
      delete payload.itemId
    }

    return payload
  })
}

// Valida los items ya transformados a payload; devuelve el mensaje de error
// o null si está todo bien. Extraído de handleGuardarFactura.
export function validarItemsParaGuardar(itemsParaGuardar, itemsEditados) {
  if (!itemsParaGuardar.some(item => item.quantity > 0)) {
    return 'La factura debe conservar al menos un producto entregado. Revisá el pedido antes de imprimir.'
  }
  const hayReferenciaVacia = itemsParaGuardar.some(item => !item.reference)
  if (hayReferenciaVacia) {
    return 'Todos los productos deben tener una referencia antes de guardar.'
  }

  const hayCantidadInvalida = itemsParaGuardar.some((item, idx) => {
    const original = itemsEditados[idx]
    const puedeEliminarse = original?.eliminar_por_faltante
    return item.quantity <= 0 && !puedeEliminarse
  })
  if (hayCantidadInvalida) {
    return 'Las cantidades deben ser mayores a cero.'
  }

  if (itemsParaGuardar.some(item => !Number.isFinite(item.price) || item.price < 0)) {
    return 'Los precios deben ser números mayores o iguales a cero.'
  }

  return null
}

export function totalItemsImpresion(items) {
  return items.reduce((suma, item) => {
    const base = Number(item.quantity) * getPriceValue(item.price) * (1 - (Number(item.discount) || 0) / 100)
    const porcentaje = getTaxesArray(item.tax).reduce((total, tax) => total + (Number(tax.percentage) || 0), 0)
    return suma + base * (1 + porcentaje / 100)
  }, 0)
}
