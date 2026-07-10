const express = require('express');
const router = express.Router();
const axios = require('axios');
const AlegraService = require('../services/alegraService');
const alegraService = new AlegraService();

const prisma = require('../lib/prisma');

/**
 * GET /api/alegra/catalog/productos
 * Obtener productos paginados de la caché local con filtros
 */
router.get('/productos', async (req, res) => {
    try {
        const { search = '', missingImageOnly = 'false', page = '1', limit = '30' } = req.query;
        
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 30;
        const skip = (pageNum - 1) * limitNum;
        
        const isMissingImageOnly = missingImageOnly === 'true';
        
        // Construir filtros de Prisma
        const whereClause = {
            status: 'active',
            hiddenLocally: false
        };
        
        if (search.trim()) {
            whereClause.searchText = {
                contains: search.trim().toLowerCase()
            };
        }
        
        if (isMissingImageOnly) {
            whereClause.OR = [
                { imageUrl: null },
                { imageUrl: '' }
            ];
        }
        
        // Obtener productos y conteo total
        const [productos, total] = await Promise.all([
            prisma.alegraProduct.findMany({
                where: whereClause,
                orderBy: { name: 'asc' },
                skip: skip,
                take: limitNum
            }),
            prisma.alegraProduct.count({
                where: whereClause
            })
        ]);
        
        res.json({
            success: true,
            data: productos,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('❌ Error en GET /catalog/productos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/alegra/catalog/search-images
 * Buscar sugerencias de imágenes en la web utilizando Bing Images Scraping
 */
router.get('/search-images', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || !q.trim()) {
            return res.status(400).json({ success: false, message: 'La consulta de búsqueda (q) es requerida' });
        }
        
        const queryStr = q.trim();
        console.log(`🔍 Buscando imágenes sugeridas en Bing para: "${queryStr}"...`);
        
        const url = `https://www.bing.com/images/search?q=${encodeURIComponent(queryStr)}`;
        
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
            },
            timeout: 15000
        });
        
        const html = response.data;
        const images = [];
        
        // Intentar extraer metadatos JSON del atributo m de la clase iusc de Bing (Método moderno)
        const mRegex = /m=\"(\{[^\"]+\})\"/g;
        let match;
        
        while ((match = mRegex.exec(html)) !== null && images.length < 40) {
            try {
                const cleanJson = match[1]
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&amp;/g, '&');
                
                const m = JSON.parse(cleanJson);
                if (m.murl && m.turl) {
                    images.push({
                        url: m.murl,
                        thumbnail: m.turl
                    });
                }
            } catch (e) { /* ignore */ }
        }
        
        // Fallback: Si no se encontró ninguna imagen con el método moderno, usar el método regex tradicional
        if (images.length === 0) {
            const mediaUrlRegex = /mediaurl=([^&"'\s>]+)/g;
            const cdnUrlRegex = /cdnurl=([^&"'\s>]+)/g;
            const originalUrls = [];
            const thumbUrls = [];
            
            let matchFallback;
            while ((matchFallback = mediaUrlRegex.exec(html)) !== null && originalUrls.length < 40) {
                try {
                    const decoded = decodeURIComponent(matchFallback[1]);
                    if (!originalUrls.includes(decoded) && decoded.startsWith('http')) {
                        originalUrls.push(decoded);
                    }
                } catch (e) { /* ignore */ }
            }
            
            while ((matchFallback = cdnUrlRegex.exec(html)) !== null && thumbUrls.length < 40) {
                try {
                    const decoded = decodeURIComponent(matchFallback[1]);
                    if (!thumbUrls.includes(decoded) && decoded.startsWith('http')) {
                        thumbUrls.push(decoded);
                    }
                } catch (e) { /* ignore */ }
            }
            
            const limitCount = Math.min(originalUrls.length, thumbUrls.length);
            for (let i = 0; i < limitCount; i++) {
                images.push({
                    url: originalUrls[i],
                    thumbnail: thumbUrls[i]
                });
            }
            
            if (images.length === 0 && originalUrls.length > 0) {
                originalUrls.forEach(url => {
                    images.push({
                        url: url,
                        thumbnail: url
                    });
                });
            }
        }
        
        console.log(`✅ Búsqueda finalizada: se encontraron ${images.length} imágenes para "${queryStr}"`);
        res.json({ success: true, images });
    } catch (error) {
        console.error('❌ Error en GET /catalog/search-images:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/alegra/catalog/upload-image-url
 * Asignar imagen a un producto descargándola de una URL
 */
router.post('/upload-image-url', async (req, res) => {
    try {
        const { alegraId, imageUrl } = req.body;
        
        if (!alegraId || !imageUrl) {
            return res.status(400).json({ success: false, message: 'alegraId e imageUrl son requeridos' });
        }
        
        console.log(`🖼️ Asignando imagen a producto ${alegraId} desde URL...`);
        const result = await alegraService.downloadAndUploadProductImage(alegraId, imageUrl);
        
        if (result.success) {
            // Actualizar la base de datos local
            await prisma.alegraProduct.update({
                where: { alegraId: String(alegraId) },
                data: {
                    imageUrl: imageUrl,
                    updatedAt: new Date()
                }
            });
            
            res.json({ success: true, imageUrl: imageUrl, message: 'Imagen asignada exitosamente al producto' });
        } else {
            res.status(400).json({ success: false, message: 'No se pudo subir la imagen a Alegra' });
        }
    } catch (error) {
        console.error('❌ Error en POST /catalog/upload-image-url:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/alegra/catalog/duplicate-brand
 * Duplicar un producto agregándole una nueva marca
 */
router.post('/duplicate-brand', async (req, res) => {
    try {
        const { originalProductId, brandName, newCode, newPrice, newCost, imageUrl } = req.body;
        
        if (!originalProductId || !brandName || !newCode || newPrice === undefined) {
            return res.status(400).json({ success: false, message: 'Campos requeridos faltantes (originalProductId, brandName, newCode, newPrice)' });
        }
        
        console.log(`📋 Duplicando producto ${originalProductId} para marca "${brandName}"...`);
        
        // 1. Obtener detalles del producto original de Alegra
        const originalProduct = await alegraService.api.get(`/items/${originalProductId}`)
            .then(res => res.data)
            .catch(err => {
                console.error(`❌ Error obteniendo producto original ${originalProductId} de Alegra:`, err.message);
                throw new Error('No se pudo encontrar el producto original en Alegra');
            });
            
        // 2. Construir los datos del nuevo producto duplicado
        const newPriceVal = parseFloat(newPrice);
        const newCostVal = parseFloat(newCost) || 0;
        
        // Alegra usa array para precios: [{ idPriceList: "1", price: "..." }]
        const priceList = originalProduct.price || [];
        const newPriceArray = priceList.map(pl => {
            if (pl.main === true) {
                return { ...pl, price: newPriceVal.toString() };
            }
            return pl;
        });
        
        if (newPriceArray.length === 0) {
            newPriceArray.push({ price: newPriceVal.toString(), main: true });
        }
        
        const newProductData = {
            name: `${originalProduct.name} - ${brandName}`,
            reference: newCode.trim(),
            description: originalProduct.description || '',
            itemCategory: originalProduct.itemCategory ? { id: originalProduct.itemCategory.id } : undefined,
            price: newPriceArray,
            tax: originalProduct.tax || [],
            unit: originalProduct.unit || 'unit',
            inventory: {
                unitCost: newCostVal.toString(),
                initialQuantity: '0' // Iniciamos en 0 unidades
            },
            status: 'active',
            type: originalProduct.type || 'product'
        };
        
        // 3. Crear el nuevo producto en Alegra
        console.log('➕ Creando producto duplicado en Alegra...');
        const createResponse = await alegraService.api.post('/items', newProductData);
        const newProductAlegra = createResponse.data;
        
        console.log(`✅ Producto creado exitosamente en Alegra con ID: ${newProductAlegra.id}`);
        
        // 4. Si hay imagen, descargarla e introducirla
        let finalImageUrl = '';
        if (imageUrl) {
            try {
                console.log(`🖼️ Subiendo imagen a producto duplicado ${newProductAlegra.id}...`);
                const imgResult = await alegraService.downloadAndUploadProductImage(newProductAlegra.id, imageUrl);
                if (imgResult.success) {
                    finalImageUrl = imageUrl;
                }
            } catch (err) {
                console.error('⚠️ Error subiendo imagen (continuando):', err.message);
            }
        }
        
        // 5. Guardar en base de datos local (Prisma caché)
        const categoryName = newProductAlegra.itemCategory?.name || '';
        const cachedProduct = await prisma.alegraProduct.create({
            data: {
                alegraId: String(newProductAlegra.id),
                name: newProductAlegra.name,
                reference: newProductAlegra.reference || '',
                description: newProductAlegra.description || '',
                category: categoryName,
                price: newPriceVal,
                cost: newCostVal,
                status: 'active',
                type: newProductAlegra.type || 'product',
                imageUrl: finalImageUrl,
                searchText: `${newProductAlegra.name} ${newProductAlegra.reference || ''} ${newProductAlegra.description || ''}`.toLowerCase()
            }
        });
        
        res.json({
            success: true,
            data: cachedProduct,
            message: 'Producto duplicado para la marca creado exitosamente'
        });
        
    } catch (error) {
        console.error('❌ Error en POST /catalog/duplicate-brand:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/alegra/catalog/productos/:id
 * Editar datos básicos de un producto en Alegra y en la caché local
 */
router.put('/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, reference, price, cost } = req.body;
        
        if (!name || !reference || price === undefined) {
            return res.status(400).json({ success: false, message: 'name, reference y price son requeridos' });
        }
        
        console.log(`📝 Editando producto ${id} en Alegra...`);
        
        // Cargar producto original de Alegra para obtener la estructura de precios actual
        const originalProduct = await alegraService.api.get(`/items/${id}`).then(res => res.data);
        const priceList = originalProduct.price || [];
        const newPriceVal = parseFloat(price);
        const newCostVal = parseFloat(cost) || 0;
        
        const newPriceArray = priceList.map(pl => {
            if (pl.main === true) {
                return { ...pl, price: newPriceVal.toString() };
            }
            return pl;
        });
        if (newPriceArray.length === 0) {
            newPriceArray.push({ price: newPriceVal.toString(), main: true });
        }
        
        // Alegra espera que la referencia sea un objeto en solicitudes PUT
        const originalRefType = originalProduct.reference?.type || 'CODE_OF_INTERNAL_USE';
        const referenceObject = {
            type: originalRefType,
            reference: reference.trim()
        };

        const updateData = {
            name: name.trim(),
            reference: referenceObject,
            price: newPriceArray,
            inventory: {
                unitCost: newCostVal.toString()
            }
        };
        
        // Actualizar en Alegra
        const updateResponse = await alegraService.api.put(`/items/${id}`, updateData);
        const updatedAlegra = updateResponse.data;
        
        // Actualizar en caché local
        const cachedProduct = await prisma.alegraProduct.update({
            where: { alegraId: String(id) },
            data: {
                name: updatedAlegra.name,
                reference: updatedAlegra.reference?.reference || updatedAlegra.reference || '',
                price: newPriceVal,
                cost: newCostVal,
                searchText: `${updatedAlegra.name} ${updatedAlegra.reference?.reference || updatedAlegra.reference || ''} ${updatedAlegra.description || ''}`.toLowerCase(),
                updatedAt: new Date()
            }
        });
        
        res.json({
            success: true,
            data: cachedProduct,
            message: 'Producto actualizado exitosamente'
        });
    } catch (error) {
        console.error(`❌ Error en PUT /catalog/productos/${req.params.id}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/alegra/catalog/productos/:id
 * Eliminar un producto en Alegra y en la caché local
 */
router.delete('/productos/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`🗑️ Eliminando producto ${id} en Alegra...`);

        // 1. Eliminar en Alegra
        await alegraService.api.delete(`/items/${id}`);

        // 2. Eliminar en la caché local (Prisma)
        await prisma.alegraProduct.delete({
            where: { alegraId: String(id) }
        });

        console.log(`✅ Producto ${id} eliminado correctamente`);
        res.json({ success: true, hidden: false, message: 'Producto eliminado exitosamente' });
    } catch (error) {
        const id = req.params.id;
        const alegraCode = error.response?.data?.code;
        const alegraMsg = error.response?.data?.message;

        // Alegra no permite eliminar ítems con documentos asociados (code 1015).
        // En ese caso lo ocultamos localmente en vez de fallar.
        if (alegraCode === 1015) {
            console.warn(`⚠️ Producto ${id} tiene documentos asociados en Alegra, ocultando localmente en vez de eliminar`);
            await prisma.alegraProduct.update({
                where: { alegraId: String(id) },
                data: { hiddenLocally: true }
            });
            return res.json({
                success: true,
                hidden: true,
                message: 'El producto tiene facturas asociadas en Alegra y no puede eliminarse, así que se ocultó del catálogo local'
            });
        }

        console.error(`❌ Error en DELETE /catalog/productos/${req.params.id}:`, error.message);
        const status = error.response?.status || 500;
        res.status(status).json({
            success: false,
            error: alegraMsg || error.message,
            hint: alegraMsg
                ? 'El producto puede tener facturas o movimientos asociados en Alegra y no puede eliminarse'
                : undefined
        });
    }
});

module.exports = router;
