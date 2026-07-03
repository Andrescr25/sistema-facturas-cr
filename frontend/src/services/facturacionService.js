/**
 * 🧾 Servicio de Facturación
 * 
 * Maneja la lógica de facturación con soporte offline:
 * - Sincronización con Alegra API
 * - Cache de productos y clientes en IndexedDB
 * - Creación de facturas offline
 * - Sincronización automática cuando hay conexión
 */

import api from './api';
import indexedDBService from './indexedDBService';

class FacturacionService {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    
    // Escuchar cambios de conexión
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  /**
   * Inicializar servicio (cargar cache si existe)
   */
  async init() {
    try {
      await indexedDBService.init();
      console.log('✅ Servicio de facturación inicializado');
      
      // Verificar y limpiar cache corrupto
      const cacheLimpiado = await this.verificarYLimpiarCacheCorrupto();
      if (cacheLimpiado) {
        console.log('🔄 Cache limpiado. Se recargará automáticamente.');
      }
      
      // Si está online, intentar sincronizar facturas pendientes
      if (this.isOnline) {
        await this.sincronizarFacturasPendientes();
        await this.sincronizarEdicionesPendientes();
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error inicializando servicio de facturación:', error);
      throw error;
    }
  }

  /**
   * Verificar y limpiar cache corrupto (reference como objeto)
   */
  async verificarYLimpiarCacheCorrupto() {
    try {
      const productos = await indexedDBService.getProductos();
      
      if (productos.length > 0) {
        // Verificar si el primer producto tiene reference como objeto
        const primerProducto = productos[0];
        if (typeof primerProducto.reference === 'object' && primerProducto.reference !== null) {
          console.warn('⚠️ Cache corrupto detectado (reference como objeto). Limpiando...');
          await indexedDBService.clearAll();
          return true; // Cache limpiado
        }
      }
      
      return false; // Cache OK
    } catch (error) {
      console.error('❌ Error verificando cache:', error);
      return false;
    }
  }

  /**
   * Actualizar cache de productos desde Alegra
   */
  async actualizarCacheProductos() {
    try {
      console.log('📦 Actualizando cache de productos desde Alegra...');
      
      // Verificar y limpiar cache corrupto antes de actualizar
      await this.verificarYLimpiarCacheCorrupto();
      
      const response = await api.get('/alegra/facturacion/items');
      
      if (response.data.success) {
        const productos = response.data.data;
        
        // Normalizar productos antes de guardar
        const productosNormalizados = productos.map((p, index) => {
          // Extraer reference (puede ser objeto, string, o número)
          let reference = '';
          if (typeof p.reference === 'object' && p.reference !== null) {
            reference = p.reference.reference || '';
          } else if (p.reference !== null && p.reference !== undefined) {
            reference = p.reference;
          }
          
          // IMPORTANTE: Convertir a string para preservar ceros a la izquierda (ej: "0005")
          reference = String(reference).trim();
          
          // Extraer precio principal (puede ser array, objeto, o número)
          let price = 0;
          if (Array.isArray(p.price)) {
            // Si es array, buscar el precio principal
            const precioMain = p.price.find(pr => pr.main === true);
            price = precioMain ? precioMain.price : (p.price[0]?.price || 0);
          } else if (typeof p.price === 'object' && p.price !== null) {
            // Si es objeto, extraer el campo price
            price = p.price.price || 0;
          } else {
            // Si es número directo
            price = p.price || 0;
          }
          
          const precioFinal = parseFloat(price) || 0;
          
          // Debug: Log primeros 5 productos para verificar normalización
          if (index < 5) {
            console.log(`📝 Producto ${index + 1}:`, {
              nombre: p.name,
              referenceOriginal: p.reference,
              referenceNormalizada: reference,
              tipoReferenceOriginal: typeof p.reference,
              priceOriginal: p.price,
              priceNormalizado: precioFinal
            });
          }
          
          // IMPORTANTE: No usar spread operator que puede preservar reference original
          // Crear objeto nuevo limpio
          return {
            id: p.id,
            name: p.name,
            description: p.description,
            reference,  // String normalizado
            price: precioFinal,
            status: p.status,
            type: p.type,
            tax: p.tax,
            category: p.category,
            inventory: p.inventory
          };
        });
        
        await indexedDBService.saveProductos(productosNormalizados);
        
        return {
          success: true,
          total: productosNormalizados.length,
          timestamp: response.data.timestamp
        };
      }
      
      throw new Error(response.data.message || 'Error obteniendo productos');
    } catch (error) {
      console.error('❌ Error actualizando cache de productos:', error);
      throw error;
    }
  }

  /**
   * Actualizar cache de clientes desde Alegra
   */
  async actualizarCacheClientes() {
    try {
      console.log('👥 Actualizando cache de contactos (clientes, proveedores, etc.) desde Alegra...');
      
      const response = await api.get('/alegra/facturacion/contacts');
      
      if (response.data.success) {
        const clientes = response.data.data;
        await indexedDBService.saveClientes(clientes);
        
        console.log(`✅ ${clientes.length} contactos guardados en cache`);
        
        return {
          success: true,
          total: clientes.length,
          timestamp: response.data.timestamp
        };
      }
      
      throw new Error(response.data.message || 'Error obteniendo contactos');
    } catch (error) {
      console.error('❌ Error actualizando cache de contactos:', error);
      throw error;
    }
  }

  /**
   * Actualizar todo el cache (productos + contactos)
   */
  async actualizarTodoCache() {
    try {
      console.log('🔄 Actualizando todo el cache (productos + contactos + facturas)...');

      const [productos, clientes, facturas] = await Promise.all([
        this.actualizarCacheProductos(),
        this.actualizarCacheClientes(),
        this.precargarUltimasFacturas()
      ]);

      console.log(`✅ Cache actualizado: ${productos.total} productos, ${clientes.total} contactos, ${facturas.total} facturas`);

      return {
        success: true,
        productos: productos.total,
        clientes: clientes.total,
        facturas: facturas.total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error actualizando cache completo:', error);
      throw error;
    }
  }

  /**
   * Precargar las últimas 60 facturas para edición offline
   */
  async precargarUltimasFacturas() {
    try {
      if (!this.isOnline) {
        console.log('⚠️ Sin conexión, no se pueden precargar facturas');
        return { success: false, total: 0 };
      }

      console.log('🔄 Precargando últimas 60 facturas...');

      // Obtener fecha actual y hace 60 días
      const hoy = new Date();
      const hace60Dias = new Date();
      hace60Dias.setDate(hoy.getDate() - 60);

      const ano = hoy.getFullYear();
      const mes = hoy.getMonth() + 1;

      // Buscar facturas del mes actual y anterior
      const mesAnterior = mes === 1 ? 12 : mes - 1;
      const anoAnterior = mes === 1 ? ano - 1 : ano;

      const response = await api.get(`/alegra/facturas/${ano}/${mes}/todas`);
      let facturas = [];

      if (response.data.success) {
        facturas = response.data.data || [];

        // Si son menos de 60, buscar mes anterior también
        if (facturas.length < 60) {
          try {
            const responseAnterior = await api.get(`/alegra/facturas/${anoAnterior}/${mesAnterior}/todas`);
            if (responseAnterior.data.success) {
              facturas = [...facturas, ...(responseAnterior.data.data || [])];
            }
          } catch (error) {
            console.warn('⚠️ Error obteniendo facturas del mes anterior:', error.message);
          }
        }

        // Ordenar por fecha descendente y tomar las últimas 60
        facturas.sort((a, b) => new Date(b.date) - new Date(a.date));
        facturas = facturas.slice(0, 60);

        // Guardar en cache
        if (facturas.length > 0) {
          const guardadas = await indexedDBService.saveFacturasCache(facturas);
          console.log(`✅ ${guardadas} facturas precargadas para edición offline`);

          return {
            success: true,
            total: guardadas
          };
        }
      }

      return {
        success: true,
        total: 0
      };
    } catch (error) {
      console.error('❌ Error precargando facturas:', error);
      // No lanzar error para no detener la actualización del cache
      return {
        success: false,
        total: 0,
        error: error.message
      };
    }
  }

  /**
   * Obtener productos (desde cache)
   */
  async getProductos() {
    try {
      const productos = await indexedDBService.getProductos();
      return productos;
    } catch (error) {
      console.error('❌ Error obteniendo productos del cache:', error);
      throw error;
    }
  }

  /**
   * Buscar producto por referencia/código
   */
  async buscarProductoPorCodigo(codigo) {
    try {
      console.log(`🔍 Buscando producto con código: "${codigo}"`);
      const producto = await indexedDBService.getProductoByReference(codigo);
      
      if (producto) {
        console.log(`✅ Producto encontrado: ${producto.name} (ref: "${producto.reference}")`);
      } else {
        console.log(`❌ Producto no encontrado con referencia: "${codigo}"`);
      }
      
      return producto;
    } catch (error) {
      console.error('❌ Error buscando producto:', error);
      throw error;
    }
  }

  /**
   * Buscar productos por nombre
   */
  async buscarProductosPorNombre(nombre) {
    try {
      const productos = await indexedDBService.searchProductosByName(nombre);
      return productos;
    } catch (error) {
      console.error('❌ Error buscando productos por nombre:', error);
      throw error;
    }
  }

  /**
   * Obtener clientes (desde cache)
   */
  async getClientes() {
    try {
      const clientes = await indexedDBService.getClientes();
      return clientes;
    } catch (error) {
      console.error('❌ Error obteniendo clientes del cache:', error);
      throw error;
    }
  }

  /**
   * Buscar clientes por nombre
   */
  async buscarClientesPorNombre(nombre) {
    try {
      const clientes = await indexedDBService.searchClientesByName(nombre);
      return clientes;
    } catch (error) {
      console.error('❌ Error buscando clientes:', error);
      throw error;
    }
  }

  /**
   * Obtener impuestos de Alegra
   */
  async getImpuestos() {
    try {
      const response = await api.get('/alegra/facturacion/taxes');
      
      if (response.data.success) {
        return response.data.data;
      }
      
      throw new Error('Error obteniendo impuestos');
    } catch (error) {
      console.error('❌ Error obteniendo impuestos:', error);
      
      // Devolver impuesto por defecto de Costa Rica si falla
      return [
        { id: 3, name: 'IVA 13%', percentage: 13, type: 'IVA' }
      ];
    }
  }

  /**
   * Obtener métodos de pago
   */
  async getMetodosPago() {
    try {
      const response = await api.get('/alegra/facturacion/payment-methods');
      
      if (response.data.success) {
        return response.data.data;
      }
      
      throw new Error('Error obteniendo métodos de pago');
    } catch (error) {
      console.error('❌ Error obteniendo métodos de pago:', error);
      
      // Devolver métodos por defecto si falla
      return [
        { id: 'cash', name: 'Efectivo', type: 'cash' },
        { id: 'credit-card', name: 'Tarjeta de Crédito', type: 'credit-card' },
        { id: 'debit-card', name: 'Tarjeta de Débito', type: 'debit-card' },
        { id: 'transfer', name: 'Transferencia Bancaria', type: 'transfer' }
      ];
    }
  }

  /**
   * Crear factura
   * Si hay internet: envía directamente a Alegra
   * Si no hay internet: guarda localmente y sincroniza después
   */
  async crearFactura(facturaData, facturaVista = null) {
    try {
      console.log('🧾 Creando factura...', {
        online: this.isOnline,
        cliente: facturaData.client,
        items: facturaData.items?.length
      });

      if (this.isOnline) {
        // Intentar crear directamente en Alegra
        try {
          const response = await api.post('/alegra/facturacion/invoices', facturaData);
          
          if (response.data.success) {
            console.log('✅ Factura creada online:', response.data.data.id);

            // Guardar en cache para edición inmediata
            const facturaOnline = {
              ...response.data.data,
              client: response.data.data.client || facturaVista?.cliente || null,
              pendienteSincronizar: false,
              pendienteEdicion: false,
              esLocal: false,
              creadaEn: Date.now()
            };
            await indexedDBService.saveFacturasCache([facturaOnline]);
            
            return {
              success: true,
              online: true,
              data: response.data.data,
              message: 'Factura creada exitosamente en Alegra'
            };
          }
        } catch (error) {
          console.warn('⚠️ Error enviando a Alegra, guardando offline:', error.message);
          // Si falla, guardar offline
        }
      }

      // Modo offline: guardar localmente
      const localId = await indexedDBService.saveFacturaPendiente(facturaData);

      // Guardar versión para edición inmediata
      if (facturaVista) {
        await this.guardarFacturaLocalEnCache({
          ...facturaVista,
          id: `local-${localId}`,
          localId,
          pendienteSincronizar: true,
          origen: 'creacion',
          date: facturaData.date
        });
      }
      
      console.log('💾 Factura guardada localmente:', localId);
      
      return {
        success: true,
        online: false,
        localId: localId,
        message: 'Factura guardada localmente. Se sincronizará cuando haya conexión.'
      };

    } catch (error) {
      console.error('❌ Error creando factura:', error);
      throw error;
    }
  }

  /**
   * Sincronizar facturas pendientes con Alegra
   */
  async sincronizarFacturasPendientes() {
    if (this.syncInProgress) {
      console.log('⏳ Sincronización ya en progreso...');
      return { success: false, sincronizadas: 0, mensaje: 'Sincronización en progreso' };
    }

    try {
      this.syncInProgress = true;
      console.log('🔄 Iniciando sincronización de facturas pendientes...');

      const facturasPendientes = await indexedDBService.getFacturasPendientes();
      
      if (facturasPendientes.length === 0) {
        console.log('✅ No hay facturas pendientes de sincronizar');
        return { success: true, sincronizadas: 0 };
      }

      console.log(`📋 ${facturasPendientes.length} facturas pendientes de sincronizar`);

      const resultados = {
        exitosas: [],
        fallidas: []
      };

      for (const factura of facturasPendientes) {
        try {
          // Intentar crear en Alegra
          const response = await api.post('/alegra/facturacion/invoices', factura);
          
          if (response.data.success) {
            // Marcar como sincronizada
            await indexedDBService.markFacturaSincronizada(
              factura.localId, 
              response.data.data.id
            );

            // Reemplazar factura en cache (eliminar versión local y guardar definitiva)
            if (factura.localId) {
              await indexedDBService.deleteFacturaCache(`local-${factura.localId}`);
            }
            await indexedDBService.saveFacturasCache([response.data.data]);
            
            resultados.exitosas.push({
              localId: factura.localId,
              alegraId: response.data.data.id
            });
            
            console.log(`✅ Factura ${factura.localId} sincronizada (Alegra: ${response.data.data.id})`);
          }
        } catch (error) {
          // Registrar error
          await indexedDBService.markFacturaError(factura.localId, error.message);
          
          resultados.fallidas.push({
            localId: factura.localId,
            error: error.message
          });
          
          console.error(`❌ Error sincronizando factura ${factura.localId}:`, error.message);
        }
      }

      console.log('🎯 Sincronización completada:', {
        exitosas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length
      });

      return {
        success: true,
        sincronizadas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length,
        detalles: resultados
      };

    } catch (error) {
      console.error('❌ Error en sincronización:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Obtener facturas pendientes
   */
  async getFacturasPendientes() {
    try {
      const pendientes = await indexedDBService.getFacturasPendientes();
      return pendientes;
    } catch (error) {
      console.error('❌ Error obteniendo facturas pendientes:', error);
      throw error;
    }
  }

  /**
   * Obtener estadísticas del cache
   */
  async getCacheStats() {
    try {
      const stats = await indexedDBService.getCacheStats();
      return stats;
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Limpiar cache completo
   */
  async limpiarCache() {
    try {
      await indexedDBService.clearAll();
      console.log('🗑️ Cache limpiado');
      return { success: true };
    } catch (error) {
      console.error('❌ Error limpiando cache:', error);
      throw error;
    }
  }

  /**
   * Handler cuando se detecta conexión
   */
  async handleOnline() {
    console.log('🌐 Conexión detectada');
    this.isOnline = true;

    // Intentar sincronizar facturas pendientes y ediciones
    try {
      await Promise.all([
        this.sincronizarFacturasPendientes(),
        this.sincronizarEdicionesPendientes()
      ]);
    } catch (error) {
      console.error('Error en sincronización automática:', error);
    }
  }

  /**
   * Handler cuando se pierde conexión
   */
  handleOffline() {
    console.log('📡 Conexión perdida - modo offline activado');
    this.isOnline = false;
  }

  /**
   * Verificar si hay conexión
   */
  isConnected() {
    return this.isOnline;
  }

  /**
   * ========== MÉTODOS PARA EDICIÓN DE FACTURAS ==========
   */

  /**
   * Buscar facturas (desde API si hay internet, desde cache si no)
   */
  async buscarFacturas(criterio) {
    try {
      console.log('🔍 Buscando facturas...', { online: this.isOnline, criterio });

      if (this.isOnline) {
        // Buscar online y actualizar cache
        try {
          let response;

          if (criterio.numero) {
            // Buscar por número
            response = await api.get(`/alegra/facturas/buscar/numero/${criterio.numero}`);
          } else if (criterio.cliente) {
            // Buscar por cliente
            response = await api.get(`/alegra/facturas/buscar/cliente/${criterio.cliente}`);
          } else if (criterio.periodo) {
            // Buscar por período
            const { ano, mes, semana } = criterio.periodo;
            response = await api.get(`/alegra/facturas/${ano}/${mes}/${semana}`);
          } else {
            throw new Error('Criterio de búsqueda no válido');
          }

          if (response.data.success) {
            const facturas = response.data.data;

            // Guardar en cache para uso offline
            if (facturas.length > 0) {
              await indexedDBService.saveFacturasCache(facturas);
            }

            return facturas;
          }
        } catch (error) {
          console.warn('⚠️ Error buscando online, buscando en cache:', error.message);
          // Si falla, buscar en cache
        }
      }

      // Modo offline: buscar en cache
      if (criterio.numero) {
        return await indexedDBService.searchFacturasByNumber(criterio.numero);
      } else if (criterio.cliente) {
        return await indexedDBService.searchFacturasByClient(criterio.cliente);
      } else {
        return await indexedDBService.getFacturasCache();
      }

    } catch (error) {
      console.error('❌ Error buscando facturas:', error);
      throw error;
    }
  }

  /**
   * Obtener una factura específica por ID
   */
  async getFacturaById(facturaId) {
    try {
      console.log('📋 Obteniendo factura:', facturaId);

      const esLocal = typeof facturaId === 'string' && facturaId.startsWith('local-');
      if (esLocal) {
        return await indexedDBService.getFacturaById(facturaId);
      }

      if (this.isOnline) {
        try {
          const response = await api.get(`/alegra/facturas/${facturaId}`);

          if (response.data.success) {
            const factura = response.data.data;

            // Guardar en cache
            await indexedDBService.saveFacturasCache([factura]);

            return factura;
          }
        } catch (error) {
          console.warn('⚠️ Error obteniendo factura online, buscando en cache:', error.message);
        }
      }

      // Buscar en cache
      return await indexedDBService.getFacturaById(facturaId);

    } catch (error) {
      console.error('❌ Error obteniendo factura:', error);
      throw error;
    }
  }

  /**
   * Editar factura
   * Si hay internet: envía directamente a Alegra
   * Si no hay internet: guarda localmente y sincroniza después
   */
  async editarFactura(facturaId, datosEdicion, facturaVista = null) {
    try {
      console.log('✏️ Editando factura...', {
        online: this.isOnline,
        facturaId,
        cambios: Object.keys(datosEdicion)
      });

      if (this.isOnline) {
        // Intentar editar directamente en Alegra
        try {
          const response = await api.put(`/alegra/facturas/${facturaId}`, datosEdicion);

          if (response.data.success) {
            console.log('✅ Factura editada online:', facturaId);

            // Actualizar cache con la nueva versión
            if (response.data.data) {
              const facturaOnline = {
                ...response.data.data,
                client: response.data.data.client || facturaVista?.cliente || null,
                pendienteSincronizar: false,
                pendienteEdicion: false
              };
              await indexedDBService.saveFacturasCache([facturaOnline]);
            }

            return {
              success: true,
              online: true,
              data: response.data.data,
              message: 'Factura editada exitosamente en Alegra'
            };
          }
        } catch (error) {
          const alegraCode = error.response?.data?.details?.code || error.response?.data?.code;
          const alegraMessage = error.response?.data?.details?.message || error.response?.data?.message || error.message;

          if (alegraCode === 3070 || /no se puede editar/i.test(alegraMessage || '')) {
            console.warn(`⚠️ Alegra no permite editar factura ${facturaId}: ${alegraMessage}`);
            throw new Error('Esta factura no se puede editar en Alegra. Usa Reimpresión o una nota de crédito.');
          }

          console.warn('⚠️ Error enviando edición a Alegra, guardando offline:', alegraMessage);
          // Si falla por otra razón, guardar offline
        }
      }

      // Modo offline: guardar edición localmente
      const localId = await indexedDBService.saveEdicionPendiente(facturaId, datosEdicion);

      if (facturaVista) {
        await this.guardarFacturaLocalEnCache({
          ...facturaVista,
          id: facturaVista.id || facturaId,
          pendienteEdicion: true,
          origen: 'edicion',
          date: facturaVista.date || new Date().toISOString().split('T')[0]
        });
      }

      console.log('💾 Edición guardada localmente:', localId);

      return {
        success: true,
        online: false,
        localId: localId,
        message: 'Edición guardada localmente. Se sincronizará cuando haya conexión.'
      };

    } catch (error) {
      console.error('❌ Error editando factura:', error);
      throw error;
    }
  }

  /**
   * Actualizar factura pendiente antes de sincronizar (modo offline)
   */
  async actualizarFacturaPendiente(localId, facturaData, facturaVista = null) {
    try {
      const numeroLocal = typeof localId === 'string' && localId.startsWith('local-')
        ? parseInt(localId.replace('local-', ''), 10)
        : Number(localId);

      if (Number.isNaN(numeroLocal)) {
        throw new Error('ID local inválido');
      }

      await indexedDBService.updateFacturaPendiente(numeroLocal, facturaData);

      if (facturaVista) {
        await this.guardarFacturaLocalEnCache({
          ...facturaVista,
          id: `local-${numeroLocal}`,
          localId: numeroLocal,
          pendienteSincronizar: true,
          origen: 'creacion'
        });
      }

      return {
        success: true,
        online: false,
        localId: numeroLocal,
        message: 'Factura pendiente actualizada localmente'
      };
    } catch (error) {
      console.error('❌ Error actualizando factura pendiente:', error);
      throw error;
    }
  }

  /**
   * Enviar inmediatamente una factura pendiente (si hay internet)
   */
  async enviarFacturaPendiente(localId, facturaData, facturaVista = null) {
    try {
      const numeroLocal = typeof localId === 'string' && localId.startsWith('local-')
        ? parseInt(localId.replace('local-', ''), 10)
        : Number(localId);

      if (Number.isNaN(numeroLocal)) {
        throw new Error('ID local inválido');
      }

      console.log(`🌐 Enviando factura pendiente ${numeroLocal} directamente a Alegra...`);

      const response = await api.post('/alegra/facturacion/invoices', facturaData);

      if (response.data.success) {
        await indexedDBService.markFacturaSincronizada(numeroLocal, response.data.data.id);
        await indexedDBService.deleteFacturaCache(`local-${numeroLocal}`);

        const facturaOnline = {
          ...response.data.data,
          client: response.data.data.client || facturaVista?.cliente || null,
          pendienteSincronizar: false,
          pendienteEdicion: false,
          esLocal: false
        };
        await indexedDBService.saveFacturasCache([facturaOnline]);

        console.log(`✅ Factura pendiente ${numeroLocal} enviada a Alegra con ID ${response.data.data.id}`);

        return {
          success: true,
          online: true,
          data: response.data.data,
          message: 'Factura enviada exitosamente a Alegra'
        };
      }

      throw new Error(response.data.message || 'Error enviando factura pendiente');
    } catch (error) {
      const alegraCode = error.response?.data?.details?.code || error.response?.data?.code;
      const alegraMessage = error.response?.data?.details?.message || error.response?.data?.message || error.message;

      if (alegraCode === 3070 || /no se puede editar/i.test(alegraMessage || '')) {
        console.warn(`⚠️ Alegra no permite reenviar factura local ${numeroLocal}: ${alegraMessage}`);
        throw new Error('Esta factura no se puede enviar/editar en Alegra. Usa Reimpresión o una nota de crédito.');
      }

      console.error('❌ Error enviando factura pendiente:', alegraMessage);
      throw error;
    }
  }

  /**
   * Sincronizar ediciones pendientes con Alegra
   */
  async sincronizarEdicionesPendientes() {
    if (this.syncInProgress) {
      console.log('⏳ Sincronización ya en progreso...');
      return { success: false, sincronizadas: 0, mensaje: 'Sincronización en progreso' };
    }

    try {
      this.syncInProgress = true;
      console.log('🔄 Iniciando sincronización de ediciones pendientes...');

      const edicionesPendientes = await indexedDBService.getEdicionesPendientes();

      if (edicionesPendientes.length === 0) {
        console.log('✅ No hay ediciones pendientes de sincronizar');
        return { success: true, sincronizadas: 0 };
      }

      console.log(`📋 ${edicionesPendientes.length} ediciones pendientes de sincronizar`);

      const resultados = {
        exitosas: [],
        fallidas: []
      };

      for (const edicion of edicionesPendientes) {
        try {
          // Intentar editar en Alegra
          const response = await api.put(
            `/alegra/facturas/${edicion.facturaId}`,
            edicion.datosEdicion
          );

          if (response.data.success) {
            // Marcar como sincronizada
            await indexedDBService.markEdicionSincronizada(edicion.localId);

            // Actualizar cache con la nueva versión
            if (response.data.data) {
              await indexedDBService.saveFacturasCache([response.data.data]);
            }

            resultados.exitosas.push({
              localId: edicion.localId,
              facturaId: edicion.facturaId
            });

            console.log(`✅ Edición ${edicion.localId} sincronizada (Factura: ${edicion.facturaId})`);
          }
        } catch (error) {
          const alegraCode = error.response?.data?.details?.code || error.response?.data?.code;
          const alegraMessage = error.response?.data?.details?.message || error.response?.data?.message || error.message;

          if (alegraCode === 3070 || /no se puede editar/i.test(alegraMessage || '')) {
            console.warn(`⚠️ Edición ${edicion.localId} descartada: Alegra no permite modificar la factura ${edicion.facturaId}`);
            await indexedDBService.deleteEdicionPendiente(edicion.localId);
            resultados.exitosas.push({
              localId: edicion.localId,
              facturaId: edicion.facturaId,
              nota: 'No editable en Alegra'
            });
            continue;
          }

          // Registrar error
          await indexedDBService.markEdicionError(edicion.localId, alegraMessage);

          resultados.fallidas.push({
            localId: edicion.localId,
            facturaId: edicion.facturaId,
            error: alegraMessage
          });

          console.error(`❌ Error sincronizando edición ${edicion.localId}:`, alegraMessage);
        }
      }

      console.log('🎯 Sincronización de ediciones completada:', {
        exitosas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length
      });

      return {
        success: true,
        sincronizadas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length,
        detalles: resultados
      };

    } catch (error) {
      console.error('❌ Error en sincronización de ediciones:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Obtener ediciones pendientes
   */
  async getEdicionesPendientes() {
    try {
      const pendientes = await indexedDBService.getEdicionesPendientes();
      return pendientes;
    } catch (error) {
      console.error('❌ Error obteniendo ediciones pendientes:', error);
      throw error;
    }
  }

  async eliminarEdicionPendiente(localId, facturaId = null) {
    await indexedDBService.deleteEdicionPendiente(localId);

    if (facturaId) {
      const factura = await indexedDBService.getFacturaById(facturaId);
      if (factura) {
        factura.pendienteEdicion = false;
        await indexedDBService.saveFacturasCache([factura]);
      }
    }
  }

  async guardarFacturaLocalEnCache(facturaVista) {
    if (!facturaVista) return;

    try {
      const numeroTemporal = facturaVista.numberTemplate?.fullNumber ||
        facturaVista.numeroTemporal ||
        facturaVista.id ||
        `LOCAL-${Date.now()}`;

      const facturaCache = {
        id: facturaVista.id || numeroTemporal,
        localId: facturaVista.localId || null,
        numberTemplate: facturaVista.numberTemplate || { fullNumber: numeroTemporal },
        client: facturaVista.cliente || facturaVista.client || null,
        items: facturaVista.items || [],
        total: facturaVista.total || 0,
        observations: facturaVista.observaciones || '',
        date: facturaVista.date || new Date().toISOString().split('T')[0],
        status: facturaVista.estado || facturaVista.status || 'open',
        pendienteSincronizar: Boolean(facturaVista.pendienteSincronizar),
        pendienteEdicion: Boolean(facturaVista.pendienteEdicion),
        origen: facturaVista.origen || null,
        updatedAtLocal: Date.now()
      };

      await indexedDBService.saveFacturasCache([facturaCache]);
    } catch (error) {
      console.error('❌ Error guardando factura en cache local:', error);
    }
  }

  /**
   * Obtener facturas precargadas del cache (para edición offline)
   */
  async getFacturasPrecargadas() {
    try {
      const facturas = await indexedDBService.getFacturasCache();
      
      // Filtrar duplicados históricos por ID (casteado a String)
      const vistos = new Set();
      const facturasUnicas = [];
      
      for (const f of facturas) {
        if (!f || !f.id) continue;
        const key = String(f.id);
        if (!vistos.has(key)) {
          vistos.add(key);
          facturasUnicas.push(f);
        }
      }

      // Ordenar por fecha descendente (más recientes primero)
      facturasUnicas.sort((a, b) => new Date(b.date) - new Date(a.date));
      return facturasUnicas;
    } catch (error) {
      console.error('❌ Error obteniendo facturas precargadas:', error);
      throw error;
    }
  }
}

// Singleton
const facturacionService = new FacturacionService();

export default facturacionService;

