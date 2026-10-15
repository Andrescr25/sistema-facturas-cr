/**
 * Proveedores de un producto propio. La relación vigente sale del mapeo por
 * cédula/código; el costo, de una línea realmente relacionada con ESE producto.
 * No basta seguir mapeo_id: el código pudo reasignarse después a otro producto.
 */
const { query } = require('../../../config/database');
const { idValido, httpError } = require('../../utils/validacion');
const { calcularCostoUnitarioPropio } = require('../precios/costo');

async function getRelacionesDeProducto(productoId) {
  const id = idValido(productoId);
  const { rows: productos } = await query('SELECT id, nombre, referencia FROM producto WHERE id = $1', [id]);
  if (!productos.length) throw httpError(404, 'Ese producto no existe.');
  const producto = { id, reference: productos[0].referencia || null, name: productos[0].nombre };

  // Dos consultas, sin una lectura por proveedor ni límite de cinco líneas:
  // una regalía reciente no debe esconder el último costo pagado. Si la compra
  // ya existe, sus importes/factor son la fotografía y se excluye si se anuló.
  const { rows } = await query(`
    SELECT m.id, COALESCE(NULLIF(p.nombre, ''), m.supplier_name) AS nombre,
           m.supplier_cedula, m.supplier_code, m.supplier_desc,
           m.confidence, m.times_used,
           COALESCE(u.factor_conversion, NULLIF(m.factor_conversion, 0), 1) AS factor,
           u.precio_unitario, u.descuento, u.cantidad, u.impuesto, u.total_linea,
           u.moneda, u.fecha, u.descripcion
      FROM supplier_product_mapping m
      LEFT JOIN proveedor p ON p.identificacion = m.supplier_cedula
      LEFT JOIN LATERAL (
        SELECT COALESCE(cl.precio_unitario, l.precio_unitario) AS precio_unitario,
               COALESCE(cl.descuento, l.descuento) AS descuento,
               COALESCE(cl.cantidad, l.cantidad) AS cantidad,
               COALESCE(cl.impuesto, l.impuesto) AS impuesto,
               COALESCE(cl.total_linea, l.total_linea) AS total_linea,
               COALESCE(cl.factor_conversion, NULLIF(m.factor_conversion, 0), 1) AS factor_conversion,
               COALESCE(cl.descripcion, l.descripcion) AS descripcion,
               UPPER(COALESCE(NULLIF(c.moneda, ''), NULLIF(f.moneda, ''), 'CRC')) AS moneda,
               to_char(COALESCE(c.fecha_emision, f.fecha_emision::date), 'YYYY-MM-DD') AS fecha
          FROM productos_factura_proveedor l
          JOIN facturas_proveedores f ON f.id = l.factura_id
          LEFT JOIN compra c ON c.factura_proveedor_id = f.id
          LEFT JOIN compra_linea cl ON cl.compra_id = c.id AND cl.numero_linea = l.numero_linea
            AND cl.producto_id = m.producto_id AND cl.codigo_proveedor = m.supplier_code
         WHERE l.producto_id = m.producto_id AND l.estado_relacionado = 'RELACIONADO'
           AND l.codigo_proveedor = m.supplier_code AND f.proveedor_cedula = m.supplier_cedula
           AND f.estado <> 'GASTO_RECURRENTE'
           AND (c.id IS NULL OR (c.estado = 'registrada' AND cl.id IS NOT NULL))
           AND COALESCE(cl.cantidad, l.cantidad) > 0
           AND COALESCE(cl.precio_unitario, l.precio_unitario) > 0
           AND COALESCE(cl.descuento, l.descuento) <
               COALESCE(cl.precio_unitario, l.precio_unitario) * COALESCE(cl.cantidad, l.cantidad)
           AND COALESCE(cl.total_linea, l.total_linea) > 0
         ORDER BY f.fecha_emision DESC, f.fecha_procesada DESC, l.numero_linea DESC, l.id
         LIMIT 1
      ) u ON TRUE
     WHERE m.producto_id = $1
     ORDER BY nombre, m.supplier_cedula, m.supplier_code`, [id]);

  const relaciones = rows.map(f => {
    const factor = Number(f.factor) > 0 ? Number(f.factor) : 1;
    const costo = f.precio_unitario === null ? null : calcularCostoUnitarioPropio({
      precioUnitario: f.precio_unitario, descuento: f.descuento,
      cantidad: f.cantidad, impuesto: f.impuesto, totalLinea: f.total_linea
    }, factor);
    const valido = costo && Number.isFinite(costo.costoUnitario) && costo.costoUnitario > 0;
    return {
      mapeoId: f.id, proveedor: { nombre: f.nombre, cedula: f.supplier_cedula },
      codigoProveedor: f.supplier_code,
      descripcionProveedor: f.descripcion || f.supplier_desc,
      producto, confianza: f.confidence, vecesUsado: f.times_used,
      factorConversion: factor,
      precio: valido ? Math.round(costo.costoUnitario * 100) / 100 : null,
      precioProveedor: valido ? Math.round(costo.costoConIva * 100) / 100 : null,
      moneda: f.moneda || null, fechaUltimoCosto: valido ? f.fecha : null
    };
  });
  // Solo se comparan importes de la misma moneda y en unidades propias.
  relaciones.sort((a, b) => {
    if (a.precio === null) return b.precio === null ? 0 : 1;
    if (b.precio === null) return -1;
    return a.moneda.localeCompare(b.moneda) || a.precio - b.precio;
  });
  return { producto, relaciones, total: relaciones.length };
}

module.exports = { getRelacionesDeProducto };
