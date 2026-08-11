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

export async function getExcesos() {
  const response = await api.get('/inventario-auditorias', { params: { tipo: 'exceso' } });
  return response.data;
}

export async function generarExcesosAhora() {
  // Corre en vivo contra Alegra (stock de todo el catálogo) y puede tardar
  // varios minutos — timeout largo a propósito.
  const response = await api.post('/inventario-auditorias/generar-excesos', {}, { timeout: 10 * 60 * 1000 });
  return response.data;
}

export async function actualizarItemExceso(id, itemId, payload) {
  const response = await api.patch(`/inventario-auditorias/${id}/items/${itemId}/exceso`, payload);
  return response.data;
}

// --- Control manual de excesos ---
// La detección automática no ve todo (temporada que pasó, proveedor que ya no
// se trabaja, empaque dañado); estas rutas dejan armar y corregir a mano sin
// alterar la detección automática.

export async function crearExcesoManual() {
  const response = await api.post('/inventario-auditorias/excesos');
  return response.data;
}

export async function eliminarExceso(id) {
  const response = await api.delete(`/inventario-auditorias/${id}`);
  return response.data;
}

export async function agregarItemExceso(id, item) {
  const response = await api.post(`/inventario-auditorias/${id}/items-exceso`, item);
  return response.data;
}

export async function getDescuentosExceso() {
  const response = await api.get('/inventario-auditorias/descuentos');
  return response.data;
}

export async function guardarDescuentoExceso(payload) {
  const response = await api.post('/inventario-auditorias/descuentos', payload);
  return response.data;
}

export async function eliminarDescuentoExceso(alegraItemId) {
  const response = await api.delete(`/inventario-auditorias/descuentos/${alegraItemId}`);
  return response.data;
}

export async function guardarConteoIndividual(id, itemId, stockReal) {
  const response = await api.patch(`/inventario-auditorias/${id}/items/${itemId}/conteo`, { stockReal });
  return response.data;
}

export async function getRegalos() {
  const response = await api.get('/inventario-auditorias/regalos');
  return response.data;
}
