/**
 * Servicio de Sincronización del caché local de productos de Alegra
 * (tabla AlegraProduct / alegra_products_cache).
 * Migrado literal del servicio legacy: mismo comportamiento, mismos logs.
 */

const prisma = require('../../../../lib/prisma');
const { getInstance: getAlegraClient } = require('../alegra.client');
const { query } = require('../../../../config/database');

// Las URLs de imagen de Alegra vienen firmadas y vencen a los 7 días
// (medido sobre las 400 URLs guardadas: mediana 6,99 días). La firma cambia
// en CADA respuesta aunque la foto sea la misma, así que compararla entera
// marcaba como "modificado" casi todo el catálogo — 1.970 de 2.077 productos
// por sincronización, que era el verdadero motivo de los 4½ minutos.
//
// Se separan las dos preguntas: ¿cambió la foto? (la ruta, sin query string)
// y ¿hay que renovar la firma? (le queda poca vida). Con este margen basta
// con sincronizar cada 3 días para que ninguna imagen se rompa.
const DIAS_MARGEN_FIRMA = 3;

/** Ruta de la imagen sin la firma — lo único que identifica a la foto. */
function rutaImagen(url) {
  return String(url || '').split('?')[0];
}

/** Segundos que le quedan de vida a la URL firmada (Infinity si no está firmada). */
function vidaRestanteImagen(url) {
  const m = String(url || '').match(/[?&]Expires=(\d+)/);
  if (!m) return Infinity;
  return Number(m[1]) - Math.floor(Date.now() / 1000);
}

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
      const REINTENTOS = 3;
      // Guarda dura contra un bucle infinito. Antes era 100 páginas (3.000
      // productos) y el catálogo ya va por 2.077: al pasar ese tope el sync
      // truncaba en silencio y, como lo truncado no aparecía en la respuesta,
      // saveProductsToLocal lo borraba. Ahora es holgado y, si se toca, se
      // considera fetch incompleto en vez de "así quedó".
      const MAX_PAGINAS = 1000;

      let allProducts = [];
      let start = 0;
      let hasMore = true;
      let paginasPedidas = 0;
      let fetchCompleto = true;

      /** Una página con reintentos. Devuelve null si agotó los intentos. */
      const traerPagina = async (currentStart) => {
        for (let intento = 1; intento <= REINTENTOS; intento++) {
          try {
            const response = await this.client.api.get('/items', {
              params: { start: currentStart, limit: LIMIT, type: 'product' }
            });
            return response.data;
          } catch (error) {
            console.error(`   ⚠️ Página start=${currentStart} falló (intento ${intento}/${REINTENTOS}): ${error.message}`);
            if (intento < REINTENTOS) await new Promise(r => setTimeout(r, 1000 * intento));
          }
        }
        return null;
      };

      // Se piden CONCURRENCY páginas a la vez y se espera el lote completo
      // antes de pedir el siguiente — mismo patrón ya probado en
      // frontend/src/hooks/useCatalogoAgente.js.
      while (hasMore && paginasPedidas < MAX_PAGINAS) {
        const promises = [];
        for (let i = 0; i < CONCURRENCY; i++) {
          promises.push(traerPagina(start + i * LIMIT));
        }
        paginasPedidas += promises.length;

        const results = await Promise.all(promises);

        for (const data of results) {
          // Una página que no se pudo traer NO es una página vacía: si se
          // ignora, sus productos quedan fuera de allProducts y el borrado de
          // saveProductsToLocal los elimina del catálogo local como si Alegra
          // los hubiera dado de baja. Es la causa de "agrego una marca y
          // desaparece del sistema".
          if (data === null) { fetchCompleto = false; continue; }
          allProducts = allProducts.concat(data);
          if (data.length < LIMIT) hasMore = false;
        }

        // Si TODAS las páginas de la ronda fallaron, nadie pudo marcar el
        // final: sin esto el bucle seguía pidiendo páginas cada vez más lejos
        // (el "se queda sincronizando indefinidamente").
        if (results.every(d => d === null)) {
          console.error('❌ Ninguna página de la ronda respondió — se corta la sincronización.');
          break;
        }

        start += promises.length * LIMIT;

        // Pausa entre rondas para no saturar la API de Alegra.
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (paginasPedidas >= MAX_PAGINAS) {
        fetchCompleto = false;
        console.error(`❌ Se alcanzó el tope de ${MAX_PAGINAS} páginas — el catálogo no se trajo completo.`);
      }

      console.log(`📦 ${allProducts.length} productos obtenidos${fetchCompleto ? '' : ' (INCOMPLETO)'}`);
      await this.saveProductsToLocal(allProducts, { fetchCompleto });

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
  /**
   * @param {Array} products - productos traídos de Alegra
   * @param {{fetchCompleto?: boolean}} [opciones] - si el fetch quedó
   *   incompleto NO se borra nada: un producto ausente puede significar "lo
   *   dieron de baja en Alegra" o "no pude traer esa página", y confundir las
   *   dos cosas borra productos vivos del catálogo local.
   */
  async saveProductsToLocal(products, opciones = {}) {
    const fetchCompleto = opciones.fetchCompleto !== false;
    try {
      console.log('💾 Guardando productos en BD local...');
      const startTime = Date.now();

      const existingProducts = await this.prisma.alegraProduct.findMany({
        select: { alegraId: true, updatedAt: true, name: true, price: true, cost: true, reference: true, status: true, imageUrl: true, taxPercentage: true }
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
          imageUrl: p.imageUrl,
          taxPercentage: p.taxPercentage
        });
      });

      const uniqueProducts = products.filter((product, index, self) =>
        index === self.findIndex(p => p.id === product.id)
      );

      const toInsert = [];
      const toUpdate = [];
      const toDeactivate = [];
      const currentAlegraIds = new Set();

      uniqueProducts.forEach(product => {
        // Sigue existiendo en Alegra (activo o no) — nunca debe borrarse de
        // la caché solo por estar inactivo, ver el "return" de abajo.
        currentAlegraIds.add(product.id);

        // Un producto inactivo en Alegra no se reescribe campo por campo,
        // pero su ESTADO sí tiene que llegar a la caché. Antes acá había un
        // `return` seco: la fila se quedaba en 'active' para siempre, así que
        // desactivar un producto en Alegra no lo sacaba de ningún catálogo y
        // se le seguía ofreciendo al cliente. Se le pasa solo el estado —
        // nada más— para no pisar precio ni foto con lo que Alegra devuelva
        // de un producto dado de baja.
        //
        // Si además no está en la caché no hay nada que hacer: un producto
        // que nace inactivo no se muestra en ninguna parte.
        if (product.status && product.status !== 'active') {
          if (existingMap.get(product.id)?.status === 'active') {
            toDeactivate.push(String(product.id));
          }
          return;
        }

        const mainPrice = product.price?.find(p => p.main === true);
        const price = mainPrice ? parseFloat(mainPrice.price) : 0;
        const cost = product.inventory?.unitCost ? parseFloat(product.inventory.unitCost) : 0;
        const reference = product.reference?.reference || product.reference || '';
        const category = product.itemCategory?.name || product.category?.name || '';

        const favoriteImage = product.images?.find(img => img.favorite === true) || product.images?.[0];
        const imageUrl = favoriteImage ? favoriteImage.url : '';

        // El impuesto del producto, para poder mostrar el precio CON IVA sin
        // volver a consultar Alegra. Se suman las tasas porque un producto
        // puede traer más de un impuesto. Si no trae ninguno queda en 0, que
        // es distinto de NULL ("nunca se sincronizó") — ver la migración
        // add_tax_percentage_products_cache.sql.
        const taxPercentage = (product.tax || []).reduce(
          (suma, t) => suma + (parseFloat(t.percentage) || 0),
          0
        );

        const productData = {
          alegraId: product.id,
          name: product.name,
          reference: reference,
          description: product.description || '',
          category: category,
          price: price,
          cost: cost,
          taxPercentage: taxPercentage,
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
          // Un producto ya guardado con la tasa correcta no cambia nunca por
          // acá, pero los que vienen de antes de esta columna están en NULL:
          // sin comparar el impuesto, la sincronización los da por iguales y
          // el catálogo de clientes les muestra el precio sin IVA para
          // siempre. `!=` con null a propósito, para que NULL != 0 también
          // dispare la actualización de un producto exento.
          const taxDiff = existing.taxPercentage === null
            || existing.taxPercentage === undefined
            || Math.abs(existing.taxPercentage - productData.taxPercentage) > 0.001;
          // La foto cambió de verdad solo si cambió la ruta; la firma se
          // renueva aparte, cuando le queda poca vida (ver DIAS_MARGEN_FIRMA).
          const imgDiff = rutaImagen(existing.imageUrl) !== rutaImagen(productData.imageUrl);
          const firmaPorVencer = productData.imageUrl
            && vidaRestanteImagen(existing.imageUrl) < DIAS_MARGEN_FIRMA * 86400;

          const hasChanged = nameDiff || priceDiff || costDiff || refDiff || statusDiff || taxDiff || imgDiff || firmaPorVencer;

          if (hasChanged && toUpdate.length < 5) {
            console.log(`🔍 Mismatch for ${productData.alegraId} (${productData.name}):`, {
              name: nameDiff ? `${existing.name} vs ${productData.name}` : 'OK',
              price: priceDiff ? `${existing.price} vs ${productData.price}` : 'OK',
              cost: costDiff ? `${existing.cost} vs ${productData.cost}` : 'OK',
              ref: refDiff ? `'${existing.reference}' vs '${productData.reference}'` : 'OK',
              status: statusDiff ? `${existing.status} vs ${productData.status}` : 'OK',
              tax: taxDiff ? `${existing.taxPercentage} vs ${productData.taxPercentage}` : 'OK',
              img: imgDiff ? `'${rutaImagen(existing.imageUrl)}' vs '${rutaImagen(productData.imageUrl)}'` : 'OK',
              firma: firmaPorVencer ? `vence en ${(vidaRestanteImagen(existing.imageUrl) / 86400).toFixed(1)} días` : 'OK'
            });
          }

          if (hasChanged) {
            toUpdate.push(productData);
          }
        }
      });

      const ausentes = existingProducts
        .filter(existing => !currentAlegraIds.has(existing.alegraId))
        .map(p => p.alegraId);

      // El borrado solo procede con un fetch demostrablemente completo.
      const toDelete = fetchCompleto ? ausentes : [];
      if (!fetchCompleto && ausentes.length > 0) {
        console.warn(`   ⚠️ ${ausentes.length} producto(s) no vinieron en esta sincronización, pero NO se borran: el catálogo se trajo incompleto.`);
      }

      // Segunda guarda, para un fetch "completo" pero anómalo: que Alegra
      // reporte de golpe menos de la mitad del catálogo conocido es mucho más
      // probable que sea un problema de la API que una baja masiva real.
      const UMBRAL_BORRADO_MASIVO = 0.5;
      const borradoMasivo = existingProducts.length > 0 &&
        toDelete.length > existingProducts.length * UMBRAL_BORRADO_MASIVO;
      if (borradoMasivo) {
        console.error(`   ⛔ Se iban a borrar ${toDelete.length} de ${existingProducts.length} productos. Se cancela el borrado por seguridad.`);
        toDelete.length = 0;
      }

      console.log(`📈 Cambios: +${toInsert.length} ~${toUpdate.length} -${toDelete.length} Ø${toDeactivate.length}`);

      const operations = [];

      if (toInsert.length > 0) {
        operations.push(
          this.prisma.alegraProduct.createMany({
            data: toInsert,
            skipDuplicates: true
          })
        );
      }

      // UPDATE multifila. Antes eran lotes de 5 con un `prisma.update` por
      // producto: 1.970 productos = 394 idas y vueltas a Supabase, unos 4½
      // minutos. Con `UPDATE ... FROM (VALUES ...)` es una sentencia por
      // tanda de 200, o sea ~10 viajes en vez de 394.
      if (toUpdate.length > 0) {
        const TAMANO_TANDA = 200;
        // OJO: COLS, los casts, el orden de `valores` y la lista de nombres
        // del VALUES tienen que moverse juntos — acá todo va por posición y
        // desalinear una columna escribe el dato en el campo equivocado sin
        // que Postgres se queje, mientras los tipos calcen.
        const COLS = 12;
        console.log(`📦 Actualizando ${toUpdate.length} productos en ${Math.ceil(toUpdate.length / TAMANO_TANDA)} sentencias`);

        for (let i = 0; i < toUpdate.length; i += TAMANO_TANDA) {
          const tanda = toUpdate.slice(i, i + TAMANO_TANDA);
          const filas = tanda.map((_, idx) => {
            const b = idx * COLS;
            // Los tipos se declaran en la PRIMERA fila del VALUES; Postgres
            // los infiere de ahí para el resto.
            const cast = idx === 0
              ? ['::varchar', '::varchar', '::varchar', '::text', '::varchar',
                 '::numeric', '::numeric', '::numeric', '::varchar', '::varchar', '::varchar', '::text']
              : Array(COLS).fill('');
            return `(${Array.from({ length: COLS }, (_, c) => `$${b + c + 1}${cast[c]}`).join(', ')})`;
          }).join(', ');

          const valores = tanda.flatMap(p => [
            p.alegraId, p.name, p.reference, p.description, p.category,
            p.price, p.cost, p.taxPercentage, p.status, p.type, p.imageUrl, p.searchText
          ]);

          try {
            await query(`
              UPDATE alegra_products_cache AS t SET
                name = v.name, reference = v.reference, description = v.description,
                category = v.category, price = v.price, cost = v.cost,
                tax_percentage = v.tax_percentage,
                status = v.status, type = v.type, image_url = v.image_url,
                search_text = v.search_text, updated_at = NOW()
              FROM (VALUES ${filas}) AS v(alegra_id, name, reference, description, category,
                                          price, cost, tax_percentage, status, type, image_url, search_text)
              WHERE t.alegra_id = v.alegra_id;
            `, valores);
          } catch (error) {
            console.warn(`⚠️ Error actualizando la tanda ${i / TAMANO_TANDA + 1}:`, error.message);
          }
        }
      }

      // Bajas en Alegra: una sola sentencia y una sola columna. No pasa por
      // el UPDATE multifila de arriba a propósito — ese escribe las 12
      // columnas por posición y acá lo único que se sabe cierto del producto
      // es que dejó de estar activo.
      if (toDeactivate.length > 0) {
        console.log(`Ø ${toDeactivate.length} producto(s) desactivado(s) en Alegra`);
        try {
          await query(
            `UPDATE alegra_products_cache SET status = 'inactive', updated_at = NOW() WHERE alegra_id = ANY($1::varchar[]);`,
            [toDeactivate]
          );
        } catch (error) {
          console.warn('⚠️ Error marcando productos como inactivos:', error.message);
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
        deactivated: toDeactivate.length,
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
