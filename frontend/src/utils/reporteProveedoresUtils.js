/**
 * Cálculos puros del reporte de faltantes por proveedor: cantidad final a
 * pedir (considerando ediciones manuales/guardadas), preferencia de datos
 * de PDF, y construcción de la lista de productos para orden de compra
 * que se envía desde la revisión de esta interfaz. Extraído de ReporteProveedores.jsx.
 */

/** La referencia se muestra; el id propio distingue productos homónimos. */
export function claveProductoReporte(producto) {
  const id = Number(producto.producto_id || producto.productoId || producto.id)
  return Number.isSafeInteger(id) && id > 0 ? `id:${id}` : null
}

export function keyProductoProveedor(proveedorNombre, producto) {
  const clave = claveProductoReporte(producto)
  return clave ? `${proveedorNombre}-${clave}` : null
}

/** Los temporales antiguos usaban referencias. Sólo se puede aplicar uno
 * cuando esa referencia identifica un único producto dentro del proveedor. */
export function clavesProductoProveedor(proveedorNombre, producto, productos = []) {
  const key = keyProductoProveedor(proveedorNombre, producto)
  const claves = key ? [key] : []
  const codigo = producto.codigo || producto.producto_codigo
  if (codigo && productos.filter(p => (p.codigo || p.producto_codigo) === codigo).length === 1) {
    const antigua = `${proveedorNombre}-${codigo}`
    if (!claves.includes(antigua)) claves.push(antigua)
  }
  return claves
}

export function getCantidadFinal(proveedorNombre, producto, cantidadOriginal, cantidadesModificadas, cantidadesGuardadas, productos = []) {
  const claves = clavesProductoProveedor(proveedorNombre, producto, productos)
  for (const key of claves) if (cantidadesModificadas.has(key)) return cantidadesModificadas.get(key)
  for (const key of claves) if (cantidadesGuardadas.has(key)) return cantidadesGuardadas.get(key).cantidad_modificada
  return cantidadOriginal
}

export function claveTemporalProducto(producto) {
  return producto.claveAlmacenada || claveProductoReporte(producto) || producto.codigo
}

export function productoAgregadoGuardado(item) {
  const id = /^id:([1-9]\d*)$/.exec(item.producto_codigo)?.[1]
  return {
    productoId: item.producto_id || (id ? Number(id) : null),
    claveAlmacenada: item.producto_codigo,
    codigo: item.codigo_interno || (id ? '' : item.producto_codigo),
    nombre: item.producto_nombre,
    cantidad: item.cantidad_modificada,
    agregadoManual: true
  }
}

export function agregarProductoManual(productos, producto) {
  const clave = claveProductoReporte(producto)
  const mismo = p => clave ? claveProductoReporte(p) === clave : claveTemporalProducto(p) === claveTemporalProducto(producto) && p.nombre === producto.nombre
  return productos.some(mismo) ? productos.map(p => mismo(p) ? { ...p, cantidad: Number(cantidadEnMicros(p.cantidad) + cantidadEnMicros(producto.cantidad)) / 1000000 } : p) : [...productos, producto]
}

function cantidadEnMicros(valor) {
  const partes = /^(\d+)(?:\.(\d+))?$/.exec(String(valor).trim())
  const decimales = partes?.[2]?.replace(/0+$/, '') || ''
  if (!partes || decimales.length > 6) throw new Error('La cantidad y la conversión deben ser positivas, con hasta seis decimales.')
  const micros = BigInt(partes[1]) * 1000000n + BigInt(decimales.padEnd(6, '0'))
  if (micros <= 0n) throw new Error('La cantidad y la conversión deben ser positivas.')
  return micros
}

/** .07/.01 en coma flotante queda apenas por encima de 7. La compra debe
 * pedir siete paquetes, no ocho: ambas cantidades usan seis decimales exactos. */
export function cantidadProveedorExacta(cantidadPropia, factorConversion) {
  const propia = cantidadEnMicros(cantidadPropia), factor = cantidadEnMicros(factorConversion)
  const cantidad = Number((propia + factor - 1n) / factor)
  if (!Number.isSafeInteger(cantidad)) throw new Error('La cantidad del proveedor es demasiado grande.')
  return cantidad
}

export function usaDatosProveedor(proveedorNombre, preferenciasDatosProveedor) {
  const preferencia = preferenciasDatosProveedor[proveedorNombre]
  return preferencia === undefined ? true : preferencia
}

export function construirProductosParaOrden(proveedor, { productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados }) {
  const productosParaPDF = proveedor.productos_faltantes
    .filter(producto => !clavesProductoProveedor(proveedor.nombre, producto, proveedor.productos_faltantes).some(key => productosEliminados.has(key)))
    .filter(producto => {
      const cantidad = getCantidadFinal(proveedor.nombre, producto, producto.cantidad_faltante, cantidadesModificadas, cantidadesGuardadas, proveedor.productos_faltantes)
      return cantidad !== 0 && !/^0+(?:\.0+)?$/.test(String(cantidad))
    })
    .map(producto => {
      const cantFinal = getCantidadFinal(proveedor.nombre, producto, producto.cantidad_faltante, cantidadesModificadas, cantidadesGuardadas, proveedor.productos_faltantes)
      const factorConversion = producto.factor_conversion ?? 1
      const cantProv = cantidadProveedorExacta(cantFinal, factorConversion)

      return {
        codigo: producto.codigo_proveedor || producto.producto_codigo || producto.codigo,
        nombre: producto.nombre_proveedor || producto.producto_nombre || producto.nombre,
        codigoInterno: producto.producto_codigo || producto.codigo || null,
        nombreInterno: producto.producto_nombre || producto.nombre || null,
        codigoProveedor: producto.codigo_proveedor || null,
        nombreProveedor: producto.nombre_proveedor || producto.producto_nombre || producto.nombre || null,
        cantidad: cantProv,
        cantidadOriginal: cantFinal,
        factorConversion: factorConversion,
        observaciones: producto.observaciones || '',
        descripcionFactura: producto.descripcion_factura || '',
        mappingId: producto.mapping_id || producto.mappingId || null,
        // El id PROPIO: con él busca el servidor cómo le llama a esto el proveedor.
        productoId: producto.producto_id || producto.productoId || null
      }
    })
    .filter(p => p.cantidad > 0)

  const agregados = productosAgregados.get(proveedor.nombre) || []
  agregados.forEach(p => {
    productosParaPDF.push({ codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad, cantidadOriginal: p.cantidad, productoId: p.productoId || null, codigoInterno: p.codigo, nombreInterno: p.nombre, agregadoManual: true })
  })

  return productosParaPDF
}
