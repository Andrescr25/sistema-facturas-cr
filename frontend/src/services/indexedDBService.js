/**
 * 🗄️ IndexedDB Service
 * 
 * Servicio para almacenamiento offline de productos, clientes y facturas pendientes
 * Soporta ~1600 productos + múltiples clientes sin límite de almacenamiento
 */

const DB_NAME = 'SistemaFacturasCR';
const DB_VERSION = 2; // Incrementado para agregar nuevos stores

// Stores
const STORES = {
  PRODUCTOS: 'productos',
  CLIENTES: 'clientes',
  FACTURAS_PENDIENTES: 'facturas_pendientes',
  FACTURAS_CACHE: 'facturas_cache', // Cache de facturas existentes para edición offline
  EDICIONES_PENDIENTES: 'ediciones_pendientes', // Ediciones pendientes de sincronización
  CONFIGURACION: 'configuracion'
};

class IndexedDBService {
  constructor() {
    this.db = null;
  }

  /**
   * Inicializar la base de datos
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ Error abriendo IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB inicializada correctamente');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Store de productos
        if (!db.objectStoreNames.contains(STORES.PRODUCTOS)) {
          const productosStore = db.createObjectStore(STORES.PRODUCTOS, { keyPath: 'id' });
          productosStore.createIndex('reference', 'reference', { unique: false });
          productosStore.createIndex('name', 'name', { unique: false });
          console.log('📦 Store de productos creado');
        }

        // Store de clientes
        if (!db.objectStoreNames.contains(STORES.CLIENTES)) {
          const clientesStore = db.createObjectStore(STORES.CLIENTES, { keyPath: 'id' });
          clientesStore.createIndex('name', 'name', { unique: false });
          clientesStore.createIndex('identification', 'identification', { unique: false });
          console.log('👥 Store de clientes creado');
        }

        // Store de facturas pendientes (offline)
        if (!db.objectStoreNames.contains(STORES.FACTURAS_PENDIENTES)) {
          const facturasStore = db.createObjectStore(STORES.FACTURAS_PENDIENTES, { 
            keyPath: 'localId',
            autoIncrement: true 
          });
          facturasStore.createIndex('timestamp', 'timestamp', { unique: false });
          facturasStore.createIndex('sincronizada', 'sincronizada', { unique: false });
          console.log('📄 Store de facturas pendientes creado');
        }

        // Store de configuración
        if (!db.objectStoreNames.contains(STORES.CONFIGURACION)) {
          db.createObjectStore(STORES.CONFIGURACION, { keyPath: 'key' });
          console.log('⚙️ Store de configuración creado');
        }

        // Store de cache de facturas (para edición offline)
        if (!db.objectStoreNames.contains(STORES.FACTURAS_CACHE)) {
          const facturasCacheStore = db.createObjectStore(STORES.FACTURAS_CACHE, { keyPath: 'id' });
          facturasCacheStore.createIndex('numberTemplate', 'numberTemplate.fullNumber', { unique: false });
          facturasCacheStore.createIndex('client', 'client', { unique: false });
          facturasCacheStore.createIndex('date', 'date', { unique: false });
          console.log('📋 Store de cache de facturas creado');
        }

        // Store de ediciones pendientes
        if (!db.objectStoreNames.contains(STORES.EDICIONES_PENDIENTES)) {
          const edicionesStore = db.createObjectStore(STORES.EDICIONES_PENDIENTES, {
            keyPath: 'localId',
            autoIncrement: true
          });
          edicionesStore.createIndex('facturaId', 'facturaId', { unique: false });
          edicionesStore.createIndex('timestamp', 'timestamp', { unique: false });
          edicionesStore.createIndex('sincronizada', 'sincronizada', { unique: false });
          console.log('✏️ Store de ediciones pendientes creado');
        }
      };
    });
  }

  /**
   * Guardar múltiples productos (reemplaza todos)
   */
  async saveProductos(productos) {
    const transaction = this.db.transaction([STORES.PRODUCTOS], 'readwrite');
    const store = transaction.objectStore(STORES.PRODUCTOS);

    // Limpiar productos existentes
    await store.clear();

    // Guardar nuevos productos normalizados
    for (const producto of productos) {
      // Normalizar campos para búsqueda consistente
      const normalizedProducto = {
        ...producto,
        reference: producto.reference ? String(producto.reference).trim() : '',
        name: producto.name ? String(producto.name) : '',
        description: producto.description ? String(producto.description) : ''
      };
      
      // Debug: Log primeros 5 productos para verificar
      if (productos.indexOf(producto) < 5) {
        console.log(`💾 Guardando producto: ${normalizedProducto.name} | Ref: "${normalizedProducto.reference}" (tipo: ${typeof normalizedProducto.reference})`);
      }
      
      await store.put(normalizedProducto);
    }

    // Guardar timestamp de última actualización
    await this.setConfig('productos_last_update', Date.now());

    console.log(`✅ ${productos.length} productos guardados en IndexedDB`);
    return productos.length;
  }

