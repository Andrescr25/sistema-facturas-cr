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
      console.log('🔢 Frontend: Obteniendo siguiente consecutivo...');
      const response = await api.get('/alegra/facturas/siguiente-consecutivo');
      console.log('✅ Frontend: Consecutivo obtenido:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo consecutivo:', error);
      throw new Error(`Error obteniendo consecutivo: ${error.message}`);
    }
  },

  // Visualizar PDF de factura desde Alegra en nueva pestaña
  async visualizarPDFFactura(facturaId) {
    // Abrir ventana ANTES del await para evitar bloqueo del navegador
    const ventana = window.open('about:blank', '_blank');
    
    try {
      console.log('📄 Frontend: Obteniendo URL del PDF de factura ID:', facturaId);
      
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
      console.log('🔗 Llamando al endpoint /alegra/facturas/:id/pdf...');
      const response = await api.get(`/alegra/facturas/${facturaId}/pdf`);
      
      console.log('📥 Respuesta del backend:', response.data);
      
      // 2. Verificar que tengamos la URL
      if (!response.data || !response.data.url) {
        ventana.close();
        throw new Error('El servidor no devolvió una URL de PDF válida');
      }
      
      const pdfUrl = response.data.url;
      console.log('🔗 URL del PDF obtenida:', pdfUrl);
      console.log('📋 Número de factura:', response.data.invoiceNumber);
      
      // 3. Redirigir la ventana ya abierta a la URL del PDF
      ventana.location.href = pdfUrl;
      
      console.log('✅ Frontend: PDF abierto en nueva pestaña');
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
      console.log('🔍 Frontend: Buscando facturas por número:', numero);
      const response = await api.get(`/alegra/facturas/buscar/numero/${numero}`)
      console.log('✅ Frontend: Respuesta recibida:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error en búsqueda:', error);
      throw new Error(`Error buscando facturas por número: ${error.message}`)
    }
  },

  // Buscar facturas por cliente
  async buscarFacturasPorCliente(cliente) {
    try {
      console.log('🔍 Frontend: Buscando facturas por cliente:', cliente);
      const response = await api.get(`/alegra/facturas/buscar/cliente/${encodeURIComponent(cliente)}`)
      console.log('✅ Frontend: Respuesta recibida:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error en búsqueda:', error);
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

  // Obtener factura para registrar faltantes
  async getFacturaDetalle(id) {
    try {
      console.log('🔍 Frontend: Obteniendo detalle de factura:', id);
      const response = await api.get(`/alegra/facturas/detalle/${id}`)
      console.log('✅ Frontend: Factura detalle recibida:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo factura:', error);
      throw new Error(`Error obteniendo factura: ${error.message}`)
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

  // Obtener estadísticas de sincronización
  async getEstadisticasSincronizacion() {
    try {
      const response = await api.get('/alegra/estadisticas/sincronizacion')
      return response.data
    } catch (error) {
      throw new Error(`Error obteniendo estadísticas: ${error.message}`)
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

  // Actualizar factura en Alegra
  async actualizarFactura(facturaId, ajustes) {
    try {
      console.log('🔄 Frontend: Actualizando factura en Alegra:', facturaId);
      const response = await api.put(`/alegra/facturas/${facturaId}/actualizar-alegra`, {
        ajustes
      })
      console.log('✅ Frontend: Factura actualizada:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error actualizando factura:', error);
      throw new Error(`Error actualizando factura: ${error.message}`)
    }
  },

  // Limpiar facturas listas
  async limpiarFacturas(facturasHistorial, facturasReimpresion) {
    try {
      console.log('🧹 Frontend: Enviando facturas para limpieza');
      const response = await api.post('/alegra/facturas/limpiar', {
        facturas_historial: facturasHistorial,
        facturas_reimpresion: facturasReimpresion,
        procesado_por: 'Usuario'
      })
      console.log('✅ Frontend: Limpieza completada:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error en limpieza:', error);
      throw new Error(`Error limpiando facturas: ${error.message}`)
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

  // Procesar factura individual
  async procesarFacturaIndividual(factura, itemsEditados = null) {
    try {
      console.log('📋 Frontend: Procesando factura individual:', factura.numero_factura);

      // 🔧 CORREGIDO: Manejar ambos casos:
      // 1. Desde Reimpresion: factura.ajustes_realizados, factura.requiere_actualizacion
      // 2. Desde ReporteClientes: factura.ajustes, factura.estado
      const ajustes = factura.ajustes || factura.ajustes_realizados || [];
      
      // Determinar estado: si viene desde ReporteClientes con estado explícito, usarlo
      // Si no, calcular basado en requiere_actualizacion
      let estado;
      if (factura.estado) {
        // Viene desde ReporteClientes con estado ya calculado
        estado = factura.estado;
      } else {
        // Viene desde Reimpresion, calcular basado en requiere_actualizacion
        estado = factura.requiere_actualizacion ? 'requiere_reimpresion' : 'resuelto';
      }

      // Construir payload con los campos que espera el backend
      const payload = {
        alegra_id: factura.alegra_id,
        numero_factura: factura.numero_factura,
        cliente_nombre: factura.cliente_nombre,
        fecha_emision: factura.fecha_emision,
        ajustes: ajustes,
        estado: estado,  // Backend espera string que contenga 'requiere_reimpresion'
        items_editados: itemsEditados,  // ← pasar items editados si existen
        marcar_como_procesada: factura.marcar_como_procesada !== undefined ? factura.marcar_como_procesada : false  // Por defecto false (desde ReporteClientes)
      };

      console.log('📤 Payload enviado:', payload);

      const response = await api.post('/alegra/facturas/procesar-individual', payload)
      console.log('✅ Frontend: Factura procesada:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error procesando factura:', error);
      throw new Error(`Error procesando factura: ${error.message}`)
    }
  },

  // Actualización masiva de facturas en Alegra
  async actualizarFacturasMasivo(facturasPendientes) {
    try {
      console.log('🖨️ Frontend: Iniciando actualización masiva');
      const response = await api.post('/alegra/facturas/actualizar-masivo', {
        facturas: facturasPendientes
      })
      console.log('✅ Frontend: Actualización masiva completada:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error en actualización masiva:', error);
      throw new Error(`Error en actualización masiva: ${error.message}`)
    }
  },

  async recuperarFactura(facturaId) {
    try {
      console.log('🔄 Frontend: Recuperando factura procesada:', facturaId);
      const response = await api.post(`/alegra/facturas/${facturaId}/recuperar`)
      console.log('✅ Frontend: Factura recuperada:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error recuperando factura:', error);
      throw new Error(`Error recuperando factura: ${error.message}`)
    }
  },

  async marcarFacturaPendiente(facturaId, motivo) {
    try {
      console.log('⏳ Frontend: Marcando factura como pendiente:', facturaId);
      const response = await api.post(`/alegra/facturas/${facturaId}/pendiente`, { motivo })
      console.log('✅ Frontend: Factura marcada pendiente:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error marcando factura pendiente:', error);
      throw new Error(`Error marcando factura pendiente: ${error.message}`)
    }
  },

  async quitarFacturaPendiente(facturaId) {
    try {
      console.log('⏹️ Frontend: Quitando estado pendiente a factura:', facturaId);
      const response = await api.delete(`/alegra/facturas/${facturaId}/pendiente`)
      console.log('✅ Frontend: Estado pendiente removido:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error removiendo estado pendiente:', error);
      throw new Error(`Error removiendo estado pendiente: ${error.message}`)
    }
  },

  // Eliminar facturas procesadas permanentemente (incluye observaciones adicionales)
  async eliminarFacturasProceadas(facturasIds) {
    try {
      console.log('🗑️ Frontend: Eliminando facturas procesadas');
      const response = await api.post('/alegra/facturas/eliminar-procesadas', {
        facturas_ids: facturasIds
      })
      console.log('✅ Frontend: Facturas eliminadas (incluye observaciones adicionales):', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error eliminando facturas:', error);
      throw new Error(`Error eliminando facturas: ${error.message}`)
    }
  },


  // Obtener facturas pendientes de reimpresión
  async getFacturasPendientesReimpresion() {
    try {
      console.log('📋 Frontend: Obteniendo facturas pendientes de reimpresión');
      const response = await api.get('/alegra/facturas/pendientes-reimpresion')
      console.log('✅ Frontend: Facturas pendientes obtenidas:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo facturas pendientes:', error);
      throw new Error(`Error obteniendo facturas pendientes: ${error.message}`)
    }
  },

  // Obtener facturas procesadas (recuperables últimos 7 días)
  async getFacturasProcesadasReimpresion() {
    try {
      console.log('📋 Frontend: Obteniendo facturas procesadas (últimos 7 días)');
      const response = await api.get('/alegra/facturas/procesadas-reimpresion')
      console.log('✅ Frontend: Facturas procesadas obtenidas:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo facturas procesadas:', error);
      throw new Error(`Error obteniendo facturas procesadas: ${error.message}`)
    }
  },

  // ❌ COMENTADO: Métodos duplicados que estaban sobrescribiendo a los métodos principales
  // Estos métodos no se usan actualmente - el flujo principal usa los métodos en líneas 250 y 277
  /*
  // Procesar factura individual con actualización de precios
  async procesarFacturaIndividual(factura, itemsEditados = null) {
    try {
      console.log('🖨️ Frontend: Procesando factura individual:', factura.numero_factura);
      const response = await api.post('/alegra/facturas/procesar-individual', {
        factura,
        items_editados: itemsEditados
      })
      console.log('✅ Frontend: Factura procesada:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error procesando factura individual:', error);
      throw new Error(`Error procesando factura: ${error.message}`)
    }
  },

  // Recuperar factura procesada
  async recuperarFactura(alegraId) {
    try {
      console.log('🔄 Frontend: Recuperando factura:', alegraId);
      const response = await api.post(`/alegra/facturas/${alegraId}/recuperar`)
      console.log('✅ Frontend: Factura recuperada:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error recuperando factura:', error);
      throw new Error(`Error recuperando factura: ${error.message}`)
    }
  },
  */

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
  async getReporteFaltantesProveedor() {
    try {
      console.log('📋 Frontend: Obteniendo reporte de faltantes por proveedor');
      const response = await api.get('/alegra/reportes/faltantes/proveedor')
      console.log('✅ Frontend: Reporte de proveedores obtenido:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo reporte de proveedores:', error);
      throw new Error(`Error obteniendo reporte de proveedores: ${error.message}`)
    }
  },

  // Obtener historial de procesamientos
  async getHistorialProcesos() {
    try {
      console.log('📚 Frontend: Obteniendo historial de procesamientos');
      const response = await api.get('/alegra/reimpresion/historial')
      console.log('✅ Frontend: Historial obtenido:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo historial:', error);
      throw new Error(`Error obteniendo historial: ${error.message}`)
    }
  },

  // Registrar faltantes de una factura
  async registrarFaltantes(facturaId, faltantes, registradoPor = 'Usuario', observacionesAdicionales = '') {
    try {
      console.log('📝 Frontend: Registrando faltantes para factura:', facturaId);
      const response = await api.post(`/alegra/facturas/${facturaId}/faltantes`, {
        faltantes,
        registrado_por: registradoPor,
        observaciones_adicionales: observacionesAdicionales
      })
      console.log('✅ Frontend: Faltantes registrados:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error registrando faltantes:', error);
      throw new Error(`Error registrando faltantes: ${error.message}`)
    }
  },

  // Limpiar historial de procesamientos
  async limpiarHistorial() {
    try {
      console.log('🗑️ Frontend: Limpiando historial de procesamientos');
      const response = await api.delete('/alegra/reimpresion/historial')
      console.log('✅ Frontend: Historial limpiado:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error limpiando historial:', error);
      throw new Error(`Error limpiando historial: ${error.message}`)
    }
  },

  // Obtener encargos especiales
  async getEncargosEspeciales() {
    try {
      console.log('📋 Frontend: Obteniendo encargos especiales');
      const response = await api.get('/alegra/reportes/encargos-especiales')
      console.log('✅ Frontend: Encargos especiales obtenidos:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo encargos especiales:', error);
      throw new Error(`Error obteniendo encargos especiales: ${error.message}`)
    }
  },

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
  async generarPDFOrdenCompra(proveedor, productos) {
    try {
      console.log('📄 Frontend: Generando PDF para:', proveedor);
      const response = await api.post('/alegra/orden-compra/generar-pdf', {
        proveedor,
        productos
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
  async getCantidadSugerida(proveedor_id) {
    try {
      console.log('🧠 Frontend: Obteniendo cantidad sugerida para proveedor:', proveedor_id);
      // CAMBIO: Llamar directamente al endpoint sin pasar por /alegra/
      const response = await api.get(`/reportes/cantidad-sugerida?proveedor_id=${proveedor_id}`)
      console.log('✅ Frontend: Cantidad sugerida obtenida:', response.data);
      return response.data
    } catch (error) {
      console.error('❌ Frontend: Error obteniendo cantidad sugerida:', error);
      throw new Error(`Error obteniendo cantidad sugerida: ${error.message}`)
    }
  },

  async guardarAjusteFaltante({ faltanteId, cantidadEntregada, estado, requiereActualizacion }) {
    try {
      const payload = {
        faltante_id: faltanteId,
        cantidad_entregada: cantidadEntregada,
        estado,
        requiere_actualizacion: requiereActualizacion
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
  }

}