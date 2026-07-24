/**
 * Servicio de Sincronización del caché local de productos de Alegra
 * (tabla AlegraProduct / alegra_products_cache).
 * Migrado literal del servicio legacy: mismo comportamiento, mismos logs.
 */

const prisma = require('../../../../lib/prisma');
const { getInstance: getAlegraClient } = require('../alegra.client');

class AlegraSyncService {
  constructor() {
    this.client = getAlegraClient();
    this.prisma = prisma;
  }

  /**
   * Sincronizar productos desde Alegra (paginación completa) y guardarlos
   * en la BD local.
   */
  async syncProductsFromAlegra() {
    try {
      console.log('📦 Sincronizando productos de Alegra...');

      const LIMIT = 30;
      const CONCURRENCY = 5; // mismo valor ya usado en el sync del catálogo público de tablets

      let allProducts = [];
      let start = 0;
      let hasMore = true;

      // Antes se traía página por página en serie (una espera tras otra).
      // Ahora se piden CONCURRENCY páginas a la vez y se espera el lote
      // completo antes de pedir el siguiente — mismo patrón ya probado en
      // frontend/src/hooks/useCatalogoPublico.js.
      while (hasMore) {
        const promises = [];
        for (let i = 0; i < CONCURRENCY; i++) {
          if (!hasMore) break;
          const currentStart = start + i * LIMIT;
          promises.push(
            this.client.api.get('/items', {
              params: { start: currentStart, limit: LIMIT, type: 'product' }
            })
              .then(response => ({ ok: true, data: response.data }))
              .catch(error => {
                console.error(`❌ Error obteniendo página start=${currentStart}:`, error.message);
                return { ok: false };
              })
          );
        }

        if (promises.length === 0) break;

        const results = await Promise.all(promises);

        for (const result of results) {
          if (!result.ok) continue;
          allProducts = allProducts.concat(result.data);
          if (result.data.length < LIMIT) hasMore = false;
        }

        start += promises.length * LIMIT;

        // Pausa entre rondas para no saturar la API de Alegra.
        await new Promise(resolve => setTimeout(resolve, 500));

        if (start > 100 * LIMIT) break;
      }

      console.log(`📦 ${allProducts.length} productos obtenidos`);
      await this.saveProductsToLocal(allProducts);

      return allProducts;
    } catch (error) {
      console.error('❌ Error sincronizando:', error.message);
      throw error;
    }
  }

  /**
   * Sincronizar caché de productos (alegra_products_cache / AlegraProduct)
   */
  async syncProductsCache() {
    console.log('🔄 Sincronizando caché de productos de Alegra...');
    const products = await this.syncProductsFromAlegra();
    return {
      success: true,
      message: 'Caché de productos sincronizada exitosamente',
      count: products.length
    };
  }

  /**
   * Sincronizar automáticamente (sincroniza caché y productos locales legacy)
   */
  async syncProductsAutomatically() {
    console.log('🔄 Sincronización automática de productos iniciada...');
    // 1. Sincronizar caché de Alegra (Prisma)
    const cacheProducts = await this.syncProductsFromAlegra();

    // 2. Sincronizar productos locales legacy (direct pg)
    const ProductService = require('../../../modules/products/product.service');
    const productService = new ProductService();
    const localSyncResult = await productService.syncProducts(100, false, true);

    return {
      success: true,
      message: 'Sincronización automática completada con éxito',
      cacheCount: cacheProducts.length,
      localSync: localSyncResult
    };
  }

