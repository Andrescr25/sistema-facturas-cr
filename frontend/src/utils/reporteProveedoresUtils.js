/**
 * Cálculos puros del reporte de faltantes por proveedor: cantidad final a
 * pedir (considerando ediciones manuales/guardadas), preferencia de datos
 * de PDF, y construcción de la lista de productos para orden de compra
 * (compartida entre "Generar PDF" y "Enviar por WhatsApp", antes duplicada
 * en ambos handlers). Extraído de ReporteProveedores.jsx.
 */

export function getCantidadFinal(proveedorNombre, producto, cantidadOriginal, cantidadesModificadas, cantidadesGuardadas) {
  const pCodigo = producto.codigo || producto.producto_codigo || producto.id
  const key = `${proveedorNombre}-${pCodigo}`
  const cantidadModificada = cantidadesModificadas.get(key)
  const cantidadGuardada = cantidadesGuardadas.get(key)
  return cantidadModificada !== undefined ? cantidadModificada : (cantidadGuardada ? cantidadGuardada.cantidad_modificada : cantidadOriginal)
}

export function usaDatosProveedor(proveedorNombre, preferenciasDatosProveedor) {
  const preferencia = preferenciasDatosProveedor[proveedorNombre]
  return preferencia === undefined ? true : preferencia
}

export function construirProductosParaOrden(proveedor, { productosEliminados, cantidadesModificadas, cantidadesGuardadas, productosAgregados }) {
  const productosParaPDF = proveedor.productos_faltantes
    .filter(producto => !productosEliminados.has(`${proveedor.nombre}-${producto.producto_codigo || producto.codigo}`))
    .map(producto => {
      const key = `${proveedor.nombre}-${producto.producto_codigo || producto.codigo}`
      const mod = cantidadesModificadas.get(key)
      const guardada = cantidadesGuardadas.get(key)
      const cantFinal = mod !== undefined ? mod : (guardada ? guardada.cantidad_modificada : producto.cantidad_faltante)
      const factorConversion = producto.factor_conversion || 1
      const cantProv = factorConversion !== 1 ? Math.ceil(cantFinal / factorConversion) : cantFinal

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
        alegraItemId: producto.alegra_item_id || producto.alegraItemId || null
      }
    })
    .filter(p => p.cantidad > 0)

  const agregados = productosAgregados.get(proveedor.nombre) || []
  agregados.forEach(p => {
    productosParaPDF.push({ codigo: p.codigo, nombre: p.nombre, cantidad: p.cantidad })
  })

  return productosParaPDF
}
