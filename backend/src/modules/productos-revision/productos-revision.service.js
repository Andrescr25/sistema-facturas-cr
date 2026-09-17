/**
 * Productos-Revision Module - Service
 * Lógica de negocio para la gestión de relaciones producto proveedor ↔ Alegra
 * (mapeos), ajustes de productos de factura y creación de productos en Alegra.
 */

const prisma = require('../../../lib/prisma');
const { getProductService } = require('../../integrations/alegra');
const { query } = require('../../../config/database');
const { cabysPareceMedicamento } = require('../../utils/medicamento');
const { calcularPorcentajeIva, obtenerImpuestoAlegra, cargarImpuestosAlegra } = require('../../../utils/impuestosAlegra');
const { filaDeCache } = require('../../integrations/alegra/productoCache');
const { calcularCostoUnitarioPropio } = require('../precios/costo');
const { calcularPrecioSugerido } = require('../precios/motor');
const { obtenerConfigPrecios, resolverConfig } = require('../precios/config');
const { sincronizarCostoDeLineas, sincronizarCostoDeMapeo } = require('../precios/costoHistorico');
const {
  palabrasClave,
  normalizarReferencia,
  esReferenciaConfiable,
  calcularScoreCatalogo
} = require('../precios/matcher');

const productService = getProductService();

/**
 * getProductById del servicio de integrations devuelve {success, data};
 * este helper restaura la semántica de data directa o throw que esperan
 * los call sites de este módulo.
 */
async function obtenerProductoAlegra(alegraItemId) {
  const resultado = await productService.getProductById(alegraItemId);
  if (!resultado.success) {
    throw new Error(resultado.error || `No se pudo obtener el producto ${alegraItemId} de Alegra`);
  }
  return resultado.data;
}

/**
 * Error con código de estado HTTP para que el controller responda con el status correcto.
 */
