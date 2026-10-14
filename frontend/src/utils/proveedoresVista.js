/** Una tarjeta enviada es su propia compra: no hereda el estado de otra
 * tarjeta del mismo proveedor ni ediciones de faltantes actuales. */
export function proveedorEnviado(proveedor) {
  return Boolean(proveedor?.enviada || proveedor?.orden_id)
}

export function ordenarFaltantesProveedores(proveedores) {
  return [...proveedores].sort((a, b) => {
    const enviados = Number(proveedorEnviado(a)) - Number(proveedorEnviado(b))
    if (enviados) return enviados
    if (proveedorEnviado(a)) return (Date.parse(b.enviada_en) || 0) - (Date.parse(a.enviada_en) || 0)
    return a.nombre.localeCompare(b.nombre, 'es')
  })
}

/** Sin revisión todavía no hay conclusión sobre lo que facturó el proveedor. */
export function indicacionFacturacion(facturacion) {
  const cantidad = Number(facturacion?.cantidadFacturada)
  switch (facturacion?.estado) {
    case 'facturado': return { texto: 'Facturado', tono: 'exito' }
    case 'parcial': return { texto: `Facturado parcialmente${Number.isFinite(cantidad) ? ` · ${cantidad}` : ''}`, tono: 'alerta' }
    case 'no_facturado': return { texto: 'No facturado', tono: 'alerta' }
    case 'por_identificar': return { texto: 'Por identificar', tono: 'neutro' }
    default: return null
  }
}

export function cuerpoEnvioProveedor(proveedor, productos, preferirDatosProveedor) {
  if (!proveedor || proveedorEnviado(proveedor)) throw new Error('Esta orden ya no admite otro envío.')
  if (proveedor.revisionReporte == null) throw new Error('Actualizá los faltantes antes de enviar.')
  if (!productos.length) throw new Error('No hay productos para enviar.')
  if (productos.some(p => !Number.isFinite(Number(p.cantidad)) || Number(p.cantidad) <= 0 ||
    !Number.isFinite(Number(p.cantidadOriginal ?? p.cantidad)) || Number(p.cantidadOriginal ?? p.cantidad) <= 0)) {
    throw new Error('Revisá las cantidades antes de enviar.')
  }
  return {
    proveedorId: proveedor.proveedor_id || null,
    cedula: proveedor.cedula || null,
    nombre: proveedor.nombre,
    fechaInicio: proveedor.fechaInicio || null,
    revisionReporte: proveedor.revisionReporte,
    productos: productos.map(p => {
      const copia = { ...p, cantidadOriginal: p.cantidadOriginal ?? p.cantidad }
      // El catálogo no conoce el mapeo del proveedor de un extra manual.
      // Su factor y paquetes los deriva el servidor, con el id propio.
      if (p.agregadoManual) delete copia.factorConversion
      else copia.factorConversion = p.factorConversion || 1
      return copia
    }),
    preferirDatosProveedor
  }
}

export function resultadoEnvioProveedor(resultado) {
  if (resultado?.envioEstado === 'confirmado') return 'confirmado'
  if (resultado?.envioEstado === 'no_enviado') return 'no_enviado'
  if (resultado?.envioEstado === 'incierto' || resultado?.envioEstado === 'enviando') return 'incierto'
  return 'pendiente'
}

/** Otra revisión sólo libera el intento que ya conocemos y que el servidor
 * muestra como una compra separada. Una respuesta perdida no demuestra eso. */
export function intentoSeparadoDelProveedor(intento, proveedor, compras) {
  const comprobaciones = Array.isArray(proveedor?.comprobacionEnvios) ? proveedor.comprobacionEnvios : compras
  return Boolean(proveedor && proveedor.revisionReporte != null) && intento?.estado === 'incierto' && intento.ordenId != null && !proveedorEnviado(proveedor) &&
    proveedor?.revisionReporte !== intento.cuerpo.revisionReporte && comprobaciones.some(compra =>
      compra.enviada === true && String(compra.orden_id) === String(intento.ordenId) &&
      (!compra.envio_id || compra.envio_id === intento.cuerpo.clave) &&
      ['incierto', 'enviada'].includes(compra.estado_envio))
}

/** El producto puede estar en compras de proveedores distintos. Su nota y
 * sus clientes pertenecen a las facturas de ESTE faltante, no a todas las
 * facturas que alguna vez incluyeron el mismo producto. */
export function notasDelProveedor(proveedor, notasPorProducto) {
  const resultado = {}
  for (const producto of proveedor.productos_faltantes || []) {
    const facturas = new Set((producto.origenes || []).filter(o => o.facturaId != null).map(o => String(o.facturaId)))
    const notas = notasPorProducto?.[String(producto.producto_id)] || []
    resultado[String(producto.producto_id)] = notas.flatMap(nota => {
      const origenes = (nota.origenes || []).filter(o => facturas.has(String(o.facturaId)))
      if (!origenes.length) return []
      return [{ nota: nota.nota, origenes, veces: origenes.length, clientes: [...new Set(origenes.map(o => o.cliente).filter(Boolean))] }]
    })
  }
  return resultado
}
