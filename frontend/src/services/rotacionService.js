import api from './api'

export async function getRotacionProductos({ semanas = 12, limite = 50 } = {}) {
  const response = await api.get('/alegra/reportes/rotacion/productos', {
    params: { semanas, limite }
  })
  return response.data
}

