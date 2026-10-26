// La factura de compra cargada a mano en Revisión de precios (2026-10-25),
// para lo que llega sin factura electrónica. Cada línea es lo que dice el
// papel: cuántas unidades nuestras y cuánto costó cada una CON IVA. El
// servidor separa el IVA con la tarifa del producto (compraManual.service.js).

export function borradorVacio(hoy) {
  return { proveedorId: '', numero: '', fecha: hoy, condicion: 'contado', plazoDias: '', lineas: [] }
}

const positivo = (v) => { const n = Number(v); return v !== '' && Number.isFinite(n) && n > 0 ? n : null }
const noNegativo = (v) => { const n = Number(v); return v !== '' && Number.isFinite(n) && n >= 0 ? n : null }

/** La línea nueva con el producto elegido; el costo arranca en el último que tiene. */
export function lineaDeProducto(producto) {
  const costo = Number(producto?.cost)
  return {
    productoId: producto.id,
    nombre: producto.name,
    referencia: producto.reference || '',
    cantidad: '',
    costoConIva: Number.isFinite(costo) && costo > 0 ? String(costo) : ''
  }
}

/** Cantidad × costo con IVA, o null mientras falte alguno. */
export function totalDeLinea(linea) {
  const cantidad = positivo(linea.cantidad)
  const costo = noNegativo(linea.costoConIva)
  return cantidad === null || costo === null ? null : Math.round(cantidad * costo * 100) / 100
}

export function totalDeFactura(lineas) {
  return Math.round(lineas.reduce((s, l) => s + (totalDeLinea(l) || 0), 0) * 100) / 100
}

/** Por qué todavía no se puede guardar, en palabras, o null si ya se puede. */
export function motivoParaNoGuardar(b, hoy) {
  if (!b.proveedorId) return 'Elegí el proveedor.'
  if (!String(b.numero).trim()) return 'Falta el número de la factura.'
  if (!b.fecha) return 'Falta la fecha de la factura.'
  if (b.fecha > hoy) return 'La fecha no puede ser después de hoy.'
  if (b.condicion === 'credito' && !(Number.isInteger(Number(b.plazoDias)) && Number(b.plazoDias) >= 1)) return 'Falta el plazo del crédito, en días.'
  if (!b.lineas.length) return 'Agregá al menos un producto.'
  const incompleta = b.lineas.findIndex((l) => totalDeLinea(l) === null)
  if (incompleta >= 0) return `${b.lineas[incompleta].nombre}: falta la cantidad o el costo.`
  return null
}

/** Lo que espera POST /compras/manual. */
export function datosParaEnviar(b) {
  return {
    proveedorId: Number(b.proveedorId),
    numero: String(b.numero).trim(),
    fecha: b.fecha,
    condicion: b.condicion,
    plazoDias: b.condicion === 'credito' ? Number(b.plazoDias) : undefined,
    lineas: b.lineas.map((l) => ({ productoId: l.productoId, cantidad: Number(l.cantidad), costoConIva: Number(l.costoConIva) }))
  }
}