function httpError(status, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

// Tope de productos del catálogo que entran en una búsqueda. Un término corto
// —"bolsa"— calza con cientos, y mandarlos todos en un IN haría la consulta
// más lenta que útil. Con este tope el buscador sigue sirviendo para lo que
// se usa: encontrar UN producto por su nombre.
const MAX_PRODUCTOS_BUSQUEDA = 300;
const MAX_CANDIDATOS_BUSQUEDA_ALEGRA = 80;

function ordenarProductosPorRelevancia(termino, productos, limite = 20) {
  const terminoRef = normalizarReferencia(termino);
  const terminoEsReferencia = esReferenciaConfiable(termino);

  return productos
    .map(producto => {
      const referenciaExacta = terminoEsReferencia &&
        esReferenciaConfiable(producto.reference) &&
        normalizarReferencia(producto.reference) === terminoRef;
      const scoreTexto = calcularScoreCatalogo(termino, producto);

      return {
        ...producto,
        similarityScore: referenciaExacta ? 100 : scoreTexto,
        referenciaExacta
      };
    })
    .sort((a, b) => {
      if (a.referenciaExacta !== b.referenciaExacta) return a.referenciaExacta ? -1 : 1;
      if (a.similarityScore !== b.similarityScore) return b.similarityScore - a.similarityScore;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    })
    .slice(0, limite);
}

/**
 * Obtener productos relacionados con filtros (relaciones únicas por proveedor+código)
 */
async function getRelacionados({ proveedor, busqueda, page = 1, limit = 20 }) {
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
      { supplierDesc: { contains: busqueda, mode: 'insensitive' } },
      { supplierCode: { contains: busqueda, mode: 'insensitive' } },
      // `alegraName` es una FOTO de cuando se creó la relación y nadie la
      // refresca. Se sigue buscando por ahí para que el nombre viejo también
      // encuentre —quien lo recuerde así lo va a teclear—, pero no alcanza.
      { alegraName: { contains: busqueda, mode: 'insensitive' } },
      { alegraReference: { contains: busqueda, mode: 'insensitive' } }
    ];

    // Y TAMBIÉN POR EL NOMBRE DE HOY. La lista muestra el nombre actual del
    // catálogo, así que se podía leer "EXTENSION CTE BLANCA 3 MTS VOLTECK" en
    // pantalla, copiarlo tal cual al buscador y no encontrar nada: la relación
    // lo tiene guardado como "...3 MTS CTE", de antes de que lo renombraran.
    // No poder encontrar algo por el nombre con que la propia pantalla lo
    // llama es de las cosas que hacen desconfiar del buscador entero.
    // Son 98 de 2.056 relaciones las que tienen el nombre desfasado.
    const productos = await query(
      `SELECT alegra_id FROM alegra_products_cache
        WHERE name ILIKE $1 OR reference ILIKE $1
        LIMIT ${MAX_PRODUCTOS_BUSQUEDA}`,
      [`%${busqueda}%`]
    );
    if (productos.rows.length > 0) {
      filtros.OR.push({ alegraItemId: { in: productos.rows.map(f => String(f.alegra_id)) } });
    }
  }

  const skip = (page - 1) * limit;

  const todasLasRelaciones = await prisma.supplierProductMapping.findMany({
    where: filtros,
    orderBy: [
      { confidence: 'desc' },
      { supplierName: 'asc' },
      { supplierCode: 'asc' }
    ]
  });

  // Eliminar duplicados agrupando por supplierCedula + supplierCode:
  // si hay múltiples mapeos, gana el de mayor confianza o el más reciente
  const mapeosUnicos = new Map();
  todasLasRelaciones.forEach(mapeo => {
    const key = `${mapeo.supplierCedula}-${mapeo.supplierCode}`;
    const existente = mapeosUnicos.get(key);

    if (!existente) {
      mapeosUnicos.set(key, mapeo);
    } else if (mapeo.confidence > existente.confidence ||
        (mapeo.confidence === existente.confidence && mapeo.lastUsedDate > existente.lastUsedDate)) {
      mapeosUnicos.set(key, mapeo);
    }
  });

  const relacionesUnicas = Array.from(mapeosUnicos.values());

  // Aplicar paginación después de eliminar duplicados
  const total = relacionesUnicas.length;
  const relaciones = relacionesUnicas.slice(skip, skip + parseInt(limit));

  // `alegra_name` es una FOTO del nombre al momento de crear la relación y
  // nadie la refresca: 73 de 2.011 relaciones mostraban un nombre viejo (p.ej.
  // "EXTENSION CTE BLANCA 3 MTS CTE" cuando en el catálogo ya decía
  // "...VOLTECK"). Se resuelve contra el catálogo actual, igual que se hizo en
  // reporte-proveedores. Si el producto ya no está en el catálogo se conserva
  // el nombre guardado y se marca, en vez de mostrar un hueco.
  const idsAlegra = [...new Set(relaciones.map(r => r.alegraItemId).filter(Boolean).map(String))];
  const catalogo = new Map();
  if (idsAlegra.length > 0) {
    const filas = await query(
      `SELECT alegra_id, name, reference FROM alegra_products_cache WHERE alegra_id::text = ANY($1)`,
      [idsAlegra]
    );
    filas.rows.forEach(f => catalogo.set(String(f.alegra_id), { name: f.name, reference: f.reference }));
  }

  const productosFormateados = relaciones.map(mapeo => {
    const actual = mapeo.alegraItemId ? catalogo.get(String(mapeo.alegraItemId)) : null;
    const nombreActual = actual?.name || mapeo.alegraName;
    const referenciaActual = actual?.reference || mapeo.alegraReference;
    const productoExiste = Boolean(actual);
    const nombreDesactualizado = productoExiste && mapeo.alegraName !== actual.name;

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

      // Datos de Alegra — nombre y referencia ACTUALES del catálogo.
      alegraItemId: mapeo.alegraItemId,
      alegraReference: referenciaActual,
      alegraName: nombreActual,
      // Para poder avisar en pantalla en vez de mostrar un dato muerto.
      alegraNombreGuardado: mapeo.alegraName,
      nombreDesactualizado,
      productoExisteEnCatalogo: productoExiste,

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
        alegraName: nombreActual,
        alegraReference: referenciaActual,
        confidence: mapeo.confidence,
        factorConversion: mapeo.factorConversion || 1
      }
    };
  });

  return {
    productos: productosFormateados,
    total: total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Obtener todas las relaciones de un producto de Alegra (con diferentes proveedores),
 * con el último costo real de cada proveedor (descuento + IVA real de la línea)
 */
async function getRelacionesDeProducto(alegraItemId) {
  console.log(`🔍 Obteniendo todas las relaciones para producto Alegra: ${alegraItemId}`);

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
          totalLinea: true,
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

  const relacionesFormateadas = relaciones.map((mapeo) => {
    // Último costo de ESTE PROVEEDOR desde facturas (con descuento e IVA real).
    //
    // Se devuelven DOS cifras y la que manda es `precioCosto`, ya dividido por
    // el factor de conversión: es el costo de UNA unidad mía. Antes se
    // mostraba solo el costo en la unidad del proveedor, y como cada
    // proveedor vende en presentaciones distintas (uno la caja de 60, otro la
    // unidad), los números de esta pantalla no eran comparables entre sí —
    // que es justo para lo que se abre.
    //
    // `precioCostoProveedor` se mantiene aparte para poder cotejar contra el
    // papel de la factura, donde aparece el precio de la caja.
    let precioCosto = null;
    let precioCostoProveedor = null;
    const factor = parseFloat(mapeo.factorConversion) || 1;

    if (mapeo.productos && mapeo.productos.length > 0) {
      // Los productos ya están ordenados por fecha descendente (más reciente primero)
      const productoConPrecio = mapeo.productos.find(p => p.precioUnitario && p.precioUnitario > 0);
      if (productoConPrecio) {
        const { costoConIva, costoUnitario, descuentoPorcentaje } =
          calcularCostoUnitarioPropio(productoConPrecio, factor);

        precioCostoProveedor = Math.round(costoConIva * 100) / 100;
        precioCosto = Math.round(costoUnitario * 100) / 100;

        console.log(`   💰 Costo calculado para ${mapeo.supplierName}:`);
        console.log(`      Precio sin IVA: ₡${parseFloat(productoConPrecio.precioUnitario).toFixed(2)}`);
        console.log(`      Descuento: ${descuentoPorcentaje.toFixed(2)}% (₡${(parseFloat(productoConPrecio.descuento) || 0).toFixed(2)})`);
        console.log(`      Costo unidad proveedor: ₡${precioCostoProveedor.toFixed(2)} · factor ${factor} → costo unidad mía: ₡${precioCosto.toFixed(2)}`);
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
      factorConversion: factor,
      vecesUsado: mapeo.timesUsed,
      // `precio` = costo de UNA unidad mía (con descuento, IVA y factor).
      // Es el que se muestra y por el que se ordena.
      precio: precioCosto,
      // Costo en la unidad en que factura el proveedor (la caja, el fardo),
      // para poder cotejar contra el papel.
      precioProveedor: precioCostoProveedor
    };
  });

  // Ordenar por costo por unidad propia. Antes se ordenaba por el costo en
  // unidad de proveedor, así que "el más barato" salía mal en cuanto dos
  // proveedores facturaban en presentaciones distintas: una caja de 60 a
  // ₡3.551 se veía más cara que una unidad suelta a ₡80, cuando en realidad
  // sale a ₡59 la unidad.
  relacionesFormateadas.sort((a, b) => {
    if (a.precio === null && b.precio === null) return 0;
    if (a.precio === null) return 1;
    if (b.precio === null) return -1;
    return a.precio - b.precio;
  });

  return {
    productoAlegra: {
      id: alegraItemId,
      reference: relaciones[0]?.alegraReference || null,
      name: relaciones[0]?.alegraName || null
    },
    relaciones: relacionesFormateadas,
    total: relacionesFormateadas.length
  };
}

/**
 * Crear nueva relación producto-proveedor con Alegra
 */
async function crearRelacion({ productoProveedorId, alegraItemId }) {
  console.log(`🔗 Creando relación: Producto ${productoProveedorId} → Alegra ${alegraItemId}`);

  const producto = await prisma.productoFactura.findUnique({
    where: { id: productoProveedorId },
    include: { factura: true }
  });

  if (!producto) {
    throw httpError(404, 'Producto del proveedor no encontrado');
  }

  // Obtener info del producto de Alegra desde caché local o API
  let alegraProduct = await prisma.alegraProduct.findUnique({
    where: { alegraId: alegraItemId.toString() }
  });

  // Si no está en caché, buscar en la API de Alegra
  if (!alegraProduct) {
    console.log(`📡 Producto ${alegraItemId} no en caché, consultando Alegra API...`);
    try {
      const alegraData = await obtenerProductoAlegra(alegraItemId);

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
      throw httpError(404, `Producto de Alegra no encontrado: ${alegraError.message}`);
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
      supplierName: producto.factura.proveedorNombre.trim(),
      supplierDesc: producto.descripcion,
      alegraItemId: alegraItemId.toString(),
      alegraReference: alegraProduct.reference,
      alegraName: alegraProduct.name,
      confidence: 100,
      lastUsedDate: new Date(),
      timesUsed: { increment: 1 }
    },
    create: {
      supplierName: producto.factura.proveedorNombre.trim(),
      supplierCedula: producto.factura.proveedorCedula,
      supplierCode: producto.codigoProveedor,
      supplierDesc: producto.descripcion,
      alegraItemId: alegraItemId.toString(),
      alegraReference: alegraProduct.reference,
      alegraName: alegraProduct.name,
      confidence: 100,
      origen: 'manual'
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

  // El costo de esta compra entra a costo_historico en el momento en que la
  // línea queda relacionada — antes esto solo pasaba al correr el backfill a
  // mano, así que los costos envejecían sin que nadie se enterara.
  await sincronizarCostoDeLineas([productoProveedorId]);

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

  return {
    message: 'Producto relacionado exitosamente',
    producto: productoActualizado,
    mapeo: mapeo,
    porcentajeRelacionado: porcentajeRelacionado,
    facturaCompleta: porcentajeRelacionado === 100
  };
}

/**
 * Ajustar cantidad y/o precio de producto (y opcionalmente el precio en Alegra)
 */
async function ajustarProducto({ productoId, nuevaCantidad, nuevoPrecio, alegraItemId }) {
  console.log(`⚙️ Ajustando producto: ${productoId}`);

  const productoActual = await prisma.productoFactura.findUnique({
    where: { id: productoId }
  });

  if (!productoActual) {
    throw httpError(404, 'Producto no encontrado');
  }

  const cantidadFinal = nuevaCantidad || productoActual.cantidad;
  const precioFinal = nuevoPrecio || productoActual.precioUnitario;
  const totalLineaFinal = cantidadFinal * precioFinal;

  // Si se actualiza precio Y hay alegraItemId, actualizar precio en Alegra
  if (nuevoPrecio && alegraItemId) {
    try {
      // El precio del frontend viene CON IVA; Alegra espera el precio SIN IVA
      const impuestoTotal = productoActual.impuesto || 0;
      const totalSinImpuesto = productoActual.totalLinea - impuestoTotal;
      const porcentajeImpuesto = totalSinImpuesto > 0 ? (impuestoTotal / totalSinImpuesto) * 100 : 0;
      const factorIVA = 1 + (porcentajeImpuesto / 100);
      const precioSinIVA = nuevoPrecio / factorIVA;

      await productService.updateProductPrice(alegraItemId, precioSinIVA);
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

  return {
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
  };
}

/**
 * Editar relación existente.
 *
 * NOTA: El frontend envía el ID del supplierProductMapping (mapeo.id),
 * no el ID del productoFactura. Por lo tanto, buscamos el mapeo y
 * actualizamos todos los productos de factura que lo usan.
 */
async function editarRelacion(mapeoId, nuevoAlegraItemId) {
  console.log(`✏️ Editando relación para mapeo: ${mapeoId} → ${nuevoAlegraItemId}`);

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
    throw httpError(404, 'Relación no encontrada', { mapeoId });
  }

  const productoEjemplo = mapeo.productos[0];
  if (!productoEjemplo) {
    throw httpError(404, 'No hay productos asociados a esta relación');
  }

  // Obtener info del nuevo producto de Alegra
  const nuevoAlegraProduct = await prisma.alegraProduct.findUnique({
    where: { alegraId: nuevoAlegraItemId }
  });

  if (!nuevoAlegraProduct) {
    throw httpError(404, 'Nuevo producto de Alegra no encontrado');
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

  // Cambió el producto de TODAS las líneas de este mapeo: hay que reescribir
  // sus costos para que no queden apuntando al producto anterior.
  await sincronizarCostoDeMapeo(mapeoId);

  console.log(`✅ Relación editada: ${mapeo.supplierDesc} → ${nuevoAlegraProduct.name}`);
  console.log(`✅ ${resultado.count} producto(s) actualizado(s)`);

  return {
    message: `Relación editada exitosamente. ${resultado.count} producto(s) actualizado(s)`,
    productosAfectados: resultado.count,
    mapeo: mapeoActualizado
  };
}

/**
 * Eliminar relación por mapeo (devuelve los productos a PENDIENTE,
 * limpia faltantes que la referencien y borra el mapeo definitivamente).
 *
 * NOTA: El frontend envía el ID del supplierProductMapping (mapeo.id).
 */
async function eliminarRelacionPorMapeo(mapeoId) {
  console.log(`🗑️ Eliminando relación para mapeo: ${mapeoId}`);

  const mapeo = await prisma.supplierProductMapping.findUnique({
    where: { id: mapeoId }
  });

  if (!mapeo) {
    console.log(`❌ Mapeo no encontrado con ID: ${mapeoId}`);
    throw httpError(404, 'Relación no encontrada', { mapeoId });
  }

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

  // Limpiar referencia en faltantes (si existiera)
  const faltantesActualizados = await query(
    `
    UPDATE faltantes
    SET
        mapping_id = NULL,
        proveedor_asignado = NULL,
        proveedor_cedula = NULL,
        precio_asignado = NULL,
        asignacion_tipo = NULL,
        fecha_asignacion = NULL
    WHERE mapping_id = $1
    `,
    [mapeoId]
  );

  if (faltantesActualizados.rowCount > 0) {
    console.log(`🔄 ${faltantesActualizados.rowCount} faltante(s) limpiados (sin proveedor asignado)`);
  }

  // Eliminar el mapping definitivamente
  await prisma.supplierProductMapping.delete({
    where: { id: mapeoId }
  });

  return {
    message: `Relación eliminada exitosamente. ${resultado.count} producto(s) actualizado(s) a PENDIENTE`,
    productosAfectados: resultado.count,
    faltantesActualizados: faltantesActualizados.rowCount,
    mapeoEliminado: true,
    mapeoId: mapeoId
  };
}

/**
 * Crear producto nuevo en Alegra (con imagen opcional), guardarlo en caché
 * local y relacionarlo automáticamente con el producto del proveedor.
 */
/**
 * Qué costo y qué precio proponerle a quien está creando un producto nuevo.
 *
 * POR QUÉ HIZO FALTA
 * El formulario prellenaba AMBOS campos —precio de venta y costo— con el
 * `precioUnitario` de la factura del proveedor. Quien no los cambiaba creaba
 * un producto que se vende al costo: 21 productos del catálogo quedaron así,
 * varios con el precio de venta exactamente igual al costo (CODO SANITARIO
 * ₡792,04 contra ₡792,04; BATERÍA MAXELL ₡703,54 contra ₡703,54).
 *
 * Y el costo tampoco era el costo: `precioUnitario` viene sin IVA, sin el
 * descuento de la línea y sin el factor de conversión. Para la BOTA BELLOTA
 * PVC 27 el formulario proponía ₡4.685 cuando el costo real por unidad
 * propia es ₡4.764,65 — o sea que al aceptar el prellenado se creaba un
 * producto que se vende POR DEBAJO del costo.
 *
 * Acá se calculan las dos cosas bien y con las piezas que ya existen:
 *   costo   calcularCostoUnitarioPropio (con IVA, con descuento, con factor),
 *           que es la convención con la que el resto del sistema escribe
 *           inventory.unitCost en Alegra.
 *   precio  el motor de precios, el mismo que sugiere en Revisión de Precios
 *           (margen real medido por categoría). Sin sugerencia confiable
 *           devuelve null y el formulario deja el campo vacío, en vez de
 *           inventar un número.
 *
 * La categoría llega desde el formulario porque se elige ahí mismo: el
 * margen meta depende de ella, y el producto todavía no existe en Alegra.
 */
async function precioSugerido(productoId, categoriaNombre) {
  const producto = await prisma.productoFactura.findUnique({
    where: { id: productoId },
    include: { mapeo: true }
  });
  if (!producto) throw httpError(404, 'Producto original no encontrado');

  const { costoConIva, costoSinIvaConDescuento, factor, porcentajeIva, descuentoPorcentaje } =
    calcularCostoUnitarioPropio(producto, producto.mapeo?.factorConversion);

  const costoUnitario = costoConIva / factor;   // el que va a Alegra
  const costoSinIva = costoSinIvaConDescuento / factor;

  const configPrecios = await obtenerConfigPrecios();
  const { margenMeta, margenMinimo } = resolverConfig(configPrecios, categoriaNombre || '');

  // Un producto nuevo no tiene rotación ni clientes: el motor usa el margen
  // meta de la categoría sin ajustes, que es lo correcto cuando no hay
  // historia que mirar.
  const sugerencia = calcularPrecioSugerido({
    costoSinIva,
    margenMetaCategoria: margenMeta,
    margenMinimoCategoria: margenMinimo,
    unidadesMes: null,
    clientesDistintos: null
  });

  const redondear = (n) => Math.round(n * 100) / 100;

  return {
    costoUnitario: redondear(costoUnitario),
    costoSinIva: redondear(costoSinIva),
    porcentajeIva: redondear(porcentajeIva),
    descuentoPorcentaje: redondear(descuentoPorcentaje),
    factor,
    categoria: categoriaNombre || '(sin categoría)',
    precioSugerido: sugerencia?.precioSugerido ?? null,
    margenObjetivo: sugerencia?.margenObjetivo ?? null,
    margenResultante: sugerencia?.margenResultante ?? null
  };
}

async function crearProducto(datos, imagen) {
  const {
    productoId, nombre, descripcion, referencia, unidad,
    precio, costo, categoria, cantidadInicial, formaFarmaceutica,
    codigoCabys, registroSanitario, esMedicamento, categoriaNombre,
    imageUrl, fallbackImageUrl, factorConversion
  } = datos;

  // Si el proveedor factura este producto en una unidad distinta a como se
  // vende (ej: factura 25 sueltos, se vende como 1 paquete de 25), el
  // formulario ya manda "Cantidad Inicial" convertida a la unidad propia —
  // acá solo se normaliza el factor para guardarlo en el mapeo, no se vuelve
  // a aplicar a la cantidad.
  const factorConversionNum = factorConversion ? parseFloat(factorConversion) : null;

  const productoOriginal = await prisma.productoFactura.findUnique({
    where: { id: productoId },
    include: { factura: true }
  });

  if (!productoOriginal) {
    throw httpError(404, 'Producto original no encontrado');
  }

  const normalizarTexto = (texto) => (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const categoriaTexto = normalizarTexto(categoriaNombre);
  const medicineCategoryIds = (process.env.ALEGRA_MEDICINE_CATEGORY_IDS || '22')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  const categoriaEsMedicamento =
    medicineCategoryIds.includes(String(categoria)) ||
    categoriaTexto.includes('medicamento') ||
    categoriaTexto.includes('farmac');

  const cabysAUsar = codigoCabys?.trim() || productoOriginal.codigoCabys;
  const cabysEsMedicamento = cabysPareceMedicamento(cabysAUsar);

  // MANDA LA CASILLA. Antes esto era un OR contra las reglas automáticas, y
  // el CABYS '35' arrastraba pinturas, aceites y cosméticos: quien creaba un
  // producto de línea de ciclo lo desmarcaba en pantalla y el servidor se lo
  // volvía a marcar, exigiéndole forma farmacéutica y registro sanitario que
  // ese producto no tiene ni puede tener.
  //
  // Las reglas automáticas siguen valiendo solo cuando quien envía NO se
  // pronunció (no vino el campo). Si vino 'false', es una decisión tomada.
  const sePronuncio = esMedicamento === 'true' || esMedicamento === 'false';
  const medicamentoMarcado = sePronuncio
    ? esMedicamento === 'true'
    : (categoriaEsMedicamento || cabysEsMedicamento || Boolean(formaFarmaceutica || registroSanitario));
  const formaFarmaceuticaLimpia = formaFarmaceutica?.trim();
  const registroSanitarioLimpio = registroSanitario?.trim();

  if (medicamentoMarcado && (!formaFarmaceuticaLimpia || !registroSanitarioLimpio)) {
    throw httpError(400, 'Para medicamentos debes indicar forma farmacéutica y registro sanitario');
  }

  if (formaFarmaceuticaLimpia) {
    const formCode = parseInt(formaFarmaceuticaLimpia, 10);
    const isValidForm = !isNaN(formCode) && formCode >= 1 && formCode <= 229;
    if (!isValidForm) {
      throw httpError(400, 'Forma farmacéutica inválida');
    }
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
    // Sin descripción se manda vacía, NO el nombre. El fallback `|| nombre`
    // tenía sentido cuando el formulario traía el campo precargado; al
    // quitarlo del modal pasó a duplicar el nombre en Alegra sin que nadie lo
    // pidiera (149 productos del catálogo quedaron así).
    description: descripcion?.trim() || '',
    reference: referencia?.trim() || productoOriginal.codigoProveedor,
    price: parseFloat(precio),
    cost: parseFloat(costo),
    status: 'active',
    type: 'product', // Siempre producto (no servicio) para inventario
    unit: unidad || 'unit'
  };

  if (categoria) {
    productoData.itemCategory = {
      id: parseInt(categoria)
    };
  }

  if (cantidadInicial && parseFloat(cantidadInicial) > 0) {
    productoData.initialQuantity = parseFloat(cantidadInicial);
  }

  // Código CABYS (productKey): el editado por el usuario, o el original
  if (cabysAUsar) {
    productoData.productKey = cabysAUsar;
    console.log('✅ Código CABYS agregado:', cabysAUsar);
    if (codigoCabys && codigoCabys !== productoOriginal.codigoCabys) {
      console.log('   📝 CABYS editado por usuario:', productoOriginal.codigoCabys, '→', cabysAUsar);
    }
  }

  // Forma farmacéutica y registro sanitario (medicamentos)
  if (formaFarmaceuticaLimpia) {
    productoData.pharmaceuticalForm = formaFarmaceuticaLimpia;
    console.log('✅ Forma farmacéutica agregada:', formaFarmaceuticaLimpia);
  }

  if (registroSanitarioLimpio) {
    productoData.sanitaryRegistry = registroSanitarioLimpio;
    console.log('✅ Registro sanitario agregado:', registroSanitarioLimpio);
  }

  // Impuestos (tax) - Detección automática desde el impuesto real de la línea
  if (productoOriginal.impuesto > 0) {
    const impuestoSeleccionado = obtenerImpuestoAlegra({
      impuesto: productoOriginal.impuesto,
      totalLinea: productoOriginal.totalLinea
    }, await cargarImpuestosAlegra());

    if (impuestoSeleccionado) {
      productoData.tax = [{ id: impuestoSeleccionado.id }];
      console.log(`✅ Impuesto aplicado: ${impuestoSeleccionado.nombre} (${impuestoSeleccionado.porcentaje}%) - ID: ${impuestoSeleccionado.id}`);
    } else {
      const porcentajeImpuesto = calcularPorcentajeIva({
        impuesto: productoOriginal.impuesto,
        totalLinea: productoOriginal.totalLinea
      });
      console.log(`⚠️ Impuesto ${porcentajeImpuesto.toFixed(2)}% no reconocido - Se aplicará sin impuesto`);
    }
  } else {
    console.log('ℹ️ Producto sin impuesto (exento)');
  }

  console.log('📤 Datos a enviar a Alegra:', productoData);

  // Crear producto en Alegra
  const nuevoProductoAlegra = await productService.createProduct(productoData);

  if (!nuevoProductoAlegra || !nuevoProductoAlegra.id) {
    throw new Error('No se pudo crear el producto en Alegra');
  }

  const warnings = Array.isArray(nuevoProductoAlegra._warnings) ? nuevoProductoAlegra._warnings : [];

  console.log(`✅ Producto creado en Alegra: ${nuevoProductoAlegra.id}`);

  // Si hay imagen, subirla a Alegra usando endpoint /attachment
  if (imagen) {
    try {
      console.log('📸 Subiendo imagen a Alegra...');
      const FormData = require('form-data');
      const formData = new FormData();

      formData.append('image', imagen.buffer, {
        filename: imagen.originalname,
        contentType: imagen.mimetype
      });

      await productService.uploadProductImage(nuevoProductoAlegra.id, formData);
      console.log('✅ Imagen subida exitosamente a Alegra');
    } catch (imgError) {
      console.error('⚠️ Error subiendo imagen (continuando):', imgError.message);
      console.error('   Stack:', imgError.stack);
      // No fallar si la imagen no se puede subir
    }
  } else if (imageUrl) {
    // Imagen elegida desde el buscador de sugerencias (Brave) en vez de un
    // archivo manual: se descarga server-side y se sube a Alegra. Si la
    // imagen de tamaño completo falla (sitio de origen bloqueado), reintenta
    // con la miniatura de respaldo antes de rendirse — mismo comportamiento
    // que el buscador de imágenes en Gestión de Catálogo.
    try {
      console.log('📸 Subiendo imagen sugerida a Alegra...');
      const resultado = await productService.downloadAndUploadProductImage(nuevoProductoAlegra.id, imageUrl, fallbackImageUrl);
      if (resultado.success) {
        console.log('✅ Imagen sugerida subida exitosamente a Alegra');
      } else {
        console.error('⚠️ No se pudo subir la imagen sugerida (continuando):', resultado.error);
      }
    } catch (imgError) {
      console.error('⚠️ Error subiendo imagen sugerida (continuando):', imgError.message);
      // No fallar la creación del producto si la imagen no se puede subir
    }
  }

  // Guardar en caché local.
  //
  // Se vuelve a leer el producto de Alegra en vez de usar la respuesta del
  // alta por dos razones: la foto se sube DESPUÉS de crear, así que la
  // respuesta del alta todavía no la trae; y la categoría viene resuelta a
  // nombre (`itemCategory.name`), que es lo que muestra Gestión de Catálogo,
  // mientras que acá solo se mandó el id.
  //
  // Antes se guardaban cinco campos —id, nombre, referencia, precio y texto
  // de búsqueda— y el producto recién creado aparecía en Gestión de Catálogo
  // sin foto y sin categoría hasta que corriera la sincronización completa.
  // Si además se desactivaba antes de eso, se quedaba así para siempre: el
  // sincronizador no reescribe campo por campo los productos inactivos.
  const releido = await productService.getProductById(String(nuevoProductoAlegra.id))
    .then(r => (r?.success ? r.data : null))
    .catch(err => {
      console.error('⚠️ No se pudo releer el producto de Alegra:', err.message);
      return null;
    });

  const fila = filaDeCache(releido || nuevoProductoAlegra);
  const refString = fila.reference;

  // Si Alegra todavía no devuelve precio o costo se usan los que se acaban de
  // enviar, en vez de dejar la fila en cero.
  if (!fila.price) fila.price = parseFloat(precio) || 0;
  if (!fila.cost) fila.cost = parseFloat(costo) || 0;

  await prisma.alegraProduct.create({ data: fila })
    .catch(err => console.error('Error guardando en caché:', err));

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
      origen: 'manual',
      ...(factorConversionNum ? { factorConversion: factorConversionNum } : {})
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
      origen: 'manual',
      ...(factorConversionNum ? { factorConversion: factorConversionNum } : {})
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

  await sincronizarCostoDeLineas([productoId]);

  console.log(`✅ Producto relacionado automáticamente: ${productoOriginal.descripcion} → ${nombre}`);

  return {
    message: warnings.length > 0
      ? `Producto "${nombre}" creado y relacionado exitosamente, con advertencias`
      : `Producto "${nombre}" creado y relacionado exitosamente`,
    alegraProductId: nuevoProductoAlegra.id,
    mapeoId: nuevoMapeo.id,
    imagenSubida: !!imagen,
    warnings
  };
}

/**
 * Guardar factor de conversión en mapeo
 */
async function guardarFactorConversion(mapeoId, factorNumerico) {
  const mapeo = await prisma.supplierProductMapping.update({
    where: { id: mapeoId },
    data: {
      factorConversion: factorNumerico
    }
  });

  console.log(`✅ Factor de conversión guardado: ${factorNumerico}`);
  console.log(`   Verificación: ${mapeo.factorConversion}`);

  // El factor divide el costo del proveedor para llevarlo a la unidad propia,
  // así que cambiarlo cambia TODOS los costos históricos de ese mapeo. Sin
  // esto, corregir un factor mal puesto no arreglaba el costo que ve el
  // tablero hasta el siguiente backfill manual — que era justo el trabajo que
  // se estaba haciendo al corregirlo.
  const recalculo = await sincronizarCostoDeMapeo(mapeoId);
  console.log(`   Costos históricos recalculados: ${recalculo.registradas} (${recalculo.eliminadas} eliminados)`);

  return {
    message: 'Factor de conversión guardado exitosamente',
    costosRecalculados: recalculo.registradas,
    mapeo: {
      id: mapeo.id,
      factorConversion: mapeo.factorConversion,
      alegraItemId: mapeo.alegraItemId,
      alegraName: mapeo.alegraName
    }
  };
}

/**
 * Buscar productos en la caché local de Alegra
 */
async function buscarEnCache(q) {
  const termino = String(q || '').trim();
  console.log(`🔍 Buscando en caché local: "${termino}"`);

  const claves = palabrasClave(termino, 4);
  const condiciones = [
    { name: { contains: termino, mode: 'insensitive' } },
    { reference: { contains: termino, mode: 'insensitive' } },
    { searchText: { contains: termino, mode: 'insensitive' } },
    ...claves.map(palabra => ({
      searchText: {
        contains: palabra,
        mode: 'insensitive'
      }
    }))
  ];

  const productos = await prisma.alegraProduct.findMany({
    where: {
      AND: [
        { status: 'active' },
        { hiddenLocally: false },
        { OR: condiciones }
      ]
    },
    take: MAX_CANDIDATOS_BUSQUEDA_ALEGRA,
    orderBy: {
      name: 'asc'
    }
  });

  const productosOrdenados = ordenarProductosPorRelevancia(termino, productos);

  const productosFormateados = productosOrdenados.map(p => ({
    id: p.alegraId,
    name: p.name,
    reference: p.reference,
    price: p.price,
    cost: p.cost,
    category: p.category,
    similarityScore: p.similarityScore
  }));

  return { productos: productosFormateados, total: productosFormateados.length };
}

/**
 * Buscar productos directamente en la API de Alegra
 */
async function buscarEnAlegra(q) {
  console.log(`🔍 Buscando en Alegra API: "${q}"`);

  const resultado = await productService.searchProducts(q.trim());
  const productos = resultado.success ? resultado.data : [];

  return { productos, total: productos.length };
}

/**
 * Obtener información completa de un producto de Alegra (caché primero, API si no está)
 */
async function getInfoAlegra(alegraItemId) {
  console.log(`📦 Obteniendo info de producto Alegra ${alegraItemId}`);

  let producto = await prisma.alegraProduct.findUnique({
    where: { alegraId: alegraItemId.toString() }
  });

  // Si no está en caché, consultar API
  if (!producto) {
    const alegraData = await obtenerProductoAlegra(alegraItemId);

    // Extraer reference como string
    const refStr = typeof alegraData.reference === 'object'
      ? alegraData.reference?.reference || ''
      : alegraData.reference || '';

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

  return {
    producto: {
      ...producto,
      price: parseFloat(producto.price || 0),
      factorConversion: mapeo?.factorConversion || 1
    }
  };
}

/**
 * Eliminar relación de un producto individual (lo devuelve a PENDIENTE
 * sin borrar el mapeo global, que sigue existiendo para futuras facturas)
 */
async function eliminarRelacionDeProducto(productoId) {
  console.log(`🗑️ Eliminando relación del producto ${productoId}`);

  const producto = await prisma.productoFactura.findUnique({
    where: { id: productoId },
    include: { factura: true }
  });

  if (!producto) {
    throw httpError(404, 'Producto no encontrado');
  }

  await prisma.productoFactura.update({
    where: { id: productoId },
    data: {
      estadoRelacionado: 'PENDIENTE',
      alegraItemId: null,
      mapeoId: null,
      confianza: null
    }
  });

  console.log(`✅ Relación eliminada`);

  return { message: 'Relación eliminada correctamente' };
}

/**
 * Obtener mapeo de un producto
 */
async function getMapeoDeProducto(productoId) {
  console.log(`🔍 Obteniendo mapeo del producto ${productoId}`);

  const producto = await prisma.productoFactura.findUnique({
    where: { id: productoId },
    include: { factura: true }
  });

  if (!producto) {
    throw httpError(404, 'Producto no encontrado');
  }

  const mapeo = await prisma.supplierProductMapping.findUnique({
    where: {
      supplierCedula_supplierCode: {
        supplierCedula: producto.factura.proveedorCedula,
        supplierCode: producto.codigoProveedor
      }
    }
  });

  if (!mapeo) {
    throw httpError(404, 'Mapeo no encontrado');
  }

  return {
    mapeo: {
      id: mapeo.id,
      factorConversion: mapeo.factorConversion || 1,
      alegraItemId: mapeo.alegraItemId,
      alegraName: mapeo.alegraName,
      confidence: mapeo.confidence
    }
  };
}

/**
 * Obtener una factura específica con sus productos, enriquecidos con
 * información de Alegra (en lote desde la caché; API solo para faltantes)
 */
async function getFacturaConProductos(facturaId) {
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
    throw httpError(404, 'Factura no encontrada');
  }

  // Enriquecer productos con información de Alegra en lote (1 sola consulta en vez de N)
  const alegraItemIds = factura.productos
    .map(p => p.alegraItemId)
    .filter(Boolean);

  const cachedProducts = alegraItemIds.length > 0
    ? await prisma.alegraProduct.findMany({
        where: { alegraId: { in: alegraItemIds } }
      })
    : [];

  const cacheMap = new Map(cachedProducts.map(p => [p.alegraId, p]));

  const productosEnriquecidos = await Promise.all(
    factura.productos.map(async (producto) => {
      let alegraProductInfo = null;

      if (producto.alegraItemId) {
        const alegraProduct = cacheMap.get(producto.alegraItemId);

        if (alegraProduct) {
          alegraProductInfo = {
            id: alegraProduct.alegraId,
            name: alegraProduct.name,
            reference: alegraProduct.reference,
            price: parseFloat(alegraProduct.price || 0)
          };
        } else {
          // Si no está en caché, consultar API
          try {
            const alegraData = await obtenerProductoAlegra(producto.alegraItemId);
            if (alegraData) {
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

  return {
    data: {
      ...factura,
      productos: productosEnriquecidos
    }
  };
}

module.exports = {
  precioSugerido,
  getRelacionados,
  getRelacionesDeProducto,
  crearRelacion,
  ajustarProducto,
  editarRelacion,
  eliminarRelacionPorMapeo,
  crearProducto,
  guardarFactorConversion,
  buscarEnCache,
  buscarEnAlegra,
  getInfoAlegra,
  eliminarRelacionDeProducto,
  getMapeoDeProducto,
  getFacturaConProductos
};
