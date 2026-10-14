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
  if (codigo && !/^id:[1-9]\d*$/.test(codigo) && productos.filter(p => (p.codigo || p.producto_codigo) === codigo).length === 1) {
    const antigua = `${proveedorNombre}-${codigo}`
    if (!claves.includes(antigua)) claves.push(antigua)
  }
  return claves
}

export function cantidadEnteraValida(valor, minimo = 0) {
  if (!['number', 'string'].includes(typeof valor) || String(valor).trim() === '') return false
  const cantidad = Number(valor)
  return Number.isSafeInteger(cantidad) && cantidad >= minimo && cantidad <= 1000000
}

export function edicionCantidadProducto(proveedorNombre, producto, cantidadesModificadas, cantidadesGuardadas, productos = []) {
  const claves = clavesProductoProveedor(proveedorNombre, producto, productos)
  for (const key of claves) if (cantidadesModificadas.has(key)) return { cantidad: cantidadesModificadas.get(key), guardada: false }
  for (const key of claves) if (cantidadesGuardadas.has(key)) return { cantidad: cantidadesGuardadas.get(key).cantidad_modificada, guardada: true }
  return null
}

export function getCantidadFinal(proveedorNombre, producto, cantidadOriginal, cantidadesModificadas, cantidadesGuardadas, productos = []) {
  const edicion = edicionCantidadProducto(proveedorNombre, producto, cantidadesModificadas, cantidadesGuardadas, productos)
  return edicion ? cantidadEnteraValida(edicion.cantidad) ? Number(edicion.cantidad) : '' : cantidadOriginal
}

export function claveTemporalProducto(producto) {
  return producto.claveAlmacenada || claveProductoReporte(producto) || producto.codigo
}

export function productoAgregadoGuardado(item) {
  return {
    productoId: item.producto_id || null,
    claveAlmacenada: item.producto_codigo,
    codigo: item.codigo_interno || (/^(?:extra:)?id:[1-9]\d*$/.test(item.producto_codigo) ? '' : item.producto_codigo),
    nombre: item.producto_nombre,
    cantidad: item.cantidad_modificada,
    actualizado: item.actualizado || null,
    agregadoManual: true
  }
}

export function agregarProductoManual(productos, producto) {
  if (!cantidadEnteraValida(producto.cantidad, 1)) throw new Error('La cantidad del producto agregado debe ser un número entero positivo.')
  const clave = claveProductoReporte(producto)
  const mismo = p => clave ? claveProductoReporte(p) === clave : claveTemporalProducto(p) === claveTemporalProducto(producto) && p.nombre === producto.nombre
  return productos.some(mismo) ? productos.map(p => {
    if (!mismo(p)) return p
    const cantidad = Number(p.cantidad) + Number(producto.cantidad)
    if (!cantidadEnteraValida(p.cantidad, 1) || !cantidadEnteraValida(cantidad, 1)) throw new Error('Revisá la cantidad entera del producto agregado.')
    return { ...p, cantidad }
  }) : [...productos, producto]
}

/** Una fila temporal representa una acción. Al guardar una edición activa,
 * los extras del mismo producto se incorporan al total; al excluirla se
 * conservan aparte para que recargar no restaure sus orígenes. */
export function construirCantidadGuardada(proveedor, producto, cantidad, productosAgregados, productosEliminados) {
  if (!cantidadEnteraValida(cantidad)) throw new Error('Las cantidades editadas deben ser números enteros de 0 a 1000000.')
  const extras = (productosAgregados.get(proveedor.nombre) || []).filter(p => Number(p.productoId) === Number(producto.producto_id))
  if (extras.some(p => !cantidadEnteraValida(p.cantidad, 1))) throw new Error('Revisá la cantidad entera de los productos agregados.')
  const suma = extras.reduce((n, p) => n + Number(p.cantidad), 0)
  const excluido = Number(cantidad) === 0 || clavesProductoProveedor(proveedor.nombre, producto, proveedor.productos_faltantes).some(key => productosEliminados.has(key))
  const total = excluido ? 0 : Number(cantidad) + suma
  if (!cantidadEnteraValida(total)) throw new Error('La cantidad total debe ser un número entero de hasta 1000000.')
  const claves = extras.map(claveTemporalProducto)
  return {
    proveedor_nombre: proveedor.nombre,
    revisionReporte: proveedor.revisionReporte,
    fechaInicio: proveedor.fechaInicio || null,
    producto_id: Number(producto.producto_id),
    producto_codigo: claveProductoReporte(producto),
    producto_nombre: producto.nombre,
    cantidad_original: producto.cantidad_faltante,
    cantidad_modificada: total,
    extras_sustituidos: excluido ? [] : claves,
    extras_revisados: extras.map(p => ({ codigo: claveTemporalProducto(p), actualizado: p.actualizado || null, cantidad: Number(p.cantidad) })),
    ...(excluido && suma > 0 ? { extra_conservado: { cantidad: suma, productoCodigo: `extra:id:${producto.producto_id}`, clavesOrigen: claves } } : {})
  }
}

