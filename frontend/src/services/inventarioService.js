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

export async function ajustarInventario(id) {
  const response = await api.post(`/inventario-auditorias/${id}/ajustar-inventario`);
  return response.data;
}

export async function resyncAuditoria(id) {
  const response = await api.post(`/inventario-auditorias/${id}/resync`);
  return response.data;
}

// Buscar productos para agregar a una tanda de excesos.
export async function buscarProductosParaTanda(q) {
  const response = await api.get('/inventario-auditorias/buscar-productos', { params: { q } });
  return response.data;
}

// Quitar un producto de una tanda (o de un conteo inicial) antes de aplicarlo.
export async function eliminarItemDeTanda(id, itemId) {
  const response = await api.delete(`/inventario-auditorias/${id}/items/${itemId}`);
  return response.data;
}

export async function getExcesos() {
  const response = await api.get('/inventario-auditorias', { params: { tipo: 'exceso' } });
  return response.data;
}

export async function generarExcesosAhora() {
  // Detección solicitada por el operador sobre existencias y ventas propias.
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

export async function aplicarDescuentoTanda(id, descuentoPorcentaje) {
  const response = await api.post(`/inventario-auditorias/${id}/descuento`, { descuentoPorcentaje });
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

export async function eliminarDescuentoExceso(productoId) {
  const response = await api.delete(`/inventario-auditorias/descuentos/${productoId}`);
  return response.data;
}

// «Quedan N» de un producto en liquidación (2026-11-11): ajusta el inventario.
export async function recontarExceso(productoId, cantidad) {
  const response = await api.put(`/inventario-auditorias/descuentos/${productoId}/quedan`, { cantidad });
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

// "Productos nuevos" del catálogo del agente: lista manual.
export async function getProductosNuevos() {
  const response = await api.get('/inventario-auditorias/productos-nuevos');
  return response.data;
}

export async function buscarProductosNuevos(q) {
  const response = await api.get('/inventario-auditorias/productos-nuevos/buscar', { params: { q } });
  return response.data;
}

export async function agregarProductoNuevo(productoId) {
  const response = await api.post('/inventario-auditorias/productos-nuevos', { productoId });
  return response.data;
}

export async function quitarProductoNuevo(registroId) {
  const response = await api.delete(`/inventario-auditorias/productos-nuevos/registros/${registroId}`);
  return response.data;
}

export async function getExistencias(params = {}) {
  return (await api.get('/inventario-auditorias/existencias', { params })).data;
}
export async function getKardex(productoId, params = {}) {
  return (await api.get(`/inventario-auditorias/kardex/${productoId}`, { params })).data;
}
export async function guardarUmbrales(productoId, stockMinimo, stockObjetivo) {
  return (await api.put(`/inventario-auditorias/stock/${productoId}`, { stockMinimo, stockObjetivo })).data;
}
