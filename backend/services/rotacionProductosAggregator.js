const { query } = require('../config/database');

function getWeekInfo(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return getWeekInfo(now);
  }

  const localDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(localDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((localDate - yearStart) / 86400000) + 1) / 7);
  const weekYear = localDate.getUTCFullYear();

  const monday = new Date(localDate);
  monday.setUTCDate(localDate.getUTCDate() - localDate.getUTCDay() + 1);

  return {
    semana: weekNo,
    ano: weekYear,
    fechaInicioSemana: monday.toISOString().slice(0, 10),
  };
}

async function registrarRotacionProducto({
  productoId,
  productoCodigo,
  productoNombre,
  proveedorId,
  proveedorNombre,
  fechaReferencia,
  cantidadFaltante,
  costoUnitario = 0,
  precioVentaUnitario = 0,
}) {
  if (!productoId || !productoCodigo) {
    return;
  }

  const cantidad = Number(cantidadFaltante) || 0;
  if (cantidad <= 0) {
    return;
  }

  const costo = Number(costoUnitario) || 0;
  const precioVenta = Number(precioVentaUnitario) || 0;
  const costoTotal = costo * cantidad;
  const ventaTotal = precioVenta * cantidad;
  const margenTotal = ventaTotal - costoTotal;

  const { semana, ano, fechaInicioSemana } = getWeekInfo(fechaReferencia || new Date());

  await query(`
    INSERT INTO rotacion_productos (
      producto_id,
      producto_codigo,
      producto_nombre,
      proveedor_id,
      proveedor_nombre,
      semana,
      ano,
      fecha_inicio_semana,
      faltantes_registrados,
      cantidad_faltante_total,
      costo_total,
      venta_total,
      margen_total
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      1, $9, $10, $11, $12
    )
    ON CONFLICT (producto_id, semana, ano)
    DO UPDATE SET
      faltantes_registrados = rotacion_productos.faltantes_registrados + 1,
      cantidad_faltante_total = rotacion_productos.cantidad_faltante_total + EXCLUDED.cantidad_faltante_total,
      costo_total = rotacion_productos.costo_total + EXCLUDED.costo_total,
      venta_total = rotacion_productos.venta_total + EXCLUDED.venta_total,
      margen_total = rotacion_productos.margen_total + EXCLUDED.margen_total,
      proveedor_id = COALESCE(rotacion_productos.proveedor_id, EXCLUDED.proveedor_id),
      proveedor_nombre = COALESCE(rotacion_productos.proveedor_nombre, EXCLUDED.proveedor_nombre),
      updated_at = CURRENT_TIMESTAMP
  `, [
    productoId,
    productoCodigo,
    productoNombre || 'Producto sin nombre',
    proveedorId || null,
    proveedorNombre || null,
    semana,
    ano,
    fechaInicioSemana,
    cantidad,
    costoTotal,
    ventaTotal,
    margenTotal,
  ]);
}

module.exports = {
  registrarRotacionProducto,
};

