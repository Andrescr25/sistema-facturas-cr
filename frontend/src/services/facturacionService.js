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
import indexedDBService from './indexedDBService'
import { nuevaClaveFactura } from './dispositivo';

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
      
      const response = await api.get('/facturacion/items');
      
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
      
      const response = await api.get('/facturacion/contacts');
      
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
      const response = await api.get('/facturacion/taxes');
      
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
      const response = await api.get('/facturacion/payment-methods');
      
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
  /**
   * Por qué falló, dicho para quien está en la caja.
   *
   * El servidor ahora manda el motivo de Alegra en `message`. Se siguen
   * mirando los otros lugares porque las respuestas viejas los usaban, y
   * `error.message` queda de último: es el de axios ("Request failed with
   * status code 400"), que no le dice nada a nadie.
   */
  motivoDelFallo(error) {
    return error?.response?.data?.message
      || error?.response?.data?.details?.message
      || error?.message
      || 'No se pudo crear la factura.'
  }

  /**
   * ¿Alegra dijo que NO, o no se pudo llegar?
   *
   * ESTA DIFERENCIA ES EL BUG QUE SE ARREGLA ACÁ. Cualquier fallo se guardaba
   * en la cola de "sin conexión", incluso un rechazo que no iba a cambiar
   * solo: el cajero tenía internet, veía la factura irse a pendientes y la
   * reintentaba —una llegó a quince intentos— contra un error que Alegra ya
   * había explicado. Era un producto configurado en Alegra para no facturarse
   * sin existencias.
   *
   * Con respuesta 4xx, Alegra contestó que no y no creó nada: hay que
   * arreglar algo antes de volver a mandarla. Sin respuesta, o con 5xx, sí es
   * para la cola. El 408 y el 429 son de tiempo, no de contenido.
   */
  esRechazoDeAlegra(error) {
    const codigo = error?.response?.status
    if (!codigo) return false
    return codigo >= 400 && codigo < 500 && codigo !== 408 && codigo !== 429
  }

  async crearFactura(facturaData, facturaVista = null) {
    try {
      console.log('🧾 Creando factura...', {
        online: this.isOnline,
        cliente: facturaData.client,
        items: facturaData.items?.length
      });

      // La clave nace ACÁ, antes del primer intento, y acompaña a esta factura
      // en todos los que vengan. Si el intento en línea expira, Alegra pudo
      // haberla creado: al guardarla offline conserva esta misma clave, así
      // que la sincronización posterior no crea una segunda.
      const claveIdempotencia = await nuevaClaveFactura();

      if (this.isOnline) {
        // Intentar crear directamente en Alegra
        try {
          const response = await api.post('/facturacion/invoices', {
            ...facturaData,
            claveIdempotencia
          });
          
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
          // Un RECHAZO no se guarda offline: reenviarlo vuelve a fallar. Se
          // dice el motivo y la factura se queda en pantalla, para poder
          // arreglarla —quitar el producto sin existencias, corregir el
          // descuento— y volver a cobrar.
          if (this.esRechazoDeAlegra(error)) {
            const motivo = this.motivoDelFallo(error);
            console.error('⛔ Alegra rechazó la factura:', motivo);
            throw new Error(motivo);
          }
          // Sin respuesta o con Alegra caída: eso sí es para la cola.
          console.warn('⚠️ No se pudo llegar a Alegra, guardando offline:', error.message);
        }
      }

      // Modo offline: guardar localmente
      const localId = await indexedDBService.saveFacturaPendiente(facturaData);

      // La clave de idempotencia se calcula UNA vez y se guarda con la
      // factura. Todos los reintentos —automáticos o a mano, hoy o dentro de
      // tres días— mandan ESTA misma clave, que es lo que le permite al
      // servidor reconocer que ya la recibió en vez de crear otra factura.
      // Recalcularla al reintentar daría una clave nueva cada vez y no
      // serviría de nada.
      await indexedDBService.updateFacturaPendiente(localId, { claveIdempotencia });

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
          const response = await api.post('/facturacion/invoices', {
            ...factura,
            claveIdempotencia: factura.claveIdempotencia
          });
          
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
          // El motivo que se guarda es el de ALEGRA, no el de axios. En la
          // tarjeta de la factura pendiente se leía "Request failed with
          // status code 400", que no dice qué arreglar; ahora dice cuál
          // producto la está trabando.
          const motivo = this.motivoDelFallo(error);
          await indexedDBService.markFacturaError(factura.localId, motivo);

          resultados.fallidas.push({
            localId: factura.localId,
            error: motivo,
            // Con esto la pantalla puede dejar de ofrecer "Reintentar" a secas
            // en algo que no va a pasar hasta que alguien lo arregle.
            rechazada: this.esRechazoDeAlegra(error)
          });

          console.error(`❌ Alegra no aceptó la factura ${factura.localId}:`, motivo);
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
   * Reintentar el envío de una factura pendiente puntual (a diferencia de
   * sincronizarFacturasPendientes, que reintenta todas). Se usa desde el
   * botón "Reintentar" en la pestaña Editar Facturas para forzar el envío
   * ya mismo en vez de esperar el reintento automático periódico.
   */
  async reintentarFacturaPendiente(localId) {
    const numeroLocal = Number(localId);
    const pendientes = await indexedDBService.getFacturasPendientes();
    const factura = pendientes.find(f => f.localId === numeroLocal);

    if (!factura) {
      throw new Error('Factura pendiente no encontrada');
    }

    try {
      const response = await api.post('/facturacion/invoices', {
        ...factura,
        claveIdempotencia: factura.claveIdempotencia
      });

      if (response.data.success) {
        await indexedDBService.markFacturaSincronizada(numeroLocal, response.data.data.id);
        await indexedDBService.deleteFacturaCache(`local-${numeroLocal}`);
        await indexedDBService.saveFacturasCache([response.data.data]);

        return { success: true, data: response.data.data };
      }

      throw new Error(response.data.message || 'Error enviando factura pendiente');
    } catch (error) {
      const motivo = this.motivoDelFallo(error);
      await indexedDBService.markFacturaError(numeroLocal, motivo);
      throw new Error(motivo);
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
    // Se calcula ANTES del try porque el catch de abajo lo nombra al armar el
    // aviso de "Alegra no permite reenviar". Declarado adentro, `const` es de
    // bloque y en el catch no existe: en vez del mensaje que dice qué hacer
    // —usar Reimpresión o una nota de crédito— saltaba un ReferenceError,
    // justo en el camino de error, que es donde menos sirve un segundo fallo.
    const numeroLocal = typeof localId === 'string' && localId.startsWith('local-')
      ? parseInt(localId.replace('local-', ''), 10)
      : Number(localId);

    try {
      if (Number.isNaN(numeroLocal)) {
        throw new Error('ID local inválido');
      }

      console.log(`🌐 Enviando factura pendiente ${numeroLocal} directamente a Alegra...`);

      // La clave se lee del registro guardado, no se recalcula: es la misma
      // que usaron los intentos anteriores, y eso es lo que le permite al
      // servidor reconocer que ya la recibió en vez de crear otra factura.
      const pendientes = await indexedDBService.getFacturasPendientes();
      const guardada = pendientes.find(f => f.localId === numeroLocal);

      const response = await api.post('/facturacion/invoices', {
        ...facturaData,
        claveIdempotencia: guardada?.claveIdempotencia || null
      });

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

  /**
   * Descartar una factura que quedó pendiente de envío (no sincronizada con Alegra).
   * Elimina el registro de la cola de sincronización y su copia en el cache local
   * de edición, para que deje de aparecer como "Pendiente de envío".
   */
  async eliminarFacturaPendiente(localId) {
    await indexedDBService.deleteFactura(localId);
    await indexedDBService.deleteFacturaCache(`local-${localId}`);
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

