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
      console.log('🔄 Actualizando todo el cache (productos + contactos)...');
      
      const [productos, clientes] = await Promise.all([
        this.actualizarCacheProductos(),
        this.actualizarCacheClientes()
      ]);
      
      console.log(`✅ Cache actualizado: ${productos.total} productos, ${clientes.total} contactos`);
      
      return {
        success: true,
        productos: productos.total,
        clientes: clientes.total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error actualizando cache completo:', error);
      throw error;
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
  async crearFactura(facturaData) {
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
    
    // Intentar sincronizar facturas pendientes
    try {
      await this.sincronizarFacturasPendientes();
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
}

// Singleton
const facturacionService = new FacturacionService();

export default facturacionService;

