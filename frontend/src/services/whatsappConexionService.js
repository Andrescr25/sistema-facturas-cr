import api from './api'

// WhatsApp adentro del sistema (Baileys): estado, vincular y desvincular.
export async function getEstadoWhatsApp() {
  const { data } = await api.get('/admin/whatsapp')
  return data.data
}

export async function vincularWhatsApp(telefono) {
  const { data } = await api.post('/admin/whatsapp/vincular', { telefono })
  return data.data
}

export async function desvincularWhatsApp() {
  await api.post('/admin/whatsapp/desvincular')
}
