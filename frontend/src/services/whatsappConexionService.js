import api from './api'

// WhatsApp adentro del sistema (Baileys): estado, vincular y desvincular.
export async function getEstadoWhatsApp() {
  const { data } = await api.get('/admin/whatsapp')
  return data.data
}

/** { modo: 'qr' } → { qr } · { modo: 'codigo', telefono } → { codigo, telefono } */
export async function vincularWhatsApp(pedido) {
  const { data } = await api.post('/admin/whatsapp/vincular', pedido)
  return data.data
}

export async function desvincularWhatsApp() {
  await api.post('/admin/whatsapp/desvincular')
}

// A dónde avisar cuando un cliente hace un pedido en el portal.
export async function getAvisosPedidos() {
  const { data } = await api.get('/admin/avisos-pedidos')
  return data.data
}

export async function guardarAvisosPedidos(destinos) {
  const { data } = await api.put('/admin/avisos-pedidos', destinos)
  return data.data
}

export async function probarAvisosPedidos() {
  const { data } = await api.post('/admin/avisos-pedidos/prueba')
  return data.data
}
