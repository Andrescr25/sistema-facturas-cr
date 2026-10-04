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

  // Limpiar faltantes por proveedor de la BD
  async limpiarFaltantesProveedor() {
    try {
      console.log('🗑️ Frontend: Limpiando faltantes de la BD');
      const response = await api.delete('/reportes/faltantes/proveedor/limpiar')
      console.log('✅ Frontend: Faltantes eliminados:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error limpiando faltantes:', error);
      throw new Error(`Error limpiando faltantes: ${error.message}`)
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
  async getReporteFaltantesCliente() {
    try {
      console.log('📋 Frontend: Obteniendo reporte de faltantes por cliente');
      const response = await api.get('/reportes/faltantes/cliente')
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
  async getNotasDeFaltantes(fechaInicio = null) {
    const params = fechaInicio ? { fecha_inicio: fechaInicio } : {}
    const response = await api.get('/reportes/faltantes/notas', { params })
    return response.data
  },
  async getReporteFaltantesProveedor(fechaInicio) {
    try {
      console.log('📋 Frontend: Obteniendo reporte de faltantes por proveedor', fechaInicio ? `desde ${fechaInicio}` : '');
      const params = {};
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

  // Limpiar cantidades modificadas
  async limpiarCantidadesModificadas() {
    try {
      console.log('🗑️ Frontend: Limpiando cantidades modificadas');
      const response = await api.delete('/orden-compra/cantidades')
      console.log('✅ Frontend: Cantidades limpiadas:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error limpiando cantidades:', error);
      throw new Error(`Error limpiando cantidades: ${error.message}`)
    }
  },

  // Generar PDF de orden de compra
  async generarPDFOrdenCompra(proveedor, productos, preferirDatosProveedor = true) {
    try {
      console.log('📄 Frontend: Generando PDF para:', proveedor);
      const response = await api.post('/orden-compra/generar-pdf', {
        proveedor,
        productos,
        preferirDatosProveedor
      }, {
        responseType: 'blob' // Importante para recibir el PDF
      })
      console.log('✅ Frontend: PDF generado correctamente');
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error generando PDF:', error);
      throw new Error(`Error generando PDF: ${error.message}`)
    }
  },

  // Obtener cantidad sugerida inteligente por proveedor

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

  // ========================================
  // TELÉFONOS DE WHATSAPP DE PROVEEDORES
  // ========================================

  // Obtener teléfono guardado de un proveedor
  async getTelefonoProveedor(nombreProveedor) {
    try {
      const response = await api.get(`/orden-compra/proveedor-contacto/${encodeURIComponent(nombreProveedor)}`)
      return response.data.telefono || null
    } catch (error) {
      console.error('❌ Error obteniendo teléfono proveedor:', error)
      return null
    }
  },

  // Guardar teléfono de un proveedor
  async guardarTelefonoProveedor(nombreProveedor, telefono, cedulaProveedor = null) {
    try {
      const response = await api.put('/orden-compra/proveedor-contacto', {
        nombreProveedor,
        cedulaProveedor,
        telefono
      })
      return response.data
    } catch (error) {
      console.error('❌ Error guardando teléfono proveedor:', error)
      throw new Error(`Error guardando teléfono: ${error.message}`)
    }
  },

  // Enviar PDF de orden de compra por WhatsApp usando Evolution API
  async enviarOrdenCompraWhatsApp(proveedor, telefono, productos, preferirDatosProveedor = true, mensaje = '') {
    try {
      console.log('📤 Enviando orden de compra por WhatsApp desde frontend...', proveedor);
      const response = await api.post('/orden-compra/enviar-whatsapp', {
        proveedor,
        telefono,
        productos,
        preferirDatosProveedor,
        mensaje
      })
      return response.data
    } catch (error) {
      console.error('❌ Error enviando PDF por WhatsApp:', error)
      const errorMsg = error.response?.data?.message || error.message;
      throw new Error(`Error enviando por WhatsApp: ${errorMsg}`)
    }
  },

  /**
   * A qué proveedores ya se les mandó el pedido desde una fecha.
   *
   * Falla en silencio a propósito: es una marca informativa en la tarjeta,
   * no un dato del que dependa nada. Si el servidor no contesta, el reporte
   * tiene que seguir abriéndose igual, solo que sin las marcas.
   */
  async getOrdenesEnviadas(desde = '') {
    try {
      const response = await api.get('/orden-compra/enviados', {
        params: desde ? { desde } : {}
      })
      return response.data
    } catch (error) {
      console.error('⚠️ No se pudieron cargar los pedidos ya enviados:', error.message)
      return { success: false, data: [] }
    }
  }

}