const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class SearchIndex {
  constructor() {
    this.wordIndex = new Map(); // palabra -> [productos]
    this.exactIndex = new Map(); // código -> producto
    this.nameIndex = new Map(); // nombre completo -> producto
  }
  
  buildIndex(productos) {
    console.log(`🔍 Construyendo índice para ${productos.length} productos...`);
    
    productos.forEach(producto => {
      // Índice exacto por referencia/código
      if (producto.reference) {
        this.exactIndex.set(producto.reference.toLowerCase(), producto);
      }
      
      // Índice por nombre completo
      this.nameIndex.set(producto.name.toLowerCase(), producto);
      
      // Índice de palabras clave
      const words = producto.name.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // remover puntuación
        .split(/\s+/)
        .filter(word => word.length > 2); // solo palabras de 3+ caracteres
        
      words.forEach(word => {
        if (!this.wordIndex.has(word)) {
          this.wordIndex.set(word, []);
        }
        this.wordIndex.get(word).push(producto);
      });
    });
    
    console.log(`✅ Índice construido: ${this.exactIndex.size} códigos, ${this.wordIndex.size} palabras`);
  }
  
  search(query, limit = 20) {
    const queryLower = query.toLowerCase();
    
    // 1. Búsqueda exacta por código (INSTANTÁNEA)
    const exactMatch = this.exactIndex.get(queryLower);
    if (exactMatch) {
      return [{ product: exactMatch, confidence: 100 }];
    }
    
    // 2. Búsqueda exacta por nombre (INSTANTÁNEA)
    const nameMatch = this.nameIndex.get(queryLower);
    if (nameMatch) {
      return [{ product: nameMatch, confidence: 95 }];
    }
    
    // 3. Búsqueda por palabras clave (MUY RÁPIDA)
    const words = queryLower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const candidates = new Map(); // producto -> score
    
    words.forEach(word => {
      const matches = this.wordIndex.get(word) || [];
      matches.forEach(product => {
        const current = candidates.get(product.id) || 0;
        candidates.set(product.id, current + 1);
      });
    });
    
    // Calcular confianza y ordenar
    const results = Array.from(candidates.entries())
      .map(([productId, score]) => {
        const product = this.findProductById(productId);
        const confidence = Math.min((score / words.length) * 100, 90);
        return { product, confidence };
      })
      .filter(result => result.confidence >= 40)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
    
    return results;
  }
  
  findProductById(id) {
    // Helper para encontrar producto por ID en los índices
    for (const products of this.wordIndex.values()) {
      const product = products.find(p => p.id === id);
      if (product) return product;
    }
    return null;
  }
}

class OptimizedCache {
  static instance = null;
  
  constructor() {
    if (OptimizedCache.instance) {
      return OptimizedCache.instance;
    }
    
    this.searchIndex = new SearchIndex();
    this.productsCache = null;
    this.mappingsCache = new Map();
    this.lastSync = null;
    this.initialized = false;
    
    OptimizedCache.instance = this;
  }
  
  async initialize() {
    if (this.initialized) {
      console.log('✅ Cache ya inicializado');
      return;
    }
    
    console.log('🚀 Inicializando cache optimizado...');
    const start = Date.now();
    
    try {
      // Cargar productos desde BD local (mucho más rápido que API)
      await this.loadProductsFromDatabase();
      
      // Cargar mapeos existentes
      await this.loadMappings();
      
      const duration = Date.now() - start;
      console.log(`✅ Cache inicializado en ${duration}ms`);
      this.initialized = true;
      
    } catch (error) {
      console.error('❌ Error inicializando cache:', error);
      throw error;
    }
  }
  
  async loadProductsFromDatabase() {
    console.log('📦 Cargando productos desde BD local...');
    
    const products = await prisma.alegraProduct.findMany({
      select: {
        id: true,
        name: true,
        reference: true,
        price: true,
        cost: true,
        category: true,
        alegraId: true
      }
    });
    
    console.log(`📦 ${products.length} productos cargados desde BD`);
    
    if (products.length === 0) {
      console.log('⚠️ No hay productos en BD local, sincronizando desde Alegra...');
      // Solo si no hay productos locales, sincronizar desde API
      const alegraService = require('./alegraService');
      await alegraService.syncProducts();
      return this.loadProductsFromDatabase(); // Recursive call
    }
    
    this.productsCache = products;
    this.searchIndex.buildIndex(products);
    this.lastSync = Date.now();
  }
  
  async loadMappings() {
    console.log('🔗 Cargando mapeos existentes...');
    
    const mappings = await prisma.productMapping.findMany();
    
    mappings.forEach(mapping => {
      this.mappingsCache.set(mapping.providerCode, {
        alegraProductId: mapping.alegraProductId,
        confidence: 100 // Mapeos confirmados tienen 100% confianza
      });
    });
    
    console.log(`🔗 ${mappings.size} mapeos cargados`);
  }
  
  fastSearch(query) {
    if (!this.initialized) {
      throw new Error('Cache no inicializado. Llama await cache.initialize() primero');
    }
    
    // 1. Buscar mapeo exacto primero (INSTANTÁNEO)
    const mapping = this.mappingsCache.get(query);
    if (mapping) {
      const product = this.productsCache.find(p => p.alegraId === mapping.alegraProductId);
      if (product) {
        return [{ product, confidence: 100, source: 'mapping' }];
      }
    }
    
    // 2. Búsqueda en índice (MUY RÁPIDA)
    return this.searchIndex.search(query);
  }
  
  async saveMapping(providerCode, alegraProductId) {
    // Guardar en cache
    this.mappingsCache.set(providerCode, {
      alegraProductId,
      confidence: 100
    });
    
    // Guardar en BD
    await prisma.productMapping.upsert({
      where: { providerCode },
      update: { alegraProductId },
      create: { providerCode, alegraProductId }
    });
    
    console.log(`💾 Mapeo guardado: ${providerCode} -> ${alegraProductId}`);
  }
  
  getStats() {
    return {
      totalProducts: this.productsCache?.length || 0,
      totalMappings: this.mappingsCache.size,
      lastSync: this.lastSync,
      initialized: this.initialized
    };
  }
}

module.exports = OptimizedCache;