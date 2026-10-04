import api from './api'

export const alegraService = {
  // Test de conexión
  async testConnection() {
    try {
      const response = await api.get('/alegra/test')
      return response.data
    } catch (error) {
      throw new Error(`Error probando conexión: ${error.message}`)
    }
  },

  // Obtener facturas por período
  async getFacturasPorPeriodo(ano, mes, semana) {
    try {
      const response = await api.get(`/alegra/facturas/${ano}/${mes}/${semana}`)
      return response.data
    } catch (error) {
      throw new Error(`Error obteniendo facturas: ${error.message}`)
    }
  },

  // Obtener el siguiente número de consecutivo
  async getSiguienteConsecutivo() {
    try {
      const response = await api.get('/alegra/facturas/siguiente-consecutivo')
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo consecutivo:', error)
      throw new Error(`Error obteniendo consecutivo: ${error.message}`)
    }
  },

  // Visualizar PDF de factura desde Alegra en nueva pestaña
  async visualizarPDFFactura(facturaId) {
    // Abrir ventana ANTES del await para evitar bloqueo del navegador
    const ventana = window.open('about:blank', '_blank');
    
    try {
      // Verificar que tengamos un ID válido
      if (!facturaId || facturaId === 'undefined' || facturaId === 'null') {
        if (ventana) ventana.close();
        throw new Error(`ID de factura inválido: ${facturaId}`);
      }
      
      // Verificar que la ventana se haya abierto
      if (!ventana) {
        throw new Error('No se pudo abrir la ventana. Verifica que no estén bloqueadas las ventanas emergentes.');
      }
      
      // 1. Hacer llamada al backend para obtener la URL del PDF
      const response = await api.get(`/alegra/facturas/${facturaId}/pdf`);
      
      // 2. Verificar que tengamos la URL
      if (!response.data || !response.data.url) {
        ventana.close();
        throw new Error('El servidor no devolvió una URL de PDF válida');
      }
      
      const pdfUrl = response.data.url;
      
      // 3. Redirigir la ventana ya abierta a la URL del PDF
      ventana.location.href = pdfUrl;
      return { success: true };
    } catch (error) {
      console.error('❌ Frontend: Error visualizando PDF:', error);
      if (ventana && !ventana.closed) {
        ventana.close();
      }
      throw new Error(`Error visualizando PDF: ${error.message}`);
    }
  },

  // Buscar facturas por número
  async buscarFacturasPorNumero(numero) {
    try {
      const response = await api.get(`/alegra/facturas/buscar/numero/${numero}`)
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error en búsqueda:', error)
      throw new Error(`Error buscando facturas por número: ${error.message}`)
    }
  },

  // Buscar facturas por cliente
  async buscarFacturasPorCliente(cliente) {
    try {
      const response = await api.get(`/alegra/facturas/buscar/cliente/${encodeURIComponent(cliente)}`)
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error en búsqueda:', error)
      throw new Error(`Error buscando facturas por cliente: ${error.message}`)
    }
  },

  // Obtener factura específica
  async getFactura(id) {
    try {
      const response = await api.get(`/alegra/facturas/${id}`)
      return response.data
    } catch (error) {
      throw new Error(`Error obteniendo factura: ${error.message}`)
    }
  },

  async getInvoiceById(id) {
    try {
      const response = await api.get(`/alegra/facturas/${id}`)
      return response.data
    } catch (error) {
      throw new Error(`Error obteniendo factura en Alegra: ${error.message}`)
    }
  },

  // Obtener productos de Alegra
  async getProductos(page = 1, limit = 30) {
    try {
      const response = await api.get(`/alegra/productos?page=${page}&limit=${limit}`)
      return response.data
    } catch (error) {
      throw new Error(`Error obteniendo productos: ${error.message}`)
    }
  },

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

  async buscarProductosAlegra(query) {
    try {
      const response = await api.get('/alegra/productos/buscar', {
        params: { query }
      })
      return response.data
    } catch (error) {
      throw new Error(`Error buscando productos en Alegra: ${error.message}`)
    }
  },

  // Obtener contactos de Alegra
  async getContactos(page = 1, limit = 30, type = null) {
    try {
      const params = new URLSearchParams({ page, limit })
      if (type) params.append('type', type)

      const response = await api.get(`/alegra/contactos?${params}`)
      return response.data
    } catch (error) {
      throw new Error(`Error obteniendo contactos: ${error.message}`)
    }
  },

  // Sincronizar productos
  async sincronizarProductos(maxProducts = 50, soloNuevos = false, crearProveedores = true) {
    try {
      const response = await api.post('/alegra/sincronizar/productos', {
        maxProducts,
        soloNuevos,
        crearProveedores
      })
      return response.data
    } catch (error) {
      throw new Error(`Error sincronizando productos: ${error.message}`)
    }
  },

  // Obtener productos sin proveedor
  async getProductosSinProveedor() {
    try {
      const response = await api.get('/alegra/productos/sin-proveedor')
      return response.data
    } catch (error) {
      throw new Error(`Error obteniendo productos sin proveedor: ${error.message}`)
    }
  },

  // Asignar proveedor a producto
  async asignarProveedor(productoId, proveedorId) {
    try {
      const response = await api.put(`/alegra/productos/${productoId}/proveedor`, {
        proveedor_id: proveedorId
      })
      return response.data
    } catch (error) {
      throw new Error(`Error asignando proveedor: ${error.message}`)
    }
  },

  // Limpiar faltantes por proveedor de la BD
  async limpiarFaltantesProveedor() {
    try {
      console.log('🗑️ Frontend: Limpiando faltantes de la BD');
      const response = await api.delete('/alegra/reportes/faltantes/proveedor/limpiar')
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
      const response = await api.get('/alegra/catalog/imagenes-por-referencia', {
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
      const response = await api.get('/alegra/reportes/faltantes/cliente')
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
    const response = await api.get('/alegra/reportes/faltantes/notas', { params })
    return response.data
  },
  async getReporteFaltantesProveedor(fechaInicio) {
    try {
      console.log('📋 Frontend: Obteniendo reporte de faltantes por proveedor', fechaInicio ? `desde ${fechaInicio}` : '');
      const params = {};
      if (fechaInicio) params.fecha_inicio = fechaInicio;

      const response = await api.get('/alegra/reportes/faltantes/proveedor', { params })
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
      const response = await api.get('/alegra/orden-compra/cantidades')
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
      const response = await api.post('/alegra/orden-compra/cantidades', { cantidades })
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
      const response = await api.delete('/alegra/orden-compra/cantidades')
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
      const response = await api.post('/alegra/orden-compra/generar-pdf', {
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

      const response = await api.post('/alegra/faltantes/ajustes', payload)
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error guardando ajuste:', error)
      throw new Error(`Error guardando ajuste: ${error.message}`)
    }
  },

  async eliminarAjusteFaltante(faltanteId) {
    try {
      const response = await api.delete(`/alegra/faltantes/ajustes/${faltanteId}`)
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
      const response = await api.get(`/alegra/orden-compra/proveedor-contacto/${encodeURIComponent(nombreProveedor)}`)
      return response.data.telefono || null
    } catch (error) {
      console.error('❌ Error obteniendo teléfono proveedor:', error)
      return null
    }
  },

  // Guardar teléfono de un proveedor
  async guardarTelefonoProveedor(nombreProveedor, telefono, cedulaProveedor = null) {
    try {
      const response = await api.put('/alegra/orden-compra/proveedor-contacto', {
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
      const response = await api.post('/alegra/orden-compra/enviar-whatsapp', {
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
      const response = await api.get('/alegra/orden-compra/enviados', {
        params: desde ? { desde } : {}
      })
      return response.data
    } catch (error) {
      console.error('⚠️ No se pudieron cargar los pedidos ya enviados:', error.message)
      return { success: false, data: [] }
    }
  }

}