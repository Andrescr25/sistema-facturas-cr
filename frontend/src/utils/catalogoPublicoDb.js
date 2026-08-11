import { openDB } from 'idb'

const DB_NAME = 'AlegraCatalogReactDB'
const DB_VERSION = 2

export const catalogoPublicoDb = {
  async connect() {
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Additivo: cada bloque revisa si el store ya existe antes de
        // crearlo, así un dispositivo que ya tiene v1 (con "products" ya
        // poblado) sube a v2 sin perder el catálogo descargado.
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
      }
    })
  },

  async getAllProducts() {
    const db = await this.connect()
    return db.getAll('products')
  },

  async saveProducts(productsTarget) {
    const db = await this.connect()
    const tx = db.transaction('products', 'readwrite')
    await Promise.all(productsTarget.map((p) => tx.store.put(p)))
    await tx.done
  },

  async clearProducts() {
    const db = await this.connect()
    await db.clear('products')
  },

  async saveLastUpdate(timestamp = Date.now()) {
    const db = await this.connect()
    await db.put('metadata', timestamp, 'lastUpdate')
  },

  async getLastUpdate() {
    const db = await this.connect()
    return db.get('metadata', 'lastUpdate')
  },

  async saveOfertas(ofertas) {
    const db = await this.connect()
    await db.put('metadata', ofertas, 'ofertas')
  },

  async getOfertas() {
    const db = await this.connect()
    return db.get('metadata', 'ofertas')
  },

  // ==================== HISTORIAL DE COMPRAS POR CLIENTE ====================

  async saveClientes(clientes) {
    const db = await this.connect()
    const tx = db.transaction('clientes', 'readwrite')
    await Promise.all(clientes.map((c) => tx.store.put(c)))
    await tx.done
  },

  async getAllClientes() {
    const db = await this.connect()
    return db.getAll('clientes')
  },

  async getCliente(id) {
    const db = await this.connect()
    return db.get('clientes', id)
  },

  async clearClientes() {
    const db = await this.connect()
    await db.clear('clientes')
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
