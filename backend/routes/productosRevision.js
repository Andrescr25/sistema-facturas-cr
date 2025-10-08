const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const AlegraService = require('../services/alegraService');
const multer = require('multer');

const prisma = new PrismaClient({ log: ['error'] });
const alegraService = new AlegraService();

// Configuración de multer para imágenes
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de imagen'), false);
        }
    }
});

/**
 * Obtener productos relacionados con filtros
 */
router.get('/relacionados', async (req, res) => {
    try {
        const { proveedor, estado, busqueda, page = 1, limit = 20 } = req.query;

        console.log('📊 Obteniendo productos relacionados...');

        const filtros = {};

        if (proveedor) {
            filtros.factura = {
                proveedorNombre: {
                    contains: proveedor,
                    mode: 'insensitive'
                }
            };
        }

        if (estado && estado !== 'TODOS') {
            filtros.estadoRelacionado = estado;
        }

        if (busqueda) {
            filtros.OR = [
                {
                    descripcion: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                },
                {
                    codigoProveedor: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        const skip = (page - 1) * limit;

        const [productos, total] = await Promise.all([
            prisma.productoFactura.findMany({
                where: filtros,
                include: {
                    factura: true,
                    mapeo: true
                },
                orderBy: [
                    { estadoRelacionado: 'desc' },
                    { confianza: 'desc' },
                    { factura: { fechaProcesada: 'desc' } }
                ],
                skip: parseInt(skip),
                take: parseInt(limit)
            }),
            prisma.productoFactura.count({ where: filtros })
        ]);

        // Enriquecer con info de Alegra desde BD local
        const productosEnriquecidos = productos.map(producto => {
            let alegraInfo = null;

            if (producto.estadoRelacionado === 'RELACIONADO' && producto.mapeo) {
                alegraInfo = {
                    alegraId: producto.alegraItemId,
                    name: producto.mapeo.alegraName,
                    reference: producto.mapeo.alegraReference
                };
            }

            return {
                ...producto,
                alegraInfo: alegraInfo
            };
        });

        res.json({
            success: true,
            productos: productosEnriquecidos,
            total: total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('❌ Error obteniendo productos relacionados:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Crear nueva relación producto-proveedor con Alegra
 */
router.post('/relacion', async (req, res) => {
    try {
        const { productoProveedorId, alegraItemId, facturaId } = req.body;

        console.log(`🔗 Creando relación: Producto ${productoProveedorId} → Alegra ${alegraItemId}`);

        // Validaciones
        if (!productoProveedorId || !alegraItemId) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos: productoProveedorId, alegraItemId'
            });
        }

        // Obtener producto del proveedor
        const producto = await prisma.productoFactura.findUnique({
            where: { id: productoProveedorId },
            include: { factura: true }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto del proveedor no encontrado'
            });
        }

        // Obtener info del producto de Alegra desde caché local
        const alegraProduct = await prisma.alegraProduct.findUnique({
            where: { alegraId: alegraItemId.toString() }
        });

        if (!alegraProduct) {
            return res.status(404).json({
                success: false,
                error: 'Producto de Alegra no encontrado en caché'
            });
        }

        // Crear o actualizar mapeo
        let mapeo = await prisma.supplierProductMapping.findFirst({
            where: {
                supplierCedula: producto.factura.proveedorCedula,
                supplierCode: producto.codigoProveedor,
                alegraItemId: alegraItemId.toString()
            }
        });

        if (!mapeo) {
            mapeo = await prisma.supplierProductMapping.create({
                data: {
                    supplierName: producto.factura.proveedorNombre,
                    supplierCedula: producto.factura.proveedorCedula,
                    supplierCode: producto.codigoProveedor,
                    supplierDesc: producto.descripcion,
                    alegraItemId: alegraItemId.toString(),
                    alegraReference: alegraProduct.reference,
                    alegraName: alegraProduct.name,
                    confidence: 100,
                    createdBy: 'manual_relation'
                }
            });
            console.log(`✅ Mapeo creado: ID ${mapeo.id}`);
        } else {
            console.log(`✅ Mapeo ya existe: ID ${mapeo.id}`);
        }

        // Actualizar producto como RELACIONADO
        const productoActualizado = await prisma.productoFactura.update({
            where: { id: productoProveedorId },
            data: {
                alegraItemId: alegraItemId.toString(),
                estadoRelacionado: 'RELACIONADO',
                confianza: 100,
                mapeoId: mapeo.id
            }
        });

        // Verificar si todos los productos de la factura están relacionados
        const totalProductos = await prisma.productoFactura.count({
            where: { facturaId: producto.facturaId }
        });

        const productosRelacionados = await prisma.productoFactura.count({
            where: {
                facturaId: producto.facturaId,
                estadoRelacionado: 'RELACIONADO'
            }
        });

        const porcentajeRelacionado = Math.round((productosRelacionados / totalProductos) * 100);

        // Si está 100% relacionado, actualizar estado de la factura
        if (porcentajeRelacionado === 100) {
            await prisma.factura.update({
                where: { id: producto.facturaId },
                data: {
                    estadoRelacionado: 'RELACIONADO',
                    porcentajeRelacionado: 100
                }
            });
            console.log(`🎉 Factura ${producto.facturaId} ahora está 100% relacionada`);
        } else {
            await prisma.factura.update({
                where: { id: producto.facturaId },
                data: {
                    porcentajeRelacionado: porcentajeRelacionado
                }
            });
        }

        console.log(`✅ Producto relacionado: ${producto.descripcion} → ${alegraProduct.name}`);

        res.json({
            success: true,
            message: 'Producto relacionado exitosamente',
            producto: productoActualizado,
            mapeo: mapeo,
            porcentajeRelacionado: porcentajeRelacionado,
            facturaCompleta: porcentajeRelacionado === 100
        });
    } catch (error) {
        console.error('❌ Error creando relación:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Ajustar cantidad y/o precio de producto
 */
router.post('/ajustar', async (req, res) => {
    try {
        const { productoId, nuevaCantidad, nuevoPrecio, alegraItemId } = req.body;

        console.log(`⚙️ Ajustando producto: ${productoId}`);

        const productoActual = await prisma.productoFactura.findUnique({
            where: { id: productoId }
        });

        if (!productoActual) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        const cantidadFinal = nuevaCantidad || productoActual.cantidad;
        const precioFinal = nuevoPrecio || productoActual.precioUnitario;
        const totalLineaFinal = cantidadFinal * precioFinal;

        // Si se actualiza precio Y hay alegraItemId, actualizar precio en Alegra
        if (nuevoPrecio && alegraItemId) {
            try {
                const impuestoTotal = productoActual.impuesto || 0;
                const totalSinImpuesto = productoActual.totalLinea - impuestoTotal;
                const porcentajeImpuesto = totalSinImpuesto > 0 ? (impuestoTotal / totalSinImpuesto) * 100 : 0;
                const factorIVA = 1 + (porcentajeImpuesto / 100);
                const precioSinIVA = nuevoPrecio / factorIVA;

                await alegraService.updateProductPrice(alegraItemId, precioSinIVA);
                console.log(`✅ Precio actualizado en Alegra: ${alegraItemId}`);
            } catch (alegraError) {
                console.error('❌ Error actualizando precio en Alegra:', alegraError);
            }
        }

        const datosActualizacion = {};
        if (nuevaCantidad) datosActualizacion.cantidad = cantidadFinal;
        if (nuevoPrecio) datosActualizacion.precioUnitario = precioFinal;
        if (nuevaCantidad || nuevoPrecio) datosActualizacion.totalLinea = totalLineaFinal;

        const productoActualizado = await prisma.productoFactura.update({
            where: { id: productoId },
            data: datosActualizacion
        });

        res.json({
            success: true,
            message: 'Producto ajustado exitosamente',
            cambios: {
                cantidadAnterior: productoActual.cantidad,
                cantidadNueva: productoActualizado.cantidad,
                precioAnterior: productoActual.precioUnitario,
                precioNuevo: productoActualizado.precioUnitario,
                totalAnterior: productoActual.totalLinea,
                totalNuevo: productoActualizado.totalLinea,
                actualizoAlegra: !!(nuevoPrecio && alegraItemId)
            },
            producto: productoActualizado
        });
    } catch (error) {
        console.error('❌ Error ajustando producto:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Editar relación existente
 */
router.put('/:productoId/editar-relacion', async (req, res) => {
    try {
        const { productoId } = req.params;
        const { nuevoAlegraItemId, motivo } = req.body;

        console.log(`✏️ Editando relación: ${productoId} → ${nuevoAlegraItemId}`);

        const producto = await prisma.productoFactura.findUnique({
            where: { id: productoId },
            include: { factura: true, mapeo: true }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // Obtener info del nuevo producto de Alegra
        const nuevoAlegraProduct = await prisma.alegraProduct.findUnique({
            where: { alegraId: nuevoAlegraItemId }
        });

        if (!nuevoAlegraProduct) {
            return res.status(404).json({
                success: false,
                error: 'Nuevo producto de Alegra no encontrado'
            });
        }

        // Crear nuevo mapeo
        const nuevoMapeo = await prisma.supplierProductMapping.create({
            data: {
                supplierName: producto.factura.proveedorNombre,
                supplierCedula: producto.factura.proveedorCedula,
                supplierCode: producto.codigoProveedor,
                supplierDesc: producto.descripcion,
                alegraItemId: nuevoAlegraProduct.alegraId,
                alegraReference: nuevoAlegraProduct.reference,
                alegraName: nuevoAlegraProduct.name,
                confidence: 100,
                createdBy: 'manual_edit'
            }
        });

        // Actualizar producto
        const productoActualizado = await prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                alegraItemId: nuevoAlegraItemId,
                estadoRelacionado: 'RELACIONADO',
                confianza: 100,
                mapeoId: nuevoMapeo.id
            }
        });

        console.log(`✅ Relación editada: ${producto.descripcion} → ${nuevoAlegraProduct.name}`);

        res.json({
            success: true,
            message: 'Relación editada exitosamente',
            producto: productoActualizado,
            nuevoMapeo: nuevoMapeo
        });
    } catch (error) {
        console.error('❌ Error editando relación:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Eliminar relación (volver a pendiente)
 */
router.delete('/:productoId/relacion', async (req, res) => {
    try {
        const { productoId } = req.params;

        console.log(`🗑️ Eliminando relación: ${productoId}`);

        const producto = await prisma.productoFactura.findUnique({
            where: { id: productoId }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        const productoActualizado = await prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                alegraItemId: null,
                estadoRelacionado: 'PENDIENTE',
                confianza: null,
                mapeoId: null
            }
        });

        res.json({
            success: true,
            message: 'Relación eliminada exitosamente',
            producto: productoActualizado
        });
    } catch (error) {
        console.error('❌ Error eliminando relación:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Crear producto nuevo en Alegra - COMPLETO
 */
router.post('/crear', upload.single('imagen'), async (req, res) => {
    try {
        console.log('📦 Creando producto nuevo en Alegra...');
        console.log('📝 Datos recibidos:', req.body);
        console.log('🖼️ Imagen recibida:', req.file ? req.file.originalname : 'Sin imagen');

        const {
            productoId, nombre, descripcion, referencia, unidad, 
            precio, costo, categoria, cantidadInicial
        } = req.body;

        // Validaciones
        if (!nombre || !precio || !costo || !productoId) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos: nombre, precio, costo, productoId'
            });
        }

        const productoOriginal = await prisma.productoFactura.findUnique({
            where: { id: productoId },
            include: { factura: true }
        });

        if (!productoOriginal) {
            return res.status(404).json({
                success: false,
                error: 'Producto original no encontrado'
            });
        }

        // Preparar datos para Alegra
        const productoData = {
            name: nombre.trim(),
            description: descripcion?.trim() || nombre.trim(),
            reference: referencia?.trim() || productoOriginal.codigoProveedor,
            price: parseFloat(precio),
            status: 'active',
            type: categoria === '1' ? 'product' : 'service',
            unit: unidad || 'unit',
            category: {
                id: parseInt(categoria) || 2 // Default: Consumo
            }
        };

        // Agregar cantidad inicial si se especificó
        if (cantidadInicial && parseFloat(cantidadInicial) > 0) {
            productoData.initialQuantity = parseFloat(cantidadInicial);
        }

        console.log('📤 Datos a enviar a Alegra:', productoData);

        // Crear producto en Alegra
        const nuevoProductoAlegra = await alegraService.createProduct(productoData);

        if (!nuevoProductoAlegra || !nuevoProductoAlegra.id) {
            throw new Error('No se pudo crear el producto en Alegra');
        }

        console.log(`✅ Producto creado en Alegra: ${nuevoProductoAlegra.id}`);

        // Si hay imagen, subirla a Alegra
        if (req.file) {
            try {
                console.log('📸 Subiendo imagen a Alegra...');
                const FormData = require('form-data');
                const formData = new FormData();
                formData.append('image', req.file.buffer, {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype
                });

                await alegraService.uploadProductImage(nuevoProductoAlegra.id, formData);
                console.log('✅ Imagen subida exitosamente');
            } catch (imgError) {
                console.error('⚠️ Error subiendo imagen (continuando):', imgError.message);
                // No fallar si la imagen no se puede subir
            }
        }

        // Guardar en caché local
        await prisma.alegraProduct.create({
            data: {
                alegraId: nuevoProductoAlegra.id.toString(),
                name: nuevoProductoAlegra.name,
                reference: nuevoProductoAlegra.reference || '',
                price: nuevoProductoAlegra.price?.[0]?.price || parseFloat(precio),
                searchText: `${nuevoProductoAlegra.name} ${nuevoProductoAlegra.reference || ''}`.toLowerCase()
            }
        }).catch(err => console.error('Error guardando en caché:', err));

        // Crear mapeo
        const nuevoMapeo = await prisma.supplierProductMapping.create({
            data: {
                supplierName: productoOriginal.factura.proveedorNombre,
                supplierCedula: productoOriginal.factura.proveedorCedula,
                supplierCode: productoOriginal.codigoProveedor,
                supplierDesc: productoOriginal.descripcion,
                alegraItemId: nuevoProductoAlegra.id.toString(),
                alegraReference: nuevoProductoAlegra.reference || referencia || '',
                alegraName: nuevoProductoAlegra.name,
                confidence: 100,
                createdBy: 'manual_create'
            }
        });

        // Actualizar producto como RELACIONADO
        await prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                alegraItemId: nuevoProductoAlegra.id.toString(),
                estadoRelacionado: 'RELACIONADO',
                confianza: 100,
                mapeoId: nuevoMapeo.id
            }
        });

        console.log(`✅ Producto relacionado automáticamente: ${productoOriginal.descripcion} → ${nombre}`);

        res.json({
            success: true,
            message: `Producto "${nombre}" creado y relacionado exitosamente`,
            alegraProductId: nuevoProductoAlegra.id,
            mapeoId: nuevoMapeo.id,
            imagenSubida: !!req.file
        });
    } catch (error) {
        console.error('❌ Error creando producto:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Error creando producto en Alegra'
        });
    }
});

/**
 * Buscar productos en Alegra (alias para compatibilidad)
 */
router.get('/buscar', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.json({
                success: false,
                error: 'Término de búsqueda debe tener al menos 2 caracteres',
                productos: []
            });
        }

        console.log(`🔍 Buscando en caché local: "${q}"`);

        // Buscar primero en la caché local de productos de Alegra
        const productos = await prisma.alegraProduct.findMany({
            where: {
                OR: [
                    {
                        name: {
                            contains: q,
                            mode: 'insensitive'
                        }
                    },
                    {
                        reference: {
                            contains: q,
                            mode: 'insensitive'
                        }
                    },
                    {
                        searchText: {
                            contains: q,
                            mode: 'insensitive'
                        }
                    }
                ]
            },
            take: 20,
            orderBy: {
                name: 'asc'
            }
        });

        // Mapear a formato esperado
        const productosFormateados = productos.map(p => ({
            id: p.alegraId,
            name: p.name,
            reference: p.reference,
            price: p.price
        }));

        res.json({
            success: true,
            productos: productosFormateados,
            total: productosFormateados.length
        });
    } catch (error) {
        console.error('❌ Error buscando productos:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            productos: []
        });
    }
});

/**
 * Buscar productos en Alegra (ruta alternativa)
 */
router.get('/buscar-alegra', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.json({
                success: false,
                error: 'Término de búsqueda debe tener al menos 2 caracteres'
            });
        }

        console.log(`🔍 Buscando en Alegra API: "${q}"`);

        const productos = await alegraService.searchProducts(q);

        res.json({
            success: true,
            productos: productos,
            total: productos.length
        });
    } catch (error) {
        console.error('❌ Error buscando en Alegra:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
