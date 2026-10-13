const ESTADOS={borrador:'Borrador',pendiente_enviar:'Pendiente de envío',enviada:'Enviada',parcialmente_recibida:'Recibida parcialmente',recibida:'Recibida'}

export function estadoOrdenCompra(orden) {
  if(orden.estado==='cerrada')return orden.enviada_en?'Cerrada':'Cancelada'
  if(orden.envio_id&&!orden.enviada_en)return 'Envío por verificar'
  return ESTADOS[orden.estado]||orden.estado
}

export function grupoOrdenCompra(orden) {
  if(orden.enviada_en)return 'enviadas'
  if(orden.envio_id)return 'verificar'
  if(['borrador','pendiente_enviar'].includes(orden.estado))return 'pendientes'
  return 'historial'
}

export function lineasDeCantidades(cantidades) {
  return Object.entries(cantidades).filter(([,q])=>q!=='').map(([id,q])=>({productoId:Number(id),cantidadProveedor:Number(q)}))
}

export function cantidadesOrdenValidas(lineas) {
  return lineas.length>0&&lineas.every(l=>Number.isInteger(l.cantidadProveedor)&&l.cantidadProveedor>0&&l.cantidadProveedor<=1000000)
}

export function revisionOrdenCambio(orden,lineas) {
  if(!orden)return false
  const ordenar=ls=>JSON.stringify([...ls].sort((a,b)=>a.productoId-b.productoId))
  return ordenar(lineas)!==ordenar(orden.lineas.map(l=>({productoId:l.producto_id,cantidadProveedor:l.cantidad_proveedor})))
}

export function productosParaRevisar(orden,sugerencia) {
  return orden?orden.lineas.map(l=>({productoId:l.producto_id,nombre:l.producto_nombre,codigo:l.codigo_interno,codigoProveedor:l.codigo_proveedor,
    nombreProveedor:l.nombre_proveedor,factorConversion:l.factor_conversion,origenes:l.origenes,reservada:l.origenes.reduce((s,o)=>s+Number(o.cantidad),0)})):sugerencia?.productos.filter(p=>p.disponible>0)||[]
}