  /**
   * Guardar productos en BD local
   */
  async saveProductsToLocal(products) {
    try {
      console.log('💾 Guardando productos en BD local...');
      const startTime = Date.now();

      const existingProducts = await this.prisma.alegraProduct.findMany({
        select: { alegraId: true, updatedAt: true, name: true, price: true, cost: true, reference: true, status: true, imageUrl: true }
      });

      const existingMap = new Map();
      existingProducts.forEach(p => {
        existingMap.set(p.alegraId, {
          updatedAt: p.updatedAt,
          name: p.name,
          price: p.price,
          cost: p.cost,
          reference: p.reference,
          status: p.status,
          imageUrl: p.imageUrl
        });
      });

      const uniqueProducts = products.filter((product, index, self) =>
        index === self.findIndex(p => p.id === product.id)
      );

      const toInsert = [];
      const toUpdate = [];
      const currentAlegraIds = new Set();

      uniqueProducts.forEach(product => {
        // Sigue existiendo en Alegra (activo o no) — nunca debe borrarse de
        // la caché solo por estar inactivo, ver el "return" de abajo.
        currentAlegraIds.add(product.id);

        // Un producto inactivo no se inserta ni se actualiza — se deja tal
        // cual estaba en caché (o simplemente no se agrega si es nuevo).
        // Una desactivación en Alegra puede ser momentánea y reactivarse en
        // la próxima sincronización; no vale la pena reflejar ese estado
        // intermedio ni "parpadear" el catálogo local por eso.
        if (product.status && product.status !== 'active') {
          return;
        }

        const mainPrice = product.price?.find(p => p.main === true);
        const price = mainPrice ? parseFloat(mainPrice.price) : 0;
        const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
        const reference = product.reference?.reference || product.reference || '';
        const category = product.itemCategory?.name || product.category?.name || '';

        const favoriteImage = product.images?.find(img => img.favorite === true) || product.images?.[0];
        const imageUrl = favoriteImage ? favoriteImage.url : '';

        const productData = {
          alegraId: product.id,
          name: product.name,
          reference: reference,
          description: product.description || '',
          category: category,
          price: price,
          cost: cost,
          status: product.status || 'active',
          type: product.type || 'product',
          imageUrl: imageUrl,
          searchText: `${product.name} ${reference} ${product.description || ''}`.toLowerCase()
        };

        const existing = existingMap.get(product.id);

        if (!existing) {
          toInsert.push(productData);
        } else {
          // Solo actualizar si algo cambió
          const nameDiff = existing.name !== productData.name;
          const priceDiff = Math.abs(existing.price - productData.price) > 0.01;
          const costDiff = Math.abs(existing.cost - productData.cost) > 0.01;
          const refDiff = existing.reference !== productData.reference;
          const statusDiff = existing.status !== productData.status;
          // Comparación completa (con query string): las URLs de imagen de
          // Alegra son firmadas con expiración (?Expires=...&Signature=...)
          // que Alegra regenera en cada respuesta aunque la foto no cambie.
          // Comparar solo la parte antes de "?" hacía que nunca se detectara
          // como "cambio" y la URL vieja quedaba cacheada para siempre hasta
          // que la firma vencía (imagen rota sin forma de repararse solo con
          // sincronizar).
          const imgDiff = (existing.imageUrl || '') !== (productData.imageUrl || '');

          const hasChanged = nameDiff || priceDiff || costDiff || refDiff || statusDiff || imgDiff;

          if (hasChanged && toUpdate.length < 5) {
            console.log(`🔍 Mismatch for ${productData.alegraId} (${productData.name}):`, {
              name: nameDiff ? `${existing.name} vs ${productData.name}` : 'OK',
              price: priceDiff ? `${existing.price} vs ${productData.price}` : 'OK',
              cost: costDiff ? `${existing.cost} vs ${productData.cost}` : 'OK',
              ref: refDiff ? `'${existing.reference}' vs '${productData.reference}'` : 'OK',
              status: statusDiff ? `${existing.status} vs ${productData.status}` : 'OK',
              img: imgDiff ? `'${existing.imageUrl}' vs '${productData.imageUrl}'` : 'OK'
            });
          }

          if (hasChanged) {
            toUpdate.push(productData);
          }
        }
      });

      const toDelete = existingProducts
        .filter(existing => !currentAlegraIds.has(existing.alegraId))
        .map(p => p.alegraId);

      console.log(`📈 Cambios: +${toInsert.length} ~${toUpdate.length} -${toDelete.length}`);

      const operations = [];

      if (toInsert.length > 0) {
        operations.push(
          this.prisma.alegraProduct.createMany({
            data: toInsert,
            skipDuplicates: true
          })
        );
      }

      // Actualizar en lotes para evitar saturar connection pool
      if (toUpdate.length > 0) {
        const BATCH_SIZE = 5;
        const batches = [];

        for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
          batches.push(toUpdate.slice(i, i + BATCH_SIZE));
        }

        console.log(`📦 Actualizando ${toUpdate.length} productos en ${batches.length} lotes`);

        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const batchPromises = batch.map(product =>
            this.prisma.alegraProduct.update({
              where: { alegraId: product.alegraId },
              data: {
                name: product.name,
                reference: product.reference,
                description: product.description,
                category: product.category,
                price: product.price,
                cost: product.cost,
                status: product.status,
                type: product.type,
                imageUrl: product.imageUrl,
                searchText: product.searchText,
                updatedAt: new Date()
              }
            }).catch(error => {
              console.warn(`⚠️ Error actualizando ${product.alegraId}:`, error.message);
            })
          );

          await Promise.all(batchPromises);

          // Pequeña pausa entre lotes
          if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      }

      if (toDelete.length > 0) {
        operations.push(
          this.prisma.alegraProduct.deleteMany({
            where: { alegraId: { in: toDelete } }
          })
        );
      }

      if (operations.length > 0) {
        await Promise.all(operations);
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Sincronización completada en ${duration}ms`);

      return {
        total: uniqueProducts.length,
        inserted: toInsert.length,
        updated: toUpdate.length,
        deleted: toDelete.length,
        duration: duration
      };
    } catch (error) {
      console.error('❌ Error guardando productos:', error.message);
      throw error;
    }
  }
}

module.exports = AlegraSyncService;
