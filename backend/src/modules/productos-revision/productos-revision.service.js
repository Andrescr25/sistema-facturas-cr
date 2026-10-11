/**
 * Productos-Revision Module - Service
 * Las relaciones entre lo que factura un proveedor y los productos (mapeos),
 * los ajustes de las líneas de factura y la creación de productos nuevos.
 *
 * VOCABULARIO, porque acá "producto" quiere decir dos cosas:
 *   · `productoId` / `productoProveedorId` en las rutas de este módulo es la
 *     LÍNEA de la factura del proveedor (`productos_factura_proveedor.id`).
 *   · `productoPropioId` es el producto del maestro (`producto.id`).
 *
 * LA RELACIÓN SE ESCRIBE POR `producto.id` (migración 038, 2026-10-03): ver
 * relacionPropia.js. Crear un producto nuevo desde una línea está en
 * productoDesdeLinea.js y lo crea en el maestro propio. En este archivo ya no
 * queda nada que le hable a Alegra.
 */

const prisma = require('../../../lib/prisma');
const {
  productoPropio, guardarMapeo, cambiarProductoDelMapeo, relacionarLineas, soltarLineas, recalcularAvance
} = require('./relacionPropia');
const { query } = require('../../../config/database');
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
    // El nombre de hoy es el del maestro propio, y la relación se cruza por
    // `producto_id` (que Prisma no conoce): se traen los ids de los mapeos.
    const mapeos = await query(
      `SELECT m.id FROM supplier_product_mapping m
         JOIN producto p ON p.id = m.producto_id
        WHERE p.nombre ILIKE $1 OR p.referencia ILIKE $1
        LIMIT ${MAX_PRODUCTOS_BUSQUEDA}`,
      [`%${busqueda}%`]
    );
    if (mapeos.rows.length > 0) {
      filtros.OR.push({ id: { in: mapeos.rows.map(f => f.id) } });
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
  const catalogo = new Map();
  if (relaciones.length > 0) {
    const filas = await query(
      `SELECT m.id AS mapeo_id, p.id, p.nombre, p.referencia
         FROM supplier_product_mapping m
         JOIN producto p ON p.id = m.producto_id
        WHERE m.id = ANY($1::uuid[])`,
      [relaciones.map(r => r.id)]
    );
    filas.rows.forEach(f => catalogo.set(f.mapeo_id, { id: f.id, name: f.nombre, reference: f.referencia }));
  }

  const productosFormateados = relaciones.map(mapeo => {
    const actual = catalogo.get(mapeo.id) || null;
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

      // El producto propio — nombre y referencia ACTUALES del maestro.
      productoPropioId: actual ? actual.id : null,
      productoReferencia: referenciaActual,
      productoNombre: nombreActual,
      // Para poder avisar en pantalla en vez de mostrar un dato muerto.
      nombreGuardado: mapeo.alegraName,
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
        productoPropioId: actual ? actual.id : null,
        productoNombre: nombreActual,
        productoReferencia: referenciaActual,
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
 * Obtener todas las relaciones de un producto PROPIO (con sus distintos
 * proveedores), con el último costo real de cada proveedor (descuento + IVA
 * real de la línea).
 */
async function getRelacionesDeProducto(productoPropioId) {
  const producto = await productoPropio(productoPropioId);
  console.log(`🔍 Obteniendo todas las relaciones del producto ${producto.id}`);

  // `producto_id` no está en el esquema de Prisma: los ids de los mapeos se
  // traen aparte y Prisma arma el resto.
  const { rows: suyos } = await query('SELECT id FROM supplier_product_mapping WHERE producto_id = $1', [producto.id]);

  const relaciones = await prisma.supplierProductMapping.findMany({
    where: {
      id: { in: suyos.map(m => m.id) }
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
      producto: {
        id: producto.id,
        reference: producto.referencia,
        name: producto.nombre
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
    producto: {
      id: producto.id,
      reference: producto.referencia || null,
      name: producto.nombre
    },
    relaciones: relacionesFormateadas,
    total: relacionesFormateadas.length
  };
}

/**
 * Relacionar una línea de factura de proveedor con un producto PROPIO.
 *
 * El producto sale del maestro (`producto`), por su id. Antes se pedía el id
 * de Alegra, se buscaba en la caché y, si no estaba, se le preguntaba a Alegra
 * en vivo: un producto creado en el sistema no se podía relacionar.
 */
async function crearRelacion({ productoProveedorId, productoPropioId }) {
  console.log(`🔗 Creando relación: línea ${productoProveedorId} → producto ${productoPropioId}`);

  const linea = await prisma.productoFactura.findUnique({
    where: { id: productoProveedorId },
    include: { factura: true }
  });

  if (!linea) {
    throw httpError(404, 'Producto del proveedor no encontrado');
  }

  const producto = await productoPropio(productoPropioId);

  const mapeo = await guardarMapeo({
    cedula: linea.factura.proveedorCedula,
    codigo: linea.codigoProveedor,
    nombreProveedor: linea.factura.proveedorNombre,
    descripcion: linea.descripcion
  }, producto);
  console.log(`✅ Mapeo guardado: ID ${mapeo.id}`);

  await relacionarLineas({ lineaIds: [productoProveedorId] }, producto, { mapeoId: mapeo.id });
  const productoActualizado = await prisma.productoFactura.findUnique({ where: { id: productoProveedorId } });

  // El costo de esta compra entra a costo_historico en el momento en que la
  // línea queda relacionada — antes esto solo pasaba al correr el backfill a
  // mano, así que los costos envejecían sin que nadie se enterara.
  await sincronizarCostoDeLineas([productoProveedorId]);

  // El avance de la factura se vuelve a contar desde sus líneas.
  const [avance] = await recalcularAvance([productoProveedorId]);
  if (avance?.completa) console.log(`🎉 Factura ${linea.facturaId} ahora está 100% relacionada`);

  console.log(`✅ Producto relacionado: ${linea.descripcion} → ${producto.nombre}`);

  return {
    message: 'Producto relacionado exitosamente',
    producto: { ...productoActualizado, productoPropioId: producto.id },
    mapeo: comoMapeo(mapeo),
    porcentajeRelacionado: avance ? avance.porcentaje : 0,
    facturaCompleta: Boolean(avance?.completa)
  };
}

/**
 * El mapeo como lo esperan las pantallas: los nombres de siempre (camelCase)
 * más el producto propio.
 */
function comoMapeo(m) {
  return {
    id: m.id,
    supplierName: m.supplier_name,
    supplierCedula: m.supplier_cedula,
    supplierCode: m.supplier_code,
    supplierDesc: m.supplier_desc,
    productoPropioId: m.producto_id,
    productoNombre: m.alegra_name,
    productoReferencia: m.alegra_reference,
    confidence: Number(m.confidence),
    origen: m.origen,
    factorConversion: m.factor_conversion,
    timesUsed: m.times_used,
    lastUsedDate: m.last_used_date
  };
}

/**
 * Editar relación existente: el mismo código del proveedor pasa a ser otro
 * producto, y con él todas las líneas que usan ese mapeo.
 *
 * NOTA: El frontend envía el ID del supplierProductMapping (mapeo.id),
 * no el ID del productoFactura.
 */
async function editarRelacion(mapeoId, nuevoProductoPropioId) {
  console.log(`✏️ Editando relación para mapeo: ${mapeoId} → producto ${nuevoProductoPropioId}`);

  const mapeo = await prisma.supplierProductMapping.findUnique({ where: { id: mapeoId } });
  if (!mapeo) {
    throw httpError(404, 'Relación no encontrada', { mapeoId });
  }

  const producto = await productoPropio(nuevoProductoPropioId);

  const mapeoActualizado = await cambiarProductoDelMapeo(mapeoId, producto);
  const afectadas = await relacionarLineas({ deMapeoId: mapeoId }, producto, { mapeoId });

  // Cambió el producto de TODAS las líneas de este mapeo: hay que reescribir
  // sus costos para que no queden apuntando al producto anterior.
  await sincronizarCostoDeMapeo(mapeoId);

  console.log(`✅ Relación editada: ${mapeo.supplierDesc} → ${producto.nombre}`);
  console.log(`✅ ${afectadas} producto(s) actualizado(s)`);

  return {
    message: `Relación editada exitosamente. ${afectadas} producto(s) actualizado(s)`,
    productosAfectados: afectadas,
    mapeo: comoMapeo(mapeoActualizado)
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

  const resultado = { count: await soltarLineas({ deMapeoId: mapeoId }) };

  console.log(`✅ ${resultado.count} productos actualizados a PENDIENTE`);

  // Esas líneas ya no son de ningún producto: sus compras salen del historial
  // de costos (antes se quedaban ahí, y solo las ignoraba quien leía), y sus
  // facturas vuelven a contar cuánto les falta.
  await sincronizarCostoDeLineas(productosAfectados.map(p => p.id));
  await recalcularAvance(productosAfectados.map(p => p.id));

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
 * Qué costo y qué precio proponerle a quien está creando un producto nuevo
 * (el producto se crea en productoDesdeLinea.js).
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
 *           que es la convención de `producto.costo_con_iva`.
 *   precio  el motor de precios, el mismo que sugiere en Revisión de Precios
 *           (margen real medido por categoría). Sin sugerencia confiable
 *           devuelve null y el formulario deja el campo vacío, en vez de
 *           inventar un número.
 *
 * La categoría llega desde el formulario porque se elige ahí mismo: el
 * margen meta depende de ella, y el producto todavía no existe.
 */
async function precioSugerido(productoId, categoriaNombre) {
  const producto = await prisma.productoFactura.findUnique({
    where: { id: productoId },
    include: { mapeo: true }
  });
  if (!producto) throw httpError(404, 'Producto original no encontrado');

  const { costoConIva, costoSinIvaConDescuento, factor, porcentajeIva, descuentoPorcentaje } =
    calcularCostoUnitarioPropio(producto, producto.mapeo?.factorConversion);

  const costoUnitario = costoConIva / factor;   // el que va a `producto.costo_con_iva`
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
      productoNombre: mapeo.alegraName
    }
  };
}

/**
 * Buscar un producto para relacionarlo: en el maestro propio (`producto`).
 *
 * Antes se buscaba en `alegra_products_cache`, la copia de Alegra: un producto
 * creado en el sistema no aparecía, así que no se podía relacionar.
 *
 * `id` es `producto.id`. Salen los activos, estén o no ocultos del catálogo:
 * ocultar un producto es no mostrárselo al cliente, y se sigue comprando.
 */
async function buscarProductos(q) {
  const termino = String(q || '').trim();
  console.log(`🔍 Buscando en el maestro: "${termino}"`);

  const claves = palabrasClave(termino, 4);
  const patrones = [`%${termino}%`, ...claves.map(palabra => `%${palabra}%`)];

  const { rows } = await query(`
    SELECT p.id, p.nombre AS name, p.referencia AS reference, p.precio_sin_iva AS price,
           p.costo_con_iva AS cost, cat.nombre AS category
      FROM producto p
      LEFT JOIN categoria_producto cat ON cat.id = p.categoria_id
     WHERE p.activo = TRUE
       AND (p.nombre ILIKE ANY($1::text[]) OR COALESCE(p.referencia, '') ILIKE $2)
     ORDER BY p.nombre
     LIMIT ${MAX_CANDIDATOS_BUSQUEDA_ALEGRA}
  `, [patrones, `%${termino}%`]);

  const productosOrdenados = ordenarProductosPorRelevancia(termino, rows.map(p => ({
    ...p,
    // El comparador de relevancia mira nombre y referencia juntos.
    searchText: `${p.name} ${p.reference || ''}`.toLowerCase()
  })));

  const productosFormateados = productosOrdenados.map(p => ({
    id: p.id,
    productoPropioId: p.id,
    name: p.name,
    reference: p.reference,
    price: p.price === null ? null : Number(p.price),
    cost: p.cost === null ? null : Number(p.cost),
    category: p.category,
    similarityScore: p.similarityScore
  }));

  return { productos: productosFormateados, total: productosFormateados.length };
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

  await soltarLineas({ lineaIds: [productoId] });
  // La línea ya no es de ningún producto: su costo sale del historial, y a
  // su factura le vuelve a faltar una.
  await sincronizarCostoDeLineas([productoId]);
  await recalcularAvance([productoId]);

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

  const { rows: [propio] } = await query(`
    SELECT m.producto_id, p.nombre, p.referencia
      FROM supplier_product_mapping m LEFT JOIN producto p ON p.id = m.producto_id
     WHERE m.id = $1`, [mapeo.id]);

  return {
    mapeo: {
      id: mapeo.id,
      factorConversion: mapeo.factorConversion || 1,
      productoPropioId: propio?.producto_id ?? null,
      // El nombre de HOY del producto; el guardado en el mapeo es una foto.
      productoNombre: propio?.nombre || mapeo.alegraName,
      productoReferencia: propio?.referencia || mapeo.alegraReference,
      confidence: mapeo.confidence
    }
  };
}

/**
 * Obtener una factura de proveedor con sus líneas, cada una con el producto
 * propio con el que está relacionada (`productoPropioId`, `productoInfo`).
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

  // El producto de cada línea, del maestro propio y en una sola consulta.
  // `producto_id` no está en el esquema de Prisma (migración 038): se lee
  // aparte, por el id de la línea.
  const idsDeLineas = factura.productos.map(p => p.id);
  const propios = idsDeLineas.length > 0
    ? await query(`
        SELECT l.id AS linea_id, p.id, p.nombre, p.referencia, p.precio_sin_iva
          FROM productos_factura_proveedor l
          JOIN producto p ON p.id = l.producto_id
         WHERE l.id = ANY($1::uuid[])`, [idsDeLineas])
    : { rows: [] };
  const propioPorLinea = new Map(propios.rows.map(r => [r.linea_id, r]));

  const productosEnriquecidos = factura.productos.map((linea) => {
    const propio = propioPorLinea.get(linea.id) || null;
    return {
      ...linea,
      productoPropioId: propio ? propio.id : null,
      productoInfo: propio
        ? { id: propio.id, name: propio.nombre, reference: propio.referencia, price: Number(propio.precio_sin_iva) || 0 }
        : null
    };
  });

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
  editarRelacion,
  eliminarRelacionPorMapeo,
  guardarFactorConversion,
  buscarProductos,
  eliminarRelacionDeProducto,
  getMapeoDeProducto,
  getFacturaConProductos
};
