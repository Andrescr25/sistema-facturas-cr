const { query } = require('../config/database');
const prisma = require('../lib/prisma');

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Asignar automáticamente proveedor a un faltante basado en precio más bajo
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Esta función busca TODOS los proveedores que tienen el producto y selecciona
 * el que tiene el precio más bajo.
 * 
 * @param {number} faltanteId - ID del faltante en la tabla faltantes
 * @param {number} productoId - ID del producto en la tabla productos (BD local)
 * @param {number} allegraId - ID del producto en Alegra (ej: 900)
 * @param {string} productoCodigo - Código/reference del producto (ej: "SED")
 * 
 * @returns {Promise<Object>} { success, proveedor, precio }
 * 
 * ═════════════════════════════════════════════════════════════════════════════
 * IMPORTANTE: productoCodigo debe ser el REFERENCE real, NO el alegra_id
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * ✅ CORRECTO: asignarProveedorAutomatico(1, 88, 900, "SED")
 * ❌ MAL:      asignarProveedorAutomatico(1, 88, 900, "900")
 * 
 * RAZÓN: Los mappings en supplier_product_mapping usan el reference ("SED")
 *        no el alegra_id ("900")
 * 
 * ═════════════════════════════════════════════════════════════════════════════
 */
async function asignarProveedorAutomatico(faltanteId, productoId, allegraId, productoCodigo) {
  try {
    console.log(`🤖 Asignación automática para faltante ${faltanteId} (producto: ${productoCodigo})`);

    // ─────────────────────────────────────────────────────────────────────────
    // PASO 1: Buscar TODOS los mappings del producto
    // ─────────────────────────────────────────────────────────────────────────
    // Buscamos por:
    //   - alegra_item_id: El ID numérico de Alegra (ej: 900)
    //   - alegra_reference: El código interno del producto (ej: "SED")
    //
    // ¿Por qué ambos? Porque algunos mappings usan uno u otro
    // ─────────────────────────────────────────────────────────────────────────
    const mappings = await query(`
      SELECT
        id,
        supplier_name as "supplierName",
        supplier_cedula as "supplierCedula",
        alegra_item_id as "alegraItemId",
        alegra_reference as "alegraReference",
        confidence,
        origen,
        factor_conversion as "factorConversion"
      FROM supplier_product_mapping
      WHERE (
        (alegra_item_id::text = $1 AND $1 IS NOT NULL)
        OR alegra_reference = $2
      )
      ORDER BY confidence DESC
    `, [allegraId?.toString(), productoCodigo]);

    if (mappings.rows.length === 0) {
      console.log(`⚠️ No se encontraron mappings para producto ${productoCodigo}`);
      return {
        success: false,
        reason: 'sin_mappings'
      };
    }

    console.log(`📋 Encontrados ${mappings.rows.length} mappings`);

    // ─────────────────────────────────────────────────────────────────────────
    // PASO 2: Para cada mapping (proveedor), obtener el precio más reciente
    // ─────────────────────────────────────────────────────────────────────────
    // Los precios se obtienen de la tabla productoFactura (facturas de proveedores)
    // Se busca la última factura que usó ese mapping
    // ─────────────────────────────────────────────────────────────────────────
    const proveedoresConPrecios = [];
    let proveedorManualPrioritario = null;

    for (const mapping of mappings.rows) {
      try {
        const productoFactura = await prisma.productoFactura.findFirst({
          where: {
            mapeoId: mapping.id
          },
          orderBy: {
            factura: {
              fechaEmision: 'desc'
            }
          },
          select: {
            precioUnitario: true,
            descuento: true,
            cantidad: true
          }
        });

        let precio = null;
        if (productoFactura && productoFactura.precioUnitario > 0) {
          const precioUnitarioSinIva = parseFloat(productoFactura.precioUnitario);
          const descuento = parseFloat(productoFactura.descuento) || 0;
          const cantidad = parseFloat(productoFactura.cantidad) || 1;
          
          const montoTotalSinDescuento = precioUnitarioSinIva * cantidad;
          const descuentoPorcentaje = montoTotalSinDescuento > 0 
            ? (descuento / montoTotalSinDescuento) * 100
            : 0;
          
          const costoSinIvaConDescuento = precioUnitarioSinIva * (1 - descuentoPorcentaje / 100);
          const costoConIva = costoSinIvaConDescuento * 1.13;
          
          const factorConversion = parseFloat(mapping.factorConversion) || 1;
          const costoRealPorUnidad = costoConIva / factorConversion;
          
          precio = Math.round(costoRealPorUnidad * 100) / 100;
        }

        const registroProveedor = {
          mappingId: mapping.id,
          supplierName: mapping.supplierName,
          supplierCedula: mapping.supplierCedula,
          precio: precio,
          confidence: mapping.confidence || 0,
          origen: mapping.origen || 'automatico'
        };

        proveedoresConPrecios.push(registroProveedor);

        if (!proveedorManualPrioritario && registroProveedor.origen === 'manual') {
          proveedorManualPrioritario = registroProveedor;
        }

        console.log(`   - ${mapping.supplierName}: ${precio ? `₡${precio.toFixed(2)}` : 'Sin precio'}`);
      } catch (error) {
        console.warn(`   ⚠️ Error obteniendo precio para ${mapping.supplierName}:`, error.message);
        const registroProveedor = {
          mappingId: mapping.id,
          supplierName: mapping.supplierName,
          supplierCedula: mapping.supplierCedula,
          precio: null,
          confidence: mapping.confidence || 0,
          origen: mapping.origen || 'automatico'
        };

        proveedoresConPrecios.push(registroProveedor);

        if (!proveedorManualPrioritario && registroProveedor.origen === 'manual') {
          proveedorManualPrioritario = registroProveedor;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PASO 3: Seleccionar el proveedor con el precio MÁS BAJO
    // ─────────────────────────────────────────────────────────────────────────
    // Criterio de selección:
    //   1. Si hay precios: El de menor precio
    //   2. En caso de empate: El de mayor confianza (confidence)
    //   3. Si nadie tiene precio: El de mayor confianza
    // ─────────────────────────────────────────────────────────────────────────
    const proveedoresConPrecio = proveedoresConPrecios.filter(p => p.precio !== null && p.precio > 0);

    let proveedorSeleccionado;
    let precioAsignado;

    if (proveedorManualPrioritario) {
      proveedorSeleccionado = proveedorManualPrioritario;
      precioAsignado = proveedorManualPrioritario.precio ?? null;
      console.log(`🔒 Prioridad manual: ${proveedorSeleccionado.supplierName}`);
    } else if (proveedoresConPrecio.length > 0) {
      // Ordenar por precio (ascendente) y confianza (descendente) como desempate
      proveedoresConPrecio.sort((a, b) => {
        if (a.precio !== b.precio) {
          return a.precio - b.precio; // Menor precio primero
        }
        return b.confidence - a.confidence; // Mayor confianza como desempate
      });

      proveedorSeleccionado = proveedoresConPrecio[0];
      precioAsignado = proveedoresConPrecio[0].precio;
    } else {
      // Si nadie tiene precio, usar el de mayor confianza
      proveedoresConPrecios.sort((a, b) => b.confidence - a.confidence);
      proveedorSeleccionado = proveedoresConPrecios[0];
      precioAsignado = null;
    }

    console.log(`✅ Proveedor seleccionado: ${proveedorSeleccionado.supplierName} ${precioAsignado ? `(₡${precioAsignado.toFixed(2)})` : '(sin precio)'}`);

    // ─────────────────────────────────────────────────────────────────────────
    // PASO 4: Guardar la asignación en la tabla faltantes
    // ─────────────────────────────────────────────────────────────────────────
    // Se guarda:
    //   - proveedor_asignado: Nombre del proveedor
    //   - proveedor_cedula: Cédula del proveedor
    //   - precio_asignado: Precio más bajo encontrado
    //   - asignacion_tipo: 'automatica' (vs 'manual')
    //   - mapping_id: ID del mapping usado
    //
    // Esto hace que el reporte sea RÁPIDO (no recalcula cada vez)
    // ─────────────────────────────────────────────────────────────────────────
    await query(`
      UPDATE faltantes
      SET 
        proveedor_asignado = $1,
        proveedor_cedula = $2,
        precio_asignado = $3,
        asignacion_tipo = 'automatica',
        fecha_asignacion = CURRENT_TIMESTAMP,
        mapping_id = $4
      WHERE id = $5
    `, [
      proveedorSeleccionado.supplierName.trim(),
      proveedorSeleccionado.supplierCedula,
      precioAsignado,
      proveedorSeleccionado.mappingId,
      faltanteId
    ]);

    return {
      success: true,
      proveedor: proveedorSeleccionado.supplierName,
      precio: precioAsignado
    };

  } catch (error) {
    console.error(`❌ Error asignando proveedor automático:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Asignar proveedor manual a faltantes de un producto
 * @param {string} productoCodigo - Código del producto
 * @param {number} allegraId - ID de Alegra del producto
 * @param {string} proveedorNombre - Nombre del proveedor
 * @param {string} proveedorCedula - Cédula del proveedor
 * @param {string} mappingId - ID del mapping
 * @returns {Promise<number>} Cantidad de faltantes actualizados
 */
async function asignarProveedorManual(productoCodigo, allegraId, proveedorNombre, proveedorCedula, mappingId) {
  try {
    console.log(`👤 Asignación manual: ${productoCodigo} → ${proveedorNombre}`);

    // Actualizar TODOS los faltantes pendientes de ese producto
    const result = await query(`
      UPDATE faltantes f
      SET 
        proveedor_asignado = $1,
        proveedor_cedula = $2,
        asignacion_tipo = 'manual',
        fecha_asignacion = CURRENT_TIMESTAMP,
        mapping_id = $3
      FROM productos p
      WHERE f.producto_id = p.id
        AND f.estado = 'pendiente'
        AND (p.codigo = $4 OR p.alegra_id = $5)
    `, [proveedorNombre.trim(), proveedorCedula, mappingId, productoCodigo, allegraId]);

    console.log(`✅ ${result.rowCount} faltante(s) actualizados con asignación manual`);

    return result.rowCount;
  } catch (error) {
    console.error(`❌ Error asignando proveedor manual:`, error);
    throw error;
  }
}

module.exports = {
  asignarProveedorAutomatico,
  asignarProveedorManual
};

