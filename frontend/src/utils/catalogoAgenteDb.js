import { openDB } from 'idb'

const DB_NAME = 'AlegraCatalogReactDB'
// El nombre se conserva para migrar la base que YA tiene la tablet. Cambiarlo
// dejaría la copia anterior abandonada, sin ejecutar la invalidación.
const DB_VERSION = 3
export const VERSION_IDS = 'propios-v1'
let conexion = null

export function validarVersionIds(datos) {
  if (datos?.versionIds !== VERSION_IDS) {
    throw new Error('El catálogo del servidor cambió. Recargue la aplicación antes de actualizarlo.')
  }
}

function validarProductos(productos) {
  if (!Array.isArray(productos) || productos.some(p => !Number.isInteger(p.productoId) || p.productoId <= 0 || String(p.id) !== String(p.productoId)) ||
      new Set(productos.map(p => p.productoId)).size !== productos.length) {
    throw new Error('No se pudo verificar el catálogo. Se conserva la copia anterior.')
  }
}

export const catalogoAgenteDb = {
  async connect() {
    if (conexion) return conexion
    conexion = new Promise((resolve, reject) => {
      let bloqueada = false, abierta
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db, anterior, nueva, tx) {
          if (!db.objectStoreNames.contains('products')) {
            const store = db.createObjectStore('products', { keyPath: 'id' })
            store.createIndex('status', 'status')
          }
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata')
          }
          if (!db.objectStoreNames.contains('clientes')) {
            db.createObjectStore('clientes', { keyPath: 'id' })
          }
          if (anterior > 0 && anterior < 3) {
            // Cambió el ESPACIO de ids. "12" de Alegra puede ser otro producto
            // que producto.id=12: no sirve conservar productos y borrar solo
            // el historial. Todo lo que usa esos ids se invalida JUNTO.
            // configCatalogo y las fotos se conservan: no dependen de esos ids.
            // NO se abre SistemaFacturasCR: allí viven pedidos y facturas sin
            // enviar, que jamás se borran al renovar esta caché de consulta.
            tx.objectStore('products').clear()
            tx.objectStore('clientes').clear()
            const meta = tx.objectStore('metadata')
            for (const clave of ['lastUpdate', 'ofertas', 'ofertasBaja', 'productosNuevos', 'rotacion', 'clienteActivoId']) meta.delete(clave)
            meta.put(true, 'requiereActualizar')
          }
          tx.objectStore('metadata').put(VERSION_IDS, 'versionIds')
        },
        blocked() {
          bloqueada = true
          reject(new Error('Cierre las otras pestañas del catálogo y vuelva a abrirlo para actualizarlo.'))
        },
        blocking() { abierta?.close(); conexion = null },
        terminated() { conexion = null }
      }).then(db => {
        abierta = db
        if (bloqueada) db.close()
        else resolve(db)
      }, reject)
    }).catch(error => { conexion = null; throw error })
    return conexion
  },

  async getRequiereActualizar() {
    const db = await this.connect()
    return Boolean(await db.get('metadata', 'requiereActualizar'))
  },

  /** Reemplazo atómico: no se borra la última copia por una descarga a medias. */
  async guardarCatalogo({ products, clientes, timestamp, ...metadata }) {
    validarProductos(products)
    const db = await this.connect()
    const tx = db.transaction(['products', 'clientes', 'metadata'], 'readwrite')
    const operaciones = []
    try {
      const productosStore = tx.objectStore('products')
      operaciones.push(productosStore.clear())
      for (const p of products) operaciones.push(productosStore.put(p))
      if (clientes !== undefined) {
        const clientesStore = tx.objectStore('clientes')
        operaciones.push(clientesStore.clear())
        for (const c of clientes) operaciones.push(clientesStore.put(c))
      }
      const meta = tx.objectStore('metadata')
      for (const [clave, valor] of Object.entries(metadata)) operaciones.push(meta.put(valor, clave))
      operaciones.push(meta.put(timestamp, 'lastUpdate'), meta.put(VERSION_IDS, 'versionIds'), meta.put(false, 'requiereActualizar'))
      await Promise.all([...operaciones, tx.done])
    } catch (error) {
      // También un error SINCRÓNICO de put() debe revertir los clear() ya
      // encolados. Esperar todas las promesas evita rechazos sin manejar.
      try { tx.abort() } catch { /* IndexedDB pudo abortarla antes. */ }
      await Promise.allSettled([...operaciones, tx.done])
      throw error
    }
  },

  // No se exponen clear/save por bloques: renovar la copia pasa siempre
  // por guardarCatalogo(). El cliente elegido sí se guarda por separado.
  async getAllProducts() {
    const db = await this.connect()
    return db.getAll('products')
  },

  async getLastUpdate() {
    const db = await this.connect()
    return db.get('metadata', 'lastUpdate')
  },

  async getOfertas() {
    const db = await this.connect()
    return db.get('metadata', 'ofertas')
  },

  async getOfertasBaja() {
    const db = await this.connect()
    return db.get('metadata', 'ofertasBaja')
  },

  async getProductosNuevos() {
    const db = await this.connect()
    return db.get('metadata', 'productosNuevos')
  },

  async getConfigCatalogo() {
    const db = await this.connect()
    return db.get('metadata', 'configCatalogo')
  },

  async getRotacion() {
    const db = await this.connect()
    return db.get('metadata', 'rotacion')
  },

  // ==================== HISTORIAL DE COMPRAS POR CLIENTE ====================

  async getAllClientes() {
    const db = await this.connect()
    return db.getAll('clientes')
  },

  async getCliente(id) {
    const db = await this.connect()
    return db.get('clientes', id)
  },

  async saveClienteActivo(id) {
    const db = await this.connect()
    await db.put('metadata', id, 'clienteActivoId')
  },

  async getClienteActivo() {
    const db = await this.connect()
    return db.get('metadata', 'clienteActivoId')
  }
}
