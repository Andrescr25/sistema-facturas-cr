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
import { desdeFacturaPropia, desdeConsultaPropia } from './facturaPropiaAdaptador';

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
  /**
   * Actualizar cache de productos desde NUESTRO maestro.
   *
   * Se traduce a la forma que ya usa la pantalla (`name`, `price`, `tax`) y se
   * guarda además `productoId`: es el id que viaja en la factura. Mandar el de
   * Alegra ataría cada venta a una columna que queremos poder dejar vacía.
   */
  async actualizarCacheProductos() {
    try {
      console.log('📦 Actualizando cache de productos desde el maestro propio...');
      await this.verificarYLimpiarCacheCorrupto();

      // El maestro se pide por páginas: son 2.025 productos y traerlos de un
      // solo tirón es lo que hace que la pantalla se sienta trabada.
      const productos = [];
      let pagina = 1;
      let paginas = 1;
      do {
        const response = await api.get('/maestro/productos', { params: { pagina, limite: 500 } });
        const lote = response.data?.data ?? [];
        productos.push(...lote);
        paginas = response.data?.paginacion?.paginas ?? 1;
        pagina += 1;
      } while (pagina <= paginas && pagina <= 20);

      const normalizados = productos.map(p => ({
        id: p.id,
        productoId: p.id,
        alegraId: p.alegra_id || null,
        name: p.nombre,
        description: p.descripcion || '',
        // Texto siempre: la referencia "0005" pierde los ceros como número.
        reference: String(p.referencia ?? '').trim(),
        price: Number(p.precio_sin_iva) || 0,
        status: p.activo ? 'active' : 'inactive',
        type: 'product',
        // La tarifa viene del maestro, que es la que el servidor va a cobrar.
        // Así el cajero ve el mismo impuesto que va a salir impreso.
        tax: p.impuesto_id ? [{ id: p.impuesto_id, percentage: Number(p.tarifa) || 0 }] : [],
        category: p.categoria ? { name: p.categoria } : null,
        inventory: null,
        cabys: p.cabys || null,
        unidad: p.unidad || null
      }));

      await indexedDBService.saveProductos(normalizados);
      return { success: true, total: normalizados.length, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('❌ Error actualizando cache de productos:', error);
      throw error;
    }
  }

  /**
   * Actualizar cache de clientes desde Alegra
   */
  /**
   * Actualizar cache de clientes desde NUESTRA tabla.
   */
  async actualizarCacheClientes() {
    try {
      console.log('👥 Actualizando cache de clientes desde la base propia...');

      const clientes = [];
      let pagina = 1;
      let paginas = 1;
      do {
        const response = await api.get('/clientes', { params: { pagina, limite: 500 } });
        const lote = response.data?.data ?? [];
        clientes.push(...lote);
        paginas = response.data?.paginacion?.paginas ?? 1;
        pagina += 1;
      } while (pagina <= paginas && pagina <= 20);

      const normalizados = clientes.map(c => ({
        id: c.id,
        clienteId: c.id,
        alegraId: c.alegra_id || null,
        name: c.nombre,
        identification: c.identificacion,
        email: c.correo || '',
        // Los teléfonos de las fichas vienen sucios ("89350207 JEISON"): se
        // guardan como están y quien los use decide, igual que siempre.
        phonePrimary: c.telefono || '',
        mobile: c.celular || '',
        plazoCreditoId: c.plazo_credito_id || null,
        status: c.activo ? 'active' : 'inactive'
      }));

      await indexedDBService.saveClientes(normalizados);
      console.log(`✅ ${normalizados.length} clientes guardados en cache`);
      return { success: true, total: normalizados.length, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('❌ Error actualizando cache de clientes:', error);
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

      // De la base propia, no de Alegra: son las mismas facturas y no hay que
      // salir a la red a buscarlas.
      const response = await api.get('/facturacion/facturas', {
        params: { estado: 'todas', limite: 60, pagina: 1 }
      });
      const facturas = (response.data?.data ?? []).map(desdeConsultaPropia);

      if (facturas.length > 0) {
        const guardadas = await indexedDBService.saveFacturasCache(facturas);
        console.log(`✅ ${guardadas} facturas precargadas para edición offline`);
        return { success: true, total: guardadas };
      }
      return { success: true, total: 0 };
    } catch (error) {
      console.error('❌ Error precargando facturas:', error);
      // No se lanza: que falle la precarga no debe frenar el resto del cache.
      return { success: false, total: 0, error: error.message };
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
   * Los impuestos, de NUESTRO catálogo.
   *
   * Importa que salgan de acá y no de una lista escrita a mano: el servidor
   * cobra la tarifa del maestro, y si la pantalla mostrara otra, el cajero
   * vería 13 % en un producto al 1 % y el papel saldría distinto de lo que vio.
   */
  async getImpuestos() {
    const response = await api.get('/catalogos/configuracion');
    const impuestos = response.data?.data?.impuestos ?? response.data?.impuestos ?? [];
    return impuestos
      .filter(i => i.activo)
      .map(i => ({ id: i.id, name: i.nombre, percentage: Number(i.tarifa) || 0, type: i.tipo }));
  }

  /** Los métodos de pago, de NUESTRO catálogo (incluye SINPE Móvil). */
  async getMetodosPago() {
    const response = await api.get('/catalogos/configuracion');
    const metodos = response.data?.data?.metodosPago ?? response.data?.metodosPago ?? [];
    return metodos
      .filter(m => m.activo)
      .map(m => ({ id: m.clave, name: m.nombre, type: m.clave, pideReferencia: m.pide_referencia }));
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

      // La clave nace ACÁ, antes del primer intento, y acompaña a esta factura
      // en todos los que vengan. Si el intento en línea expira, Alegra pudo
      // haberla creado: al guardarla offline conserva esta misma clave, así
      // que la sincronización posterior no crea una segunda.
      const claveIdempotencia = await nuevaClaveFactura();

      if (this.isOnline) {
        // Intentar crear directamente en Alegra
        try {
          const response = await api.post('/facturacion/facturas', {
            ...facturaData,
            claveIdempotencia
          });
          
          if (response.data.success) {
            // La respuesta viene en NUESTRA forma; se traduce a la que habla
            // el resto de la pantalla (ver facturaPropiaAdaptador.js).
            const creada = desdeFacturaPropia(response.data.data);
            console.log('✅ Factura creada online:', creada.id);

            // Guardar en cache para edición inmediata
            const facturaOnline = {
              ...creada,
              client: creada.client || facturaVista?.cliente || null,
              pendienteSincronizar: false,
              pendienteEdicion: false,
              esLocal: false,
              creadaEn: Date.now()
            };
            await indexedDBService.saveFacturasCache([facturaOnline]);
            
            return {
              success: true,
              online: true,
              data: creada,
              message: 'Factura creada'
            };
          }
        } catch (error) {
          console.warn('⚠️ Error enviando a Alegra, guardando offline:', error.message);
          // Si falla, guardar offline
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
          const response = await api.post('/facturacion/facturas', {
            ...factura,
            claveIdempotencia: factura.claveIdempotencia
          });
          
          if (response.data.success) {
            // La respuesta viene en NUESTRA forma; se traduce a la que habla
            // el resto de la pantalla (ver facturaPropiaAdaptador.js).
            const creada = desdeFacturaPropia(response.data.data);
            // Marcar como sincronizada
            await indexedDBService.markFacturaSincronizada(
              factura.localId, 
              creada.id
            );

            // Reemplazar factura en cache (eliminar versión local y guardar definitiva)
            if (factura.localId) {
              await indexedDBService.deleteFacturaCache(`local-${factura.localId}`);
            }
            await indexedDBService.saveFacturasCache([creada]);
            
            resultados.exitosas.push({
              localId: factura.localId,
              alegraId: creada.id
            });
            
            console.log(`✅ Factura ${factura.localId} sincronizada (Alegra: ${creada.id})`);
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
      const response = await api.post('/facturacion/facturas', {
        ...factura,
        claveIdempotencia: factura.claveIdempotencia
      });

      if (response.data.success) {
        // La respuesta viene en NUESTRA forma; se traduce a la que habla
        // el resto de la pantalla (ver facturaPropiaAdaptador.js).
        const creada = desdeFacturaPropia(response.data.data);
        await indexedDBService.markFacturaSincronizada(numeroLocal, creada.id);
        await indexedDBService.deleteFacturaCache(`local-${numeroLocal}`);
        await indexedDBService.saveFacturasCache([creada]);

        return { success: true, data: creada };
      }

      throw new Error(response.data.message || 'Error enviando factura pendiente');
    } catch (error) {
      const alegraMessage = error.response?.data?.details?.message || error.response?.data?.message || error.message;
      await indexedDBService.markFacturaError(numeroLocal, alegraMessage);
      throw new Error(alegraMessage);
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
        try {
          const params = { estado: 'todas', limite: 100 };
          if (criterio.numero) {
            params.buscar = criterio.numero;
          } else if (criterio.cliente) {
            params.buscar = criterio.cliente;
          } else if (criterio.periodo) {
            // El mes completo. La semana la filtra la pantalla, que es la que
            // sabe cómo las agrupa.
            const { ano, mes } = criterio.periodo;
            const ultimo = new Date(ano, mes, 0).getDate();
            params.desde = `${ano}-${String(mes).padStart(2, '0')}-01`;
            params.hasta = `${ano}-${String(mes).padStart(2, '0')}-${ultimo}`;
          } else {
            throw new Error('Criterio de búsqueda no válido');
          }

          const response = await api.get('/facturacion/facturas', { params });
          const facturas = (response.data?.data ?? []).map(desdeConsultaPropia);
          if (facturas.length > 0) await indexedDBService.saveFacturasCache(facturas);
          return facturas;
        } catch (error) {
          console.warn('⚠️ Error buscando, se busca en el cache:', error.message);
        }
      }

      // Sin conexión: lo que haya quedado guardado.
      if (criterio.numero) return await indexedDBService.searchFacturasByNumber(criterio.numero);
      if (criterio.cliente) return await indexedDBService.searchFacturasByClient(criterio.cliente);
      return await indexedDBService.getFacturasCache();
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
      if (esLocal) return await indexedDBService.getFacturaById(facturaId);

      if (this.isOnline) {
        try {
          const response = await api.get(`/facturacion/facturas/${facturaId}`);
          const factura = desdeConsultaPropia(response.data?.data);
          if (factura) {
            await indexedDBService.saveFacturasCache([factura]);
            return factura;
          }
        } catch (error) {
          console.warn('⚠️ Error obteniendo la factura, se busca en el cache:', error.message);
        }
      }

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
  /**
   * Editar factura.
   *
   * LA RUTA SE ELIGE POR LA MARCA `esPropia`, NO POR EL ID. Nuestras facturas
   * llevan ids propios (1, 2, 3…) y las de Alegra los suyos. Mandar un id
   * nuestro a la ruta de Alegra no da un error: da OTRA factura, la que por
   * casualidad tenga ese número allá. Por eso el que llama tiene que decir de
   * dónde salió el documento.
   */
  async editarFactura(facturaId, datosEdicion, facturaVista = null, { esPropia = false } = {}) {
    try {
      console.log('✏️ Editando factura...', {
        online: this.isOnline,
        facturaId,
        propia: esPropia,
        cambios: Object.keys(datosEdicion)
      });

      if (this.isOnline) {
        try {
          const response = esPropia
            ? await api.put(`/facturacion/facturas/${facturaId}`, datosEdicion)
            : await api.put(`/alegra/facturas/${facturaId}`, datosEdicion);

          if (response.data.success) {
            console.log('✅ Factura editada online:', facturaId);

            // Actualizar cache con la nueva versión
            const editada = esPropia ? desdeFacturaPropia(response.data.data) : response.data.data;
            if (editada) {
              const facturaOnline = {
                ...editada,
                client: editada.client || facturaVista?.cliente || null,
                pendienteSincronizar: false,
                pendienteEdicion: false
              };
              await indexedDBService.saveFacturasCache([facturaOnline]);
            }

            return {
              success: true,
              online: true,
              data: editada,
              message: 'Factura editada'
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
      // Se guarda TAMBIÉN de dónde salió: al reintentarla, la ruta se elige
      // con esta marca. Sin ella, el reintento adivina.
      const localId = await indexedDBService.saveEdicionPendiente(facturaId, datosEdicion, esPropia);

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

      const response = await api.post('/facturacion/facturas', {
        ...facturaData,
        claveIdempotencia: guardada?.claveIdempotencia || null
      });

      if (response.data.success) {
        // La respuesta viene en NUESTRA forma; se traduce a la que habla
        // el resto de la pantalla (ver facturaPropiaAdaptador.js).
        const creada = desdeFacturaPropia(response.data.data);
        await indexedDBService.markFacturaSincronizada(numeroLocal, creada.id);
        await indexedDBService.deleteFacturaCache(`local-${numeroLocal}`);

        const facturaOnline = {
          ...creada,
          client: creada.client || facturaVista?.cliente || null,
          pendienteSincronizar: false,
          pendienteEdicion: false,
          esLocal: false
        };
        await indexedDBService.saveFacturasCache([facturaOnline]);

        console.log(`✅ Factura pendiente ${numeroLocal} enviada a Alegra con ID ${creada.id}`);

        return {
          success: true,
          online: true,
          data: creada,
          message: 'Factura enviada'
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
          const response = edicion.esPropia
            ? await api.put(`/facturacion/facturas/${edicion.facturaId}`, edicion.datosEdicion)
            : await api.put(`/alegra/facturas/${edicion.facturaId}`, edicion.datosEdicion);

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

