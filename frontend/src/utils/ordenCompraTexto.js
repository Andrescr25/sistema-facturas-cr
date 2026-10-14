const ESTADOS={borrador:'Borrador',pendiente_enviar:'Pendiente de envío',enviada:'Enviada',parcialmente_recibida:'Recibida parcialmente',recibida:'Recibida'}

export function estadoOrdenCompra(orden) {
  if(orden.estado==='cerrada')return orden.enviada_en?'Cerrada':'Cancelada'
  if(orden.envio_id&&!orden.enviada_en)return 'Envío por verificar'
  return ESTADOS[orden.estado]||orden.estado
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

/** La copia revisada identifica el mismo destino aunque se escriba con espacios
 * o sin prefijo de Costa Rica. La validación final la conserva el servidor. */
export function normalizarTelefonoOrden(telefono) {
  const numero=String(telefono).replace(/\D/g,'')
  return numero.length===8?'506'+numero:numero
}