  /**
   * Obtener todos los productos
   */
  async getProductos() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.PRODUCTOS], 'readonly');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Buscar producto por referencia (código)
   */
  async getProductoByReference(reference) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.PRODUCTOS], 'readonly');
      const store = transaction.objectStore(STORES.PRODUCTOS);
      const index = store.index('reference');
      
      // Normalizar reference (puede venir como string o número)
      const normalizedRef = String(reference).trim();
      console.log(`📊 IndexedDB: Buscando reference normalizada: "${normalizedRef}"`);
      
      const request = index.get(normalizedRef);

      request.onsuccess = () => {
        if (request.result) {
          console.log(`✅ IndexedDB: Producto encontrado:`, {
            nombre: request.result.name,
            reference: request.result.reference,
            price: request.result.price,
            tipoReference: typeof request.result.reference
          });
        } else {
          console.log(`❌ IndexedDB: Resultado de búsqueda: No encontrado`);
          // Debug: Ver qué hay en el store para comparar
          const allRequest = store.getAll();
          allRequest.onsuccess = () => {
            const primeros5 = allRequest.result.slice(0, 5);
            console.log(`🔍 Primeros 5 productos en IndexedDB para comparar:`, primeros5.map(p => ({
              nombre: p.name,
              reference: p.reference,
              tipoReference: typeof p.reference
            })));
          };
        }
        resolve(request.result);
      };
      request.onerror = () => {
        console.error(`📊 IndexedDB: Error en búsqueda:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Buscar productos por nombre (búsqueda parcial)
   */
  async searchProductosByName(searchTerm) {
    const productos = await this.getProductos();
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) return [];
    
    return productos.filter(p => {
      const name = p.name ? String(p.name).toLowerCase() : '';
      const reference = p.reference ? String(p.reference).toLowerCase() : '';
      const description = p.description ? String(p.description).toLowerCase() : '';
      
      return name.includes(term) || 
             reference.includes(term) || 
             description.includes(term);
    });
  }

  /**
   * Guardar múltiples clientes (reemplaza todos)
   */
  async saveClientes(clientes) {
    const transaction = this.db.transaction([STORES.CLIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.CLIENTES);

    // Limpiar clientes existentes
    await store.clear();

    // Guardar nuevos clientes normalizados
    for (const cliente of clientes) {
      // Normalizar campos para búsqueda consistente
      const normalizedCliente = {
        ...cliente,
        name: cliente.name ? String(cliente.name) : '',
        identification: cliente.identification ? String(cliente.identification) : '',
        email: cliente.email ? String(cliente.email) : ''
      };
      await store.put(normalizedCliente);
    }

    // Guardar timestamp de última actualización
    await this.setConfig('clientes_last_update', Date.now());

    console.log(`✅ ${clientes.length} clientes guardados en IndexedDB`);
    return clientes.length;
  }

  /**
   * Obtener todos los clientes
   */
  async getClientes() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.CLIENTES], 'readonly');
      const store = transaction.objectStore(STORES.CLIENTES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Buscar clientes por nombre
   */
  async searchClientesByName(searchTerm) {
    const clientes = await this.getClientes();
    const term = searchTerm.toLowerCase().trim();
    
    if (!term) return [];
    
    return clientes.filter(c => {
      const name = c.name ? String(c.name).toLowerCase() : '';
      const identification = c.identification ? String(c.identification).toLowerCase() : '';
      const email = c.email ? String(c.email).toLowerCase() : '';
      
      return name.includes(term) || 
             identification.includes(term) || 
             email.includes(term);
    });
  }

  /**
   * Guardar factura pendiente (sin internet)
   */
  async saveFacturaPendiente(factura) {
    const transaction = this.db.transaction([STORES.FACTURAS_PENDIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.FACTURAS_PENDIENTES);

    const facturaConMetadata = {
      ...factura,
      timestamp: Date.now(),
      sincronizada: false,
      intentosSincronizacion: 0,
      errorSincronizacion: null
    };

    return new Promise((resolve, reject) => {
      const request = store.add(facturaConMetadata);
      request.onsuccess = () => {
        console.log('💾 Factura guardada localmente con ID:', request.result);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtener facturas pendientes de sincronización
   */
  async getFacturasPendientes() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.FACTURAS_PENDIENTES], 'readonly');
      const store = transaction.objectStore(STORES.FACTURAS_PENDIENTES);
      
      // Obtener todas las facturas y filtrar manualmente
      // porque getAll(false) no funciona correctamente con booleanos
      const request = store.getAll();

      request.onsuccess = () => {
        const facturas = request.result || [];
        // Filtrar solo las no sincronizadas
        const pendientes = facturas.filter(f => f.sincronizada === false);
        resolve(pendientes);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Marcar factura como sincronizada
   */
  async markFacturaSincronizada(localId, alegraId) {
    const transaction = this.db.transaction([STORES.FACTURAS_PENDIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.FACTURAS_PENDIENTES);

    return new Promise((resolve, reject) => {
      const getRequest = store.get(localId);
      
      getRequest.onsuccess = () => {
        const factura = getRequest.result;
        if (factura) {
          factura.sincronizada = true;
          factura.alegraId = alegraId;
          factura.sincronizadaEn = Date.now();
          
          const updateRequest = store.put(factura);
          updateRequest.onsuccess = () => {
            console.log(`✅ Factura ${localId} marcada como sincronizada (Alegra ID: ${alegraId})`);
            resolve(factura);
          };
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Factura no encontrada'));
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Registrar error de sincronización
   */
  async markFacturaError(localId, error) {
    const transaction = this.db.transaction([STORES.FACTURAS_PENDIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.FACTURAS_PENDIENTES);

    return new Promise((resolve, reject) => {
      const getRequest = store.get(localId);
      
      getRequest.onsuccess = () => {
        const factura = getRequest.result;
        if (factura) {
          factura.intentosSincronizacion = (factura.intentosSincronizacion || 0) + 1;
          factura.errorSincronizacion = error;
          factura.ultimoIntento = Date.now();
          
          const updateRequest = store.put(factura);
          updateRequest.onsuccess = () => resolve(factura);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Factura no encontrada'));
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Eliminar factura sincronizada (limpieza)
   */
  async deleteFactura(localId) {
    const transaction = this.db.transaction([STORES.FACTURAS_PENDIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.FACTURAS_PENDIENTES);

    return new Promise((resolve, reject) => {
      const request = store.delete(localId);
      request.onsuccess = () => {
        console.log(`🗑️ Factura ${localId} eliminada de IndexedDB`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Guardar configuración
   */
  async setConfig(key, value) {
    const transaction = this.db.transaction([STORES.CONFIGURACION], 'readwrite');
    const store = transaction.objectStore(STORES.CONFIGURACION);

    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtener configuración
   */
  async getConfig(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.CONFIGURACION], 'readonly');
      const store = transaction.objectStore(STORES.CONFIGURACION);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtener estadísticas de cache
   */
  async getCacheStats() {
    const [productos, clientes, pendientes] = await Promise.all([
      this.getProductos(),
      this.getClientes(),
      this.getFacturasPendientes()
    ]);

    const productosLastUpdate = await this.getConfig('productos_last_update');
    const clientesLastUpdate = await this.getConfig('clientes_last_update');

    return {
      productos: {
        total: productos.length,
        ultimaActualizacion: productosLastUpdate ? new Date(productosLastUpdate) : null
      },
      clientes: {
        total: clientes.length,
        ultimaActualizacion: clientesLastUpdate ? new Date(clientesLastUpdate) : null
      },
      facturasPendientes: pendientes.length,
      facturasPendientesDetalle: pendientes.map(f => ({
        localId: f.localId,
        cliente: f.client?.name,
        total: f.total,
        timestamp: new Date(f.timestamp),
        intentos: f.intentosSincronizacion
      }))
    };
  }

  /**
   * Limpiar todo el cache (útil para desarrollo/testing)
   */
  async clearAll() {
    const transaction = this.db.transaction(
      [STORES.PRODUCTOS, STORES.CLIENTES, STORES.FACTURAS_PENDIENTES, STORES.FACTURAS_CACHE, STORES.EDICIONES_PENDIENTES, STORES.CONFIGURACION],
      'readwrite'
    );

    await Promise.all([
      transaction.objectStore(STORES.PRODUCTOS).clear(),
      transaction.objectStore(STORES.CLIENTES).clear(),
      transaction.objectStore(STORES.FACTURAS_PENDIENTES).clear(),
      transaction.objectStore(STORES.FACTURAS_CACHE).clear(),
      transaction.objectStore(STORES.EDICIONES_PENDIENTES).clear(),
      transaction.objectStore(STORES.CONFIGURACION).clear()
    ]);

    console.log('🗑️ Cache limpiado completamente');
  }

  /**
   * ========== MÉTODOS PARA EDICIÓN DE FACTURAS ==========
   */

  /**
   * Guardar facturas en cache (para edición offline)
   */
  async saveFacturasCache(facturas) {
    const transaction = this.db.transaction([STORES.FACTURAS_CACHE], 'readwrite');
    const store = transaction.objectStore(STORES.FACTURAS_CACHE);

    for (const factura of facturas) {
      await store.put(factura);
    }

    console.log(`✅ ${facturas.length} facturas guardadas en cache`);
    return facturas.length;
  }

  /**
   * Obtener todas las facturas del cache
   */
  async getFacturasCache() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.FACTURAS_CACHE], 'readonly');
      const store = transaction.objectStore(STORES.FACTURAS_CACHE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtener una factura específica del cache
   */
  async getFacturaById(facturaId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.FACTURAS_CACHE], 'readonly');
      const store = transaction.objectStore(STORES.FACTURAS_CACHE);
      const request = store.get(facturaId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Buscar facturas por número
   */
  async searchFacturasByNumber(numero) {
    const facturas = await this.getFacturasCache();
    const term = numero.toString().toLowerCase().trim();

    if (!term) return [];

    return facturas.filter(f => {
      const fullNumber = f.numberTemplate?.fullNumber ?
        String(f.numberTemplate.fullNumber).toLowerCase() : '';
      return fullNumber.includes(term);
    });
  }

  /**
   * Buscar facturas por cliente
   */
  async searchFacturasByClient(clienteNombre) {
    const facturas = await this.getFacturasCache();
    const term = clienteNombre.toLowerCase().trim();

    if (!term) return [];

    return facturas.filter(f => {
      const clientName = f.client?.name ?
        String(f.client.name).toLowerCase() : '';
      return clientName.includes(term);
    });
  }

  /**
   * Guardar edición pendiente de factura
   */
  async saveEdicionPendiente(facturaId, datosEdicion) {
    const transaction = this.db.transaction([STORES.EDICIONES_PENDIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.EDICIONES_PENDIENTES);

    const edicionConMetadata = {
      facturaId,
      datosEdicion,
      timestamp: Date.now(),
      sincronizada: false,
      intentosSincronizacion: 0,
      errorSincronizacion: null
    };

    return new Promise((resolve, reject) => {
      const request = store.add(edicionConMetadata);
      request.onsuccess = () => {
        console.log('💾 Edición guardada localmente con ID:', request.result);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Obtener ediciones pendientes de sincronización
   */
  async getEdicionesPendientes() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORES.EDICIONES_PENDIENTES], 'readonly');
      const store = transaction.objectStore(STORES.EDICIONES_PENDIENTES);
      const request = store.getAll();

      request.onsuccess = () => {
        const ediciones = request.result || [];
        const pendientes = ediciones.filter(e => e.sincronizada === false);
        resolve(pendientes);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Marcar edición como sincronizada
   */
  async markEdicionSincronizada(localId) {
    const transaction = this.db.transaction([STORES.EDICIONES_PENDIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.EDICIONES_PENDIENTES);

    return new Promise((resolve, reject) => {
      const getRequest = store.get(localId);

      getRequest.onsuccess = () => {
        const edicion = getRequest.result;
        if (edicion) {
          edicion.sincronizada = true;
          edicion.sincronizadaEn = Date.now();

          const updateRequest = store.put(edicion);
          updateRequest.onsuccess = () => {
            console.log(`✅ Edición ${localId} marcada como sincronizada`);
            resolve(edicion);
          };
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Edición no encontrada'));
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Registrar error de sincronización de edición
   */
  async markEdicionError(localId, error) {
    const transaction = this.db.transaction([STORES.EDICIONES_PENDIENTES], 'readwrite');
    const store = transaction.objectStore(STORES.EDICIONES_PENDIENTES);

    return new Promise((resolve, reject) => {
      const getRequest = store.get(localId);

      getRequest.onsuccess = () => {
        const edicion = getRequest.result;
        if (edicion) {
          edicion.intentosSincronizacion = (edicion.intentosSincronizacion || 0) + 1;
          edicion.errorSincronizacion = error;
          edicion.ultimoIntento = Date.now();

          const updateRequest = store.put(edicion);
          updateRequest.onsuccess = () => resolve(edicion);
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Edición no encontrada'));
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }
}

// Singleton
const indexedDBService = new IndexedDBService();

export default indexedDBService;