export function contextoEdicionProveedor(proveedor) {
  if (!proveedor || proveedor.enviada || proveedor.orden_id || !proveedor.revisionReporte) throw new Error('Actualizá el reporte antes de editar esta compra.')
  return { revisionReporte: proveedor.revisionReporte, fechaInicio: proveedor.fechaInicio || null }
}

export function proveedoresConRevisionCambiada(anteriores, actuales) {
  const pendientes = actuales.filter(p => !p.enviada && !p.orden_id)
  return new Set(anteriores.filter(p => !p.enviada && !p.orden_id).filter(p => {
    const actual = pendientes.find(n => n.nombre === p.nombre)
    return !actual || actual.revisionReporte !== p.revisionReporte || (actual.fechaInicio || null) !== (p.fechaInicio || null)
  }).map(p => p.nombre))
}

export function temporalVigenteProveedor(item, proveedores) {
  const actual = proveedores.find(p => !p.enviada && !p.orden_id && p.nombre === item.proveedor_nombre)
  return !!actual && (!item.revision_reporte || (item.revision_reporte === actual.revisionReporte && (item.fecha_inicio || null) === (actual.fechaInicio || null)))
}

export function retirarEdicionesDeProveedores(coleccion, nombres, proveedores) {
  const conocidos = [...new Set(proveedores.map(p => p.nombre))].sort((a, b) => b.length - a.length)
  const pertenece = key => nombres.has(conocidos.find(nombre => key.startsWith(`${nombre}-`)))
  return coleccion instanceof Map ? new Map([...coleccion].filter(([key]) => !pertenece(key))) : new Set([...coleccion].filter(key => !pertenece(key)))
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
      const edicion = edicionCantidadProducto(proveedor.nombre, producto, cantidadesModificadas, cantidadesGuardadas, proveedor.productos_faltantes)
      if (edicion && !cantidadEnteraValida(edicion.cantidad)) throw new Error('Las cantidades editadas o guardadas deben ser números enteros. Revisalas antes de enviar.')
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
    if (!p.productoId) throw new Error('Retirá el agregado anterior y volvé a elegirlo en el catálogo: no identifica un producto único.')
    if (!cantidadEnteraValida(p.cantidad, 1)) throw new Error('Las cantidades de productos agregados deben ser números enteros positivos.')
    const actual = productosParaPDF.find(l => l.productoId === Number(p.productoId))
    if (actual) {
      const propia = Number(cantidadEnMicros(actual.cantidadOriginal) + cantidadEnMicros(p.cantidad)) / 1000000
      actual.cantidadOriginal = propia
      if (actual.agregadoManual) actual.cantidad = propia
      else {
        actual.cantidad = cantidadProveedorExacta(propia, actual.factorConversion)
        if (!Number.isInteger(propia)) actual.cantidadAdicional = (actual.cantidadAdicional || 0) + Number(p.cantidad)
      }
    } else productosParaPDF.push({ codigo: p.codigo, nombre: p.nombre, cantidad: Number(p.cantidad), cantidadOriginal: Number(p.cantidad), productoId: Number(p.productoId), codigoInterno: p.codigo, nombreInterno: p.nombre, agregadoManual: true })
  })

  return productosParaPDF
}
