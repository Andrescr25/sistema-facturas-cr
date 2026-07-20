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

export async function resyncAuditoria(id) {
  const response = await api.post(`/inventario-auditorias/${id}/resync`);
  return response.data;
}

export async function getDevoluciones() {
  const response = await api.get('/inventario-auditorias', { params: { tipo: 'devolucion' } });
  return response.data;
}

export async function crearDevolucion() {
  const response = await api.post('/inventario-auditorias/devolucion');
  return response.data;
}

export async function buscarProductosDevolucion(q) {
  const response = await api.get('/inventario-auditorias/buscar-productos', { params: { q } });
  return response.data;
}

export async function agregarItemDevolucion(id, item) {
  const response = await api.post(`/inventario-auditorias/${id}/items`, item);
  return response.data;
}

export async function eliminarItemDevolucion(id, itemId) {
  const response = await api.delete(`/inventario-auditorias/${id}/items/${itemId}`);
  return response.data;
}
