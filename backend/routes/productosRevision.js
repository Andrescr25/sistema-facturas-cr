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
 * Obtener productos relacionados con filtros (RELACIONES ÚNICAS)
 */
router.get('/relacionados', async (req, res) => {
    try {
        const { proveedor, estado, busqueda, page = 1, limit = 20 } = req.query;

        console.log('📊 Obteniendo relaciones únicas de productos...');

        const filtros = {};

        if (proveedor) {
            filtros.supplierName = {
                contains: proveedor,
                mode: 'insensitive'
            };
        }

        if (busqueda) {
            filtros.OR = [
                {
                    supplierDesc: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                },
                {
                    supplierCode: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                },
                {
                    alegraName: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                },
                {
                    alegraReference: {
                        contains: busqueda,
                        mode: 'insensitive'
                    }
                }
            ];
        }

        const skip = (page - 1) * limit;

        // 🔧 CORREGIDO: Obtener todas las relaciones y eliminar duplicados por mapeo único
        const todasLasRelaciones = await prisma.supplierProductMapping.findMany({
            where: filtros,
            orderBy: [
                { confidence: 'desc' },
                { supplierName: 'asc' },
                { supplierCode: 'asc' }
            ]
        });

        // 🔧 CORREGIDO: Eliminar duplicados agrupando por supplierCedula + supplierCode
        // Si hay múltiples mapeos con el mismo proveedor y código, usar el más reciente o con mayor confianza
        const mapeosUnicos = new Map();
        todasLasRelaciones.forEach(mapeo => {
            const key = `${mapeo.supplierCedula}-${mapeo.supplierCode}`;
            const existente = mapeosUnicos.get(key);
            
            if (!existente) {
                mapeosUnicos.set(key, mapeo);
            } else {
                // Si ya existe, mantener el que tenga mayor confianza o sea más reciente
                if (mapeo.confidence > existente.confidence || 
                    (mapeo.confidence === existente.confidence && mapeo.lastUsedDate > existente.lastUsedDate)) {
                    mapeosUnicos.set(key, mapeo);
                }
            }
        });

        const relacionesUnicas = Array.from(mapeosUnicos.values());
        
        // Aplicar paginación después de eliminar duplicados
        const total = relacionesUnicas.length;
        const relaciones = relacionesUnicas.slice(skip, skip + parseInt(limit));

        // Formatear relaciones para el frontend
        const productosFormateados = relaciones.map(mapeo => {
            return {
                id: mapeo.id,
                // Datos del proveedor
                proveedor: {
                    nombre: mapeo.supplierName,
                    cedula: mapeo.supplierCedula
                },
                codigo: mapeo.supplierCode,
                codigoProveedor: mapeo.supplierCode, // Para compatibilidad
                descripcion: mapeo.supplierDesc,

                // Datos de Alegra
                alegraItemId: mapeo.alegraItemId,
                alegraReference: mapeo.alegraReference,
                alegraName: mapeo.alegraName,

                // Metadatos de la relación
                confianza: mapeo.confidence || 0,
                origen: mapeo.origen || 'manual',
                factorConversion: mapeo.factorConversion || 1,
                timesUsed: mapeo.timesUsed || 0,
                createdDate: mapeo.createdDate,
                lastUsedDate: mapeo.lastUsedDate,
                estadoRelacionado: 'RELACIONADO', // Todos los productos de este endpoint están relacionados

                // Información de relación (para compatibilidad con frontend)
                mapeo: {
                    id: mapeo.id,
                    alegraItemId: mapeo.alegraItemId,
                    alegraName: mapeo.alegraName,
                    alegraReference: mapeo.alegraReference,
                    confidence: mapeo.confidence,
                    factorConversion: mapeo.factorConversion || 1
                }
            };
        });

        res.json({
            success: true,
            productos: productosFormateados,
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
 * Obtener todas las relaciones de un producto específico (con diferentes proveedores)
 * Útil para ver todas las relaciones de un producto de Alegra con diferentes proveedores
 */
router.get('/producto/:alegraItemId/relaciones', async (req, res) => {
    try {
        const { alegraItemId } = req.params;

        console.log(`🔍 Obteniendo todas las relaciones para producto Alegra: ${alegraItemId}`);

        // Buscar todas las relaciones que apuntan a este producto de Alegra
        const relaciones = await prisma.supplierProductMapping.findMany({
            where: {
                alegraItemId: alegraItemId.toString()
            },
            orderBy: [
                { confidence: 'desc' },
                { lastUsedDate: 'desc' }
            ],
            include: {
                productos: {
                    select: {
                        id: true,
                        codigoProveedor: true,
                        descripcion: true,
                        precioUnitario: true,
                        descuento: true,
                        impuesto: true,
                        cantidad: true,
                        factura: {
                            select: {
                                proveedorNombre: true,
                                proveedorCedula: true,
                                fechaEmision: true
                            }
                        }
                    },
                    orderBy: {
                        factura: {
                            fechaEmision: 'desc'
                        }
                    },
                    take: 5 // Solo los últimos 5 productos para no sobrecargar
                }
            }
        });

        // Formatear respuesta - VERSIÓN SIMPLIFICADA
        // Obtener último precio de costo por proveedor desde facturas (CON DESCUENTOS E IVA)
        const relacionesFormateadas = relaciones.map((mapeo) => {
            // 🔍 Obtener último precio de costo de ESTE PROVEEDOR desde facturas
            // Calcular el costo real considerando descuentos e IVA (como en revisionPrecios)
            let precioCostoProveedor = null;

            if (mapeo.productos && mapeo.productos.length > 0) {
                // Los productos ya están ordenados por fecha descendente (más reciente primero)
                // Buscar el primer producto con precio válido
                const productoConPrecio = mapeo.productos.find(p => p.precioUnitario && p.precioUnitario > 0);
                if (productoConPrecio) {
                    // Calcular costo real: precioUnitario SIN IVA, aplicar descuento, agregar IVA
                    // En XML de Costa Rica, precioUnitario es SIN IVA
                    const precioUnitarioSinIva = parseFloat(productoConPrecio.precioUnitario) || 0;
                    const descuento = parseFloat(productoConPrecio.descuento) || 0;
                    const cantidad = parseFloat(productoConPrecio.cantidad) || 1;
                    
                    // Calcular porcentaje de descuento
                    const montoTotalSinDescuento = precioUnitarioSinIva * cantidad;
                    const descuentoPorcentaje = montoTotalSinDescuento > 0 
                        ? (descuento / montoTotalSinDescuento) * 100
                        : 0;
                    
                    // Costo = precioUnitario SIN IVA con descuento aplicado, luego multiplicar por 1.13 (IVA)
                    const costoSinIvaConDescuento = precioUnitarioSinIva * (1 - descuentoPorcentaje / 100);
                    const costoConIva = costoSinIvaConDescuento * 1.13; // Agregar IVA 13%
                    
                    precioCostoProveedor = Math.round(costoConIva * 100) / 100;
                    
                    console.log(`   💰 Costo calculado para ${mapeo.supplierName}:`);
                    console.log(`      Precio sin IVA: ₡${precioUnitarioSinIva.toFixed(2)}`);
                    console.log(`      Descuento: ${descuentoPorcentaje.toFixed(2)}% (₡${descuento.toFixed(2)})`);
                    console.log(`      Costo final con IVA: ₡${precioCostoProveedor.toFixed(2)}`);
                }
            }

            return {
                mapeoId: mapeo.id,
                proveedor: {
                    nombre: mapeo.supplierName,
                    cedula: mapeo.supplierCedula
                },
                codigoProveedor: mapeo.supplierCode,
                descripcionProveedor: mapeo.supplierDesc,
                productoAlegra: {
                    id: mapeo.alegraItemId,
                    reference: mapeo.alegraReference,
                    name: mapeo.alegraName
                },
                confianza: mapeo.confidence,
                factorConversion: mapeo.factorConversion || 1,
                vecesUsado: mapeo.timesUsed,
                // Precio de costo del proveedor (último precio pagado con descuentos e IVA aplicados)
                precio: precioCostoProveedor
            };
        });

        // Ordenar por precio de costo (ascendente) - el más bajo primero
        // Los que no tienen precio van al final
        relacionesFormateadas.sort((a, b) => {
            if (a.precio === null && b.precio === null) return 0;
            if (a.precio === null) return 1; // Sin precio al final
            if (b.precio === null) return -1; // Sin precio al final
            return a.precio - b.precio; // Precio más bajo primero
        });

        res.json({
            success: true,
            productoAlegra: {
                id: alegraItemId,
                reference: relaciones[0]?.alegraReference || null,
                name: relaciones[0]?.alegraName || null
            },
            relaciones: relacionesFormateadas,
            total: relacionesFormateadas.length
        });

    } catch (error) {
        console.error('❌ Error obteniendo relaciones del producto:', error);
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

        // Obtener info del producto de Alegra desde caché local o API
        let alegraProduct = await prisma.alegraProduct.findUnique({
            where: { alegraId: alegraItemId.toString() }
        });

        // Si no está en caché, buscar en la API de Alegra
        if (!alegraProduct) {
            console.log(`📡 Producto ${alegraItemId} no en caché, consultando Alegra API...`);
            try {
                const alegraData = await alegraService.getProductById(alegraItemId);
                
                // Extraer reference como string
                const refStr = typeof alegraData.reference === 'object' 
                    ? alegraData.reference?.reference || ''
                    : alegraData.reference || '';
                
                // Guardar en caché para futuras búsquedas
                alegraProduct = await prisma.alegraProduct.create({
                    data: {
                        alegraId: alegraData.id.toString(),
                        name: alegraData.name,
                        reference: refStr,
                        price: alegraData.price?.[0]?.price || 0,
                        searchText: `${alegraData.name} ${refStr}`.toLowerCase()
                    }
                });
                
                console.log(`✅ Producto guardado en caché: ${alegraProduct.name}`);
            } catch (alegraError) {
                console.error('❌ Error obteniendo producto de Alegra:', alegraError);
                return res.status(404).json({
                    success: false,
                    error: `Producto de Alegra no encontrado: ${alegraError.message}`
                });
            }
        }

        // Crear o actualizar mapeo usando upsert
        const mapeo = await prisma.supplierProductMapping.upsert({
            where: {
                supplierCedula_supplierCode: {
                    supplierCedula: producto.factura.proveedorCedula,
                    supplierCode: producto.codigoProveedor
                }
            },
            update: {
                supplierName: producto.factura.proveedorNombre,
                supplierDesc: producto.descripcion,
                alegraItemId: alegraItemId.toString(),
                alegraReference: alegraProduct.reference,
                alegraName: alegraProduct.name,
                confidence: 100,
                lastUsedDate: new Date(),
                timesUsed: { increment: 1 }
            },
            create: {
                supplierName: producto.factura.proveedorNombre,
                supplierCedula: producto.factura.proveedorCedula,
                supplierCode: producto.codigoProveedor,
                supplierDesc: producto.descripcion,
                alegraItemId: alegraItemId.toString(),
                alegraReference: alegraProduct.reference,
                alegraName: alegraProduct.name,
                confidence: 100,
                origen: 'manual' // ✅ Cambiado de 'createdBy' a 'origen'
            }
        });
        console.log(`✅ Mapeo guardado: ID ${mapeo.id}`);

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
            try {
                await prisma.factura.update({
                    where: { id: producto.facturaId },
                    data: {
                        estadoRelacionado: 'RELACIONADO',
                        porcentajeRelacionado: 100
                    }
                });
                console.log(`🎉 Factura ${producto.facturaId} ahora está 100% relacionada`);
            } catch (err) {
                // Ignorar si las columnas no existen aún (migración pendiente)
                console.log(`⚠️ No se pudo actualizar estado de factura (migración pendiente): ${err.message}`);
            }
        } else {
            try {
                await prisma.factura.update({
                    where: { id: producto.facturaId },
                    data: {
                        porcentajeRelacionado: porcentajeRelacionado
                    }
                });
            } catch (err) {
                // Ignorar si las columnas no existen aún
                console.log(`⚠️ No se pudo actualizar porcentaje (migración pendiente)`);
            }
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
 * 
 * NOTA: El frontend envía el ID del supplierProductMapping (mapeo.id),
 * no el ID del productoFactura. Por lo tanto, buscamos el mapeo y
 * actualizamos todos los productos de factura que lo usan.
 */
router.put('/:mapeoId/editar-relacion', async (req, res) => {
    // 🔧 CORS: Asegurar headers antes de procesar
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    try {
        const { mapeoId } = req.params;
        const { nuevoAlegraItemId, motivo } = req.body;

        console.log(`✏️ Editando relación para mapeo: ${mapeoId} → ${nuevoAlegraItemId}`);

        // Verificar que el mapeo existe
        const mapeo = await prisma.supplierProductMapping.findUnique({
            where: { id: mapeoId },
            include: {
                productos: {
                    take: 1,
                    include: { factura: true }
                }
            }
        });

        if (!mapeo) {
            return res.status(404).json({
                success: false,
                error: 'Relación no encontrada',
                mapeoId: mapeoId
            });
        }
        
        // Obtener un producto de ejemplo para validaciones
        const productoEjemplo = mapeo.productos[0];
        if (!productoEjemplo) {
            return res.status(404).json({
                success: false,
                error: 'No hay productos asociados a esta relación'
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

        // Actualizar el mapeo existente con el nuevo producto de Alegra
        const mapeoActualizado = await prisma.supplierProductMapping.update({
            where: { id: mapeoId },
            data: {
                alegraItemId: nuevoAlegraProduct.alegraId.toString(),
                alegraReference: nuevoAlegraProduct.reference,
                alegraName: nuevoAlegraProduct.name,
                confidence: 100,
                lastUsedDate: new Date(),
                origen: 'manual'
            }
        });

        // Actualizar todos los productos de factura que usan este mapeo
        const resultado = await prisma.productoFactura.updateMany({
            where: {
                mapeoId: mapeoId
            },
            data: {
                alegraItemId: nuevoAlegraItemId.toString(),
                estadoRelacionado: 'RELACIONADO',
                confianza: 100,
                mapeoId: mapeoId // Mantener el mismo mapeoId
            }
        });

        console.log(`✅ Relación editada: ${mapeo.supplierDesc} → ${nuevoAlegraProduct.name}`);
        console.log(`✅ ${resultado.count} producto(s) actualizado(s)`);

        res.json({
            success: true,
            message: `Relación editada exitosamente. ${resultado.count} producto(s) actualizado(s)`,
            productosAfectados: resultado.count,
            mapeo: mapeoActualizado
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
 * 
 * NOTA: El frontend envía el ID del supplierProductMapping (mapeo.id),
 * no el ID del productoFactura. Por lo tanto, buscamos todos los productos
 * de factura que tengan ese mapeoId y los actualizamos a PENDIENTE.
 */
router.delete('/:mapeoId/relacion', async (req, res) => {
    // 🔧 CORS: Asegurar headers antes de procesar
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    try {
        const { mapeoId } = req.params;

        console.log(`🗑️ Eliminando relación para mapeo: ${mapeoId}`);

        // Verificar que el mapeo existe
        const mapeo = await prisma.supplierProductMapping.findUnique({
            where: { id: mapeoId }
        });

        if (!mapeo) {
            console.log(`❌ Mapeo no encontrado con ID: ${mapeoId}`);
            return res.status(404).json({
                success: false,
                error: 'Relación no encontrada',
                mapeoId: mapeoId
            });
        }

        // Buscar todos los productos de factura que usan este mapeo
        const productosAfectados = await prisma.productoFactura.findMany({
            where: {
                mapeoId: mapeoId
            },
            select: {
                id: true,
                descripcion: true
            }
        });

        console.log(`🔍 Encontrados ${productosAfectados.length} productos usando este mapeo`);

        // Actualizar todos los productos que usan este mapeo
        const resultado = await prisma.productoFactura.updateMany({
            where: {
                mapeoId: mapeoId
            },
            data: {
                alegraItemId: null,
                estadoRelacionado: 'PENDIENTE',
                confianza: null,
                mapeoId: null
            }
        });

        console.log(`✅ ${resultado.count} productos actualizados a PENDIENTE`);

        res.json({
            success: true,
            message: `Relación eliminada exitosamente. ${resultado.count} producto(s) actualizado(s) a PENDIENTE`,
            productosAfectados: resultado.count,
            mapeoId: mapeoId
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
            precio, costo, categoria, cantidadInicial, formaFarmaceutica,
            codigoCabys, registroSanitario
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

        console.log('🔍 Producto original de la factura:', {
            descripcion: productoOriginal.descripcion,
            codigoProveedor: productoOriginal.codigoProveedor,
            codigoCabys: productoOriginal.codigoCabys,
            impuesto: productoOriginal.impuesto,
            precioUnitario: productoOriginal.precioUnitario
        });

        // Preparar datos para Alegra
        const productoData = {
            name: nombre.trim(),
            description: descripcion?.trim() || nombre.trim(),
            reference: referencia?.trim() || productoOriginal.codigoProveedor,
            price: parseFloat(precio),
            cost: parseFloat(costo),
            status: 'active',
            type: 'product', // Siempre producto (no servicio) para inventario
            unit: unidad || 'unit'
        };

        // Agregar categoría si se especificó
        if (categoria) {
            productoData.itemCategory = {
                id: parseInt(categoria)
            };
        }

        // Agregar cantidad inicial si se especificó
        if (cantidadInicial && parseFloat(cantidadInicial) > 0) {
            productoData.initialQuantity = parseFloat(cantidadInicial);
        }

        // 🆕 Agregar código CABYS (productKey)
        // Usar el CABYS editado por el usuario, o el original si no fue editado
        const cabysAUsar = codigoCabys?.trim() || productoOriginal.codigoCabys;
        if (cabysAUsar) {
            productoData.productKey = cabysAUsar;
            console.log('✅ Código CABYS agregado:', cabysAUsar);
            if (codigoCabys && codigoCabys !== productoOriginal.codigoCabys) {
                console.log('   📝 CABYS editado por usuario:', productoOriginal.codigoCabys, '→', cabysAUsar);
            }
        }

        // 🆕 Agregar forma farmacéutica y registro sanitario si se especificó (medicamentos)
        if (formaFarmaceutica) {
            productoData.pharmaceuticalForm = formaFarmaceutica;
            console.log('✅ Forma farmacéutica agregada:', formaFarmaceutica);
        }
        
        // 🆕 Agregar registro sanitario si se especificó (medicamentos)
        if (registroSanitario) {
            productoData.sanitaryRegistry = registroSanitario.trim();
            console.log('✅ Registro sanitario agregado:', registroSanitario);
        }

        // 🆕 Agregar impuestos (tax) - Detección automática
        if (productoOriginal.impuesto > 0) {
            // Calcular porcentaje de impuesto correctamente
            // subtotal = totalLinea - impuesto
            // porcentaje = (impuesto / subtotal) * 100
            const subtotal = productoOriginal.totalLinea - productoOriginal.impuesto;
            const porcentajeImpuesto = subtotal > 0 ? (productoOriginal.impuesto / subtotal) * 100 : 0;
            
            console.log(`📊 Impuesto detectado: ${productoOriginal.impuesto}, Subtotal: ${subtotal}, Porcentaje: ${porcentajeImpuesto.toFixed(2)}%`);
            
            // Mapeo de impuestos en Costa Rica para Alegra
            // Basado en los porcentajes más comunes de IVA en Costa Rica
            const mapeoImpuestos = [
                { porcentaje: 0, id: 3, nombre: 'Exento' },
                { porcentaje: 1, id: 6, nombre: 'IVA 1%' },
                { porcentaje: 2, id: 7, nombre: 'IVA 2%' },
                { porcentaje: 4, id: 8, nombre: 'IVA 4%' },
                { porcentaje: 8, id: 9, nombre: 'IVA 8%' },
                { porcentaje: 13, id: 1, nombre: 'IVA 13%' }
            ];
            
            // Encontrar el impuesto más cercano (tolerancia de 0.5%)
            let impuestoSeleccionado = null;
            let menorDiferencia = Infinity;
            
            for (const impuesto of mapeoImpuestos) {
                const diferencia = Math.abs(porcentajeImpuesto - impuesto.porcentaje);
                if (diferencia < menorDiferencia && diferencia < 0.5) {
                    menorDiferencia = diferencia;
                    impuestoSeleccionado = impuesto;
                }
            }
            
            if (impuestoSeleccionado) {
                productoData.tax = [{ id: impuestoSeleccionado.id }];
                console.log(`✅ Impuesto aplicado: ${impuestoSeleccionado.nombre} (${impuestoSeleccionado.porcentaje}%) - ID: ${impuestoSeleccionado.id}`);
            } else {
                console.log(`⚠️ Impuesto ${porcentajeImpuesto.toFixed(2)}% no reconocido - Se aplicará sin impuesto`);
            }
        } else {
            console.log('ℹ️ Producto sin impuesto (exento)');
        }

        console.log('📤 Datos a enviar a Alegra:', productoData);

        // Crear producto en Alegra
        const nuevoProductoAlegra = await alegraService.createProduct(productoData);

        if (!nuevoProductoAlegra || !nuevoProductoAlegra.id) {
            throw new Error('No se pudo crear el producto en Alegra');
        }

        console.log(`✅ Producto creado en Alegra: ${nuevoProductoAlegra.id}`);

        // Si hay imagen, subirla a Alegra usando endpoint /attachment
        if (req.file) {
            try {
                console.log('📸 Subiendo imagen a Alegra...');
                const FormData = require('form-data');
                const formData = new FormData();
                
                // Agregar imagen al FormData
                formData.append('image', req.file.buffer, {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype
                });

                await alegraService.uploadProductImage(nuevoProductoAlegra.id, formData);
                console.log('✅ Imagen subida exitosamente a Alegra');
            } catch (imgError) {
                console.error('⚠️ Error subiendo imagen (continuando):', imgError.message);
                console.error('   Stack:', imgError.stack);
                // No fallar si la imagen no se puede subir
            }
        }

        // Guardar en caché local
        // Extraer el string de reference (puede ser objeto {type, reference} o string)
        const refString = typeof nuevoProductoAlegra.reference === 'object' 
            ? nuevoProductoAlegra.reference?.reference || ''
            : nuevoProductoAlegra.reference || '';
        
        await prisma.alegraProduct.create({
            data: {
                alegraId: nuevoProductoAlegra.id.toString(),
                name: nuevoProductoAlegra.name,
                reference: refString,
                price: nuevoProductoAlegra.price?.[0]?.price || parseFloat(precio),
                searchText: `${nuevoProductoAlegra.name} ${refString}`.toLowerCase()
            }
        }).catch(err => console.error('Error guardando en caché:', err));

        // Crear o actualizar mapeo usando upsert
        const nuevoMapeo = await prisma.supplierProductMapping.upsert({
            where: {
                supplierCedula_supplierCode: {
                    supplierCedula: productoOriginal.factura.proveedorCedula,
                    supplierCode: productoOriginal.codigoProveedor
                }
            },
            update: {
                supplierName: productoOriginal.factura.proveedorNombre,
                supplierDesc: productoOriginal.descripcion,
                alegraItemId: nuevoProductoAlegra.id.toString(),
                alegraReference: refString || referencia || '',
                alegraName: nuevoProductoAlegra.name,
                confidence: 100,
                lastUsedDate: new Date(),
                timesUsed: { increment: 1 },
                origen: 'manual' // ✅ Cambiado de 'createdBy' a 'origen'
            },
            create: {
                supplierName: productoOriginal.factura.proveedorNombre,
                supplierCedula: productoOriginal.factura.proveedorCedula,
                supplierCode: productoOriginal.codigoProveedor,
                supplierDesc: productoOriginal.descripcion,
                alegraItemId: nuevoProductoAlegra.id.toString(),
                alegraReference: refString || referencia || '',
                alegraName: nuevoProductoAlegra.name,
                confidence: 100,
                origen: 'manual' // ✅ Cambiado de 'createdBy' a 'origen'
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
 * Guardar factor de conversión en mapeo
 */
router.post('/factor-conversion', async (req, res) => {
    try {
        const { mapeoId, factorConversion } = req.body;

        console.log(`⚙️ Actualizando factor de conversión: Mapeo ${mapeoId} → Factor ${factorConversion}`);

        if (!mapeoId || !factorConversion) {
            return res.status(400).json({
                success: false,
                error: 'Faltan campos requeridos: mapeoId, factorConversion'
            });
        }

        // Convertir a número con máxima precisión
        const factorNumerico = parseFloat(factorConversion);
        
        // Validar que sea un número válido
        if (isNaN(factorNumerico) || !isFinite(factorNumerico)) {
            return res.status(400).json({
                success: false,
                error: 'Factor de conversión inválido'
            });
        }

        console.log(`   Factor recibido: ${factorConversion} (tipo: ${typeof factorConversion})`);
        console.log(`   Factor parseado: ${factorNumerico} (precisión: ${factorNumerico.toFixed(10)})`);

        const mapeo = await prisma.supplierProductMapping.update({
            where: { id: mapeoId },
            data: {
                factorConversion: factorNumerico
            }
        });

        console.log(`✅ Factor de conversión guardado: ${factorNumerico}`);
        console.log(`   Verificación: ${mapeo.factorConversion}`);

        res.json({
            success: true,
            message: 'Factor de conversión guardado exitosamente',
            mapeo: {
                id: mapeo.id,
                factorConversion: mapeo.factorConversion,
                alegraItemId: mapeo.alegraItemId,
                alegraName: mapeo.alegraName
            }
        });
    } catch (error) {
        console.error('❌ Error guardando factor de conversión:', error);
        res.status(500).json({
            success: false,
            error: error.message
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

/**
 * Obtener información completa de un producto de Alegra
 */
router.get('/info-alegra/:alegraItemId', async (req, res) => {
    try {
        const { alegraItemId } = req.params;

        console.log(`📦 Obteniendo info de producto Alegra ${alegraItemId}`);

        // Buscar en caché local primero
        let producto = await prisma.alegraProduct.findUnique({
            where: { alegraId: alegraItemId.toString() }
        });

        // Si no está en caché, consultar API
        if (!producto) {
            const alegraData = await alegraService.getProductById(alegraItemId);
            
            // Extraer reference como string
            const refStr = typeof alegraData.reference === 'object' 
                ? alegraData.reference?.reference || ''
                : alegraData.reference || '';
            
            // Guardar en caché
            producto = await prisma.alegraProduct.create({
                data: {
                    alegraId: alegraData.id.toString(),
                    name: alegraData.name,
                    reference: refStr,
                    price: alegraData.price?.[0]?.price || 0,
                    searchText: `${alegraData.name} ${refStr}`.toLowerCase()
                }
            });
        }

        // Buscar factor de conversión si existe
        const mapeo = await prisma.supplierProductMapping.findFirst({
            where: {
                alegraItemId: alegraItemId.toString()
            },
            orderBy: {
                lastUsedDate: 'desc'
            }
        });

        res.json({
            success: true,
            producto: {
                ...producto,
                price: parseFloat(producto.price || 0),
                factorConversion: mapeo?.factorConversion || 1
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo producto Alegra:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Eliminar relación de un producto
 */
router.delete('/relacion/:productoId', async (req, res) => {
    // 🔧 CORS: Asegurar headers antes de procesar
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    try {
        const { productoId } = req.params;

        console.log(`🗑️ Eliminando relación del producto ${productoId}`);

        // Obtener producto (ID es UUID string, no número)
        const producto = await prisma.productoFactura.findUnique({
            where: { id: productoId },
            include: { factura: true }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // Actualizar producto a PENDIENTE
        await prisma.productoFactura.update({
            where: { id: productoId },
            data: {
                estadoRelacionado: 'PENDIENTE',
                alegraItemId: null,
                mapeoId: null,
                confianza: null
            }
        });

        // NO eliminar el mapeo global, solo desconectar este producto
        // El mapeo sigue existiendo para futuras facturas

        console.log(`✅ Relación eliminada`);

        res.json({
            success: true,
            message: 'Relación eliminada correctamente'
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
 * Obtener mapeo de un producto
 */
router.get('/mapeo/:productoId', async (req, res) => {
    try {
        const { productoId } = req.params;

        console.log(`🔍 Obteniendo mapeo del producto ${productoId}`);

        const producto = await prisma.productoFactura.findUnique({
            where: { id: productoId },
            include: { factura: true }
        });

        if (!producto) {
            return res.status(404).json({
                success: false,
                error: 'Producto no encontrado'
            });
        }

        // Buscar mapeo
        const mapeo = await prisma.supplierProductMapping.findUnique({
            where: {
                supplierCedula_supplierCode: {
                    supplierCedula: producto.factura.proveedorCedula,
                    supplierCode: producto.codigoProveedor
                }
            }
        });

        if (!mapeo) {
            return res.status(404).json({
                success: false,
                error: 'Mapeo no encontrado'
            });
        }

        res.json({
            success: true,
            mapeo: {
                id: mapeo.id,
                factorConversion: mapeo.factorConversion || 1,
                alegraItemId: mapeo.alegraItemId,
                alegraName: mapeo.alegraName,
                confidence: mapeo.confidence
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo mapeo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Obtener una factura específica con sus productos (desde Prisma)
 */
router.get('/factura/:facturaId', async (req, res) => {
    try {
        const { facturaId } = req.params;

        console.log(`📄 Obteniendo factura de Prisma: ${facturaId}`);

        const factura = await prisma.factura.findUnique({
            where: { id: facturaId },
            include: {
                productos: {
                    include: {
                        mapeo: true
                    }
                }
            }
        });

        if (!factura) {
            return res.status(404).json({
                success: false,
                error: 'Factura no encontrada'
            });
        }

        // Enriquecer productos con información de Alegra
        const productosEnriquecidos = await Promise.all(
            factura.productos.map(async (producto) => {
                let alegraProductInfo = null;

                if (producto.alegraItemId) {
                    // Buscar en caché local
                    const alegraProduct = await prisma.alegraProduct.findUnique({
                        where: { alegraId: producto.alegraItemId }
                    });

                    if (alegraProduct) {
                        alegraProductInfo = {
                            id: alegraProduct.alegraId,
                            name: alegraProduct.name,
                            reference: alegraProduct.reference,
                            price: parseFloat(alegraProduct.price || 0)
                        };
                    } else {
                        // Si no está en caché, consultar API (opcional)
                        try {
                            const alegraData = await alegraService.getProductById(producto.alegraItemId);
                            if (alegraData) {
                                // Extraer reference como string
                                const refStr = typeof alegraData.reference === 'object' 
                                    ? alegraData.reference?.reference || ''
                                    : alegraData.reference || '';
                                
                                alegraProductInfo = {
                                    id: alegraData.id,
                                    name: alegraData.name,
                                    reference: refStr,
                                    price: alegraData.price?.[0]?.price || 0
                                };

                                // Guardar en caché para futuras consultas
                                await prisma.alegraProduct.create({
                                    data: {
                                        alegraId: alegraData.id.toString(),
                                        name: alegraData.name,
                                        reference: refStr,
                                        price: alegraData.price?.[0]?.price || 0,
                                        searchText: `${alegraData.name} ${refStr}`.toLowerCase()
                                    }
                                }).catch(err => console.error('Error guardando en caché:', err));
                            }
                        } catch (err) {
                            console.error(`⚠️ Error obteniendo producto Alegra ${producto.alegraItemId}:`, err.message);
                        }
                    }
                }

                return {
                    ...producto,
                    alegraProductInfo
                };
            })
        );

        res.json({
            success: true,
            data: {
                ...factura,
                productos: productosEnriquecidos
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo factura:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
