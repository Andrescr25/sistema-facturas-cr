import api from './api';

export async function getAuditorias() {
  const response = await api.get('/inventario-auditorias');
  return response.data;
}

export async function getCategorias() {
  const response = await api.get('/inventario-auditorias/categorias');
  return response.data;
}

export async function crearAuditoria(tipo, categoria = null, nombre = null) {
  const response = await api.post('/inventario-auditorias', { tipo, categoria, nombre });
  return response.data;
}

export async function getAuditoriaDetalle(id) {
  const response = await api.get(`/inventario-auditorias/${id}`);
  return response.data;
}

export async function guardarConteos(id, items) {
  const response = await api.put(`/inventario-auditorias/${id}/items`, { items });
  return response.data;
}

export async function finalizarAuditoria(id, observaciones = '') {
  const response = await api.post(`/inventario-auditorias/${id}/finalizar`, { observaciones });
  return response.data;
}

export async function ajustarAlegra(id) {
  const response = await api.post(`/inventario-auditorias/${id}/ajustar-alegra`);
  return response.data;
}
