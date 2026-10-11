const { query } = require('../config/database');
const prisma = require('../lib/prisma');
const { calcularCostoUnitarioPropio } = require('../src/modules/precios/costo');

/**
 * Asignar automáticamente proveedor a un faltante: de los proveedores a los
 * que se les compró ESE producto, el de precio más bajo.
 *
 * EL PRODUCTO ES `producto.id` (el de `faltantes.producto_propio_id`). Los
 * mapeos lo llevan desde la migración independencia/018: 2.057 de 2.061; los
 * otros 4 son de productos que ya no existen.
 *
 * Hasta el 2026-10-03 se buscaba además por el id de Alegra y por la
 * referencia, los tres a la vez. Medido antes de quitarlo, sobre 1.874
 * productos activos: ninguno llegaba a un mapeo solo por el id de Alegra, así
 * que ese camino se fue. Por la referencia llegaban 4, y los 4 son fichas
 * DUPLICADAS del mismo producto (dos "SPRAY BOSNY BLANCO BRILLANTE", tres
 * "LAMINA FUSIBLE 60 AMP", dos "PEGA PRES PP-98") cuyo mapeo quedó en la
 * gemela. La referencia se conserva SOLO como segundo intento, cuando el
 * producto no tiene ningún mapeo propio, para que esos cuatro no queden "Sin
 * proveedor" mientras no se unan las fichas. Ya no se suma a los mapeos
 * propios: antes los de la gemela entraban siempre a competir por precio.
 *
 * @param {number} faltanteId - id en `faltantes`
 * @param {number} productoId - id PROPIO del producto
 * @param {string} productoReferencia - la referencia del producto ("SED"),
 *   nunca un id
 * @returns {Promise<Object>} { success, proveedor, precio }
 */
async function asignarProveedorAutomatico(faltanteId, productoId, productoReferencia) {
  try {
    const idProducto = Number.isInteger(Number(productoId)) && Number(productoId) > 0 ? Number(productoId) : null;
    const referencia = String(productoReferencia || '').trim();
    console.log(`🤖 Asignación automática para faltante ${faltanteId} (producto ${idProducto}, ${referencia || 'sin referencia'})`);

    const COLUMNAS_MAPEO = `
        id,
        supplier_name as "supplierName",
        supplier_cedula as "supplierCedula",
        origen,
        last_used_date as "lastUsedDate",
        factor_conversion as "factorConversion"`;
    // No se ordena por la confianza: todos los mapeos los asignó una persona,
    // así que valen lo mismo. Ordenar por ese campo hacía que un mapeo con una
    // confianza inventada (999.99) le ganara a los reales.
    const ORDEN = 'ORDER BY last_used_date DESC NULLS LAST';

    let mappings = idProducto
      ? await query(`SELECT ${COLUMNAS_MAPEO} FROM supplier_product_mapping WHERE producto_id = $1 ${ORDEN}`, [idProducto])
      : { rows: [] };
    if (mappings.rows.length === 0 && referencia) {
      mappings = await query(`SELECT ${COLUMNAS_MAPEO} FROM supplier_product_mapping WHERE alegra_reference = $1 ${ORDEN}`, [referencia]);
    }
    const productoCodigo = referencia || idProducto;

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
            cantidad: true,
            impuesto: true,
            totalLinea: true
          }
        });

        let precio = null;
        if (productoFactura && productoFactura.precioUnitario > 0) {
          // Costo real por unidad propia — ver backend/src/modules/precios/costo.js
          const { costoUnitario } = calcularCostoUnitarioPropio(productoFactura, mapping.factorConversion);
          precio = Math.round(costoUnitario * 100) / 100;
        }

        const registroProveedor = {
          mappingId: mapping.id,
          supplierName: mapping.supplierName,
          supplierCedula: mapping.supplierCedula,
          precio: precio,
          lastUsedDate: mapping.lastUsedDate,
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
          lastUsedDate: mapping.lastUsedDate,
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
    //   2. En caso de empate: El usado más recientemente
    //   3. Si nadie tiene precio: El usado más recientemente
    //
    // Ya no se usa `confidence` para desempatar: todos los mapeos los asignó
    // una persona, así que ninguno es "más confiable" que otro. Ese campo
    // servía cuando el sistema los creaba solo por parecido de texto.
    // ─────────────────────────────────────────────────────────────────────────
    const proveedoresConPrecio = proveedoresConPrecios.filter(p => p.precio !== null && p.precio > 0);

    let proveedorSeleccionado;
    let precioAsignado;

    if (proveedorManualPrioritario) {
      proveedorSeleccionado = proveedorManualPrioritario;
      precioAsignado = proveedorManualPrioritario.precio ?? null;
      console.log(`🔒 Prioridad manual: ${proveedorSeleccionado.supplierName}`);
    } else if (proveedoresConPrecio.length > 0) {
      // Precio ascendente; a igual precio, el usado más recientemente.
      proveedoresConPrecio.sort((a, b) => {
        if (a.precio !== b.precio) return a.precio - b.precio;
        return new Date(b.lastUsedDate || 0) - new Date(a.lastUsedDate || 0);
      });

      proveedorSeleccionado = proveedoresConPrecio[0];
      precioAsignado = proveedoresConPrecio[0].precio;
    } else {
      // Sin precios en ningún lado, el usado más recientemente.
      proveedoresConPrecios.sort((a, b) =>
        new Date(b.lastUsedDate || 0) - new Date(a.lastUsedDate || 0));
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

module.exports = {
  asignarProveedorAutomatico
};

