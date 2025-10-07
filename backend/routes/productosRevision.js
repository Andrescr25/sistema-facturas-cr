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
 * Crear producto nuevo en Alegra
 */
router.post('/crear', upload.single('image'), async (req, res) => {
    try {
        console.log('📦 Creando producto nuevo...');

        const {
            name, description, reference, unit, price, cost,
            initialQuantity, productoOriginalId, categoryId
        } = req.body;

        // Validaciones
        if (!name || !price || !cost || !productoOriginalId) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos'
            });
        }

        const productoOriginal = await prisma.productoFactura.findUnique({
            where: { id: productoOriginalId },
            include: { factura: true }
        });

        if (!productoOriginal) {
            return res.status(404).json({
                success: false,
                error: 'Producto original no encontrado'
            });
        }

        // Crear en Alegra (esto requerirá más lógica)
        // Por ahora solo creamos el mapeo y lo marcamos como relacionado
        
        res.json({
            success: true,
            message: 'Funcionalidad de creación de producto en desarrollo'
        });
    } catch (error) {
        console.error('❌ Error creando producto:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Buscar productos en Alegra
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

        console.log(`🔍 Buscando en Alegra: "${q}"`);

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
