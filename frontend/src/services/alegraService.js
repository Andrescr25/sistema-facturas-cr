import api from './api'

export const alegraService = {
  // Acá vivían las llamadas a las rutas viejas de Alegra para facturas,
  // productos, contactos y sincronización (`/alegra/facturas/*`,
  // `/alegra/productos*`, `/alegra/contactos`, `/alegra/sincronizar/productos`,
  // `/alegra/test`). Se retiraron el 2026-10-04: ninguna pantalla las llamaba.
  // Facturación trabaja sobre la factura propia (facturacionService).

  async buscarProductosRevision(query) {
    try {
      const response = await api.get('/productos-revision/buscar', {
        params: { q: query }
      })
      return response.data
    } catch (error) {
      throw new Error(`Error buscando productos: ${error.message}`)
    }
  },

  // La cola de impresión y Facturas en Bodega van por la factura PROPIA
  // (colaImpresionService.js, bodegaPropiaService.js). Los métodos de acá que
  // iban por el id de Alegra —procesar, recuperar, listas de la cola, bodega—
  // se retiraron el 2026-09-30 junto con sus rutas.

  async getImagenesPorReferencia(referencias) {
    try {
      if (!referencias || referencias.length === 0) return { success: true, data: [] };
      // Del maestro propio: las fotos de la caché de Alegra son direcciones
      // firmadas que vencen, y en esta rama ya están vencidas.
      const response = await api.get('/catalogos/imagenes-por-referencia', {
        params: { referencias: referencias.join(',') }
      });
      return response.data;
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo imágenes por referencia:', error);
      return { success: false, data: [] };
    }
  },

  // Obtener reporte de faltantes por cliente
  async getReporteFaltantesCliente(filtros = {}) {
    try {
      console.log('📋 Frontend: Obteniendo reporte de faltantes por cliente');
      const response = await api.get('/reportes/faltantes/cliente', { params: filtros })
      console.log('✅ Frontend: Reporte de clientes obtenido:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo reporte de clientes:', error);
      throw new Error(`Error obteniendo reporte de clientes: ${error.message}`)
    }
  },

  // Obtener reporte de faltantes por proveedor

  /**
   * Las notas que se le escribieron a cada producto al facturarlo.
   *
   * Va aparte del reporte a propósito: el reporte sale de la base local y
   * carga rápido, y esto tiene que ir a Alegra. Si fallan las notas, el
   * reporte se sigue viendo.
   */
  async getNotasDeFaltantes(fechaInicio = null, filtros = {}) {
    const params = { ...filtros, ...(fechaInicio ? { fecha_inicio: fechaInicio } : {}) }
    const response = await api.get('/reportes/faltantes/notas', { params })
    return response.data
  },
  async getReporteFaltantesProveedor(fechaInicio, filtros = {}) {
    try {
      console.log('📋 Frontend: Obteniendo reporte de faltantes por proveedor', fechaInicio ? `desde ${fechaInicio}` : '');
      const params = { ...filtros };
      if (fechaInicio) params.fecha_inicio = fechaInicio;

      const response = await api.get('/reportes/faltantes/proveedor', { params })
      console.log('✅ Frontend: Reporte de proveedores obtenido:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo reporte de proveedores:', error);
      throw new Error(`Error obteniendo reporte de proveedores: ${error.message}`)
    }
  },

  // Registrar faltantes de una factura

  // Obtener encargos especiales

  // Obtener cantidades modificadas para orden de compra  
  async getCantidadesModificadas() {
    try {
      console.log('📋 Frontend: Obteniendo cantidades modificadas');
      const response = await api.get('/orden-compra/cantidades')
      console.log('✅ Frontend: Cantidades obtenidas:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo cantidades:', error);
      throw new Error(`Error obteniendo cantidades: ${error.message}`)
    }
  },

  // Guardar cantidades modificadas
  async guardarCantidadesModificadas(cantidades) {
    try {
      console.log('💾 Frontend: Guardando cantidades modificadas:', cantidades.length);
      const response = await api.post('/orden-compra/cantidades', { cantidades })
      console.log('✅ Frontend: Cantidades guardadas:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error guardando cantidades:', error);
      throw new Error(`Error guardando cantidades: ${error.message}`)
    }
  },

  async guardarAjusteFaltante({ faltanteId, cantidadEntregada, estado, requiereActualizacion, revisado }) {
    try {
      const payload = {
        faltante_id: faltanteId,
        cantidad_entregada: cantidadEntregada,
        estado,
        requiere_actualizacion: requiereActualizacion,
        revisado
      }

      const response = await api.post('/faltantes/ajustes', payload)
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error guardando ajuste:', error)
      throw new Error(`Error guardando ajuste: ${error.message}`)
    }
  },

  async eliminarAjusteFaltante(faltanteId) {
    try {
      const response = await api.delete(`/faltantes/ajustes/${faltanteId}`)
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error eliminando ajuste:', error)
      throw new Error(`Error eliminando ajuste: ${error.message}`)
    }
  },

}