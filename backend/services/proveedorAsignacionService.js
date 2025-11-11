const { query } = require('../config/database');
const prisma = require('../lib/prisma');

/**
 * Asignar automáticamente proveedor a un faltante basado en precio más bajo
 * @param {number} faltanteId - ID del faltante
 * @param {number} productoId - ID del producto local
 * @param {number} allegraId - ID del producto en Alegra
 * @param {string} productoCodigo - Código/reference del producto
 * @returns {Promise<Object>} Información de la asignación
 */
async function asignarProveedorAutomatico(faltanteId, productoId, allegraId, productoCodigo) {
  try {
    console.log(`🤖 Asignación automática para faltante ${faltanteId} (producto: ${productoCodigo})`);

    // 1. Buscar todos los mappings del producto
    const mappings = await query(`
      SELECT
        id,
        supplier_name as "supplierName",
        supplier_cedula as "supplierCedula",
        alegra_item_id as "alegraItemId",
        alegra_reference as "alegraReference",
        confidence
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

    // 2. Para cada mapping, obtener el precio más reciente
    const proveedoresConPrecios = [];

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
          
          precio = Math.round(costoConIva * 100) / 100;
        }

        proveedoresConPrecios.push({
          mappingId: mapping.id,
          supplierName: mapping.supplierName,
          supplierCedula: mapping.supplierCedula,
          precio: precio,
          confidence: mapping.confidence || 0
        });

        console.log(`   - ${mapping.supplierName}: ${precio ? `₡${precio.toFixed(2)}` : 'Sin precio'}`);
      } catch (error) {
        console.warn(`   ⚠️ Error obteniendo precio para ${mapping.supplierName}:`, error.message);
        proveedoresConPrecios.push({
          mappingId: mapping.id,
          supplierName: mapping.supplierName,
          supplierCedula: mapping.supplierCedula,
          precio: null,
          confidence: mapping.confidence || 0
        });
      }
    }

    // 3. Seleccionar proveedor con precio más bajo
    const proveedoresConPrecio = proveedoresConPrecios.filter(p => p.precio !== null && p.precio > 0);

    let proveedorSeleccionado;
    let precioAsignado;

    if (proveedoresConPrecio.length > 0) {
      // Ordenar por precio (ascendente) y confianza (descendente) como desempate
      proveedoresConPrecio.sort((a, b) => {
        if (a.precio !== b.precio) {
          return a.precio - b.precio;
        }
        return b.confidence - a.confidence;
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

    // 4. Actualizar el faltante con la asignación
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

