const { query } = require('../config/database');

function sanitizeNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 }) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function obtenerRotacionProductos({ semanas = 12, limite = 50 } = {}) {
  const semanasAnalisis = sanitizeNumber(semanas, { min: 1, max: 52, fallback: 12 });
  const limiteProductos = sanitizeNumber(limite, { min: 5, max: 200, fallback: 50 });

  const rotacionResult = await query(
    `
      WITH datos AS (
        SELECT *
        FROM rotacion_productos
        WHERE fecha_inicio_semana >= CURRENT_DATE - ($2 * INTERVAL '1 week')
      )
      SELECT
        producto_id,
        producto_codigo,
        producto_nombre,
        proveedor_id,
        proveedor_nombre,
        SUM(cantidad_faltante_total) AS cantidad_total,
        SUM(faltantes_registrados) AS faltantes_total,
        SUM(costo_total) AS costo_total,
        SUM(venta_total) AS venta_total,
        SUM(margen_total) AS margen_total,
        MIN(fecha_inicio_semana) AS primera_semana,
        MAX(fecha_inicio_semana) AS ultima_semana,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'semana', semana,
            'ano', ano,
            'fecha', TO_CHAR(fecha_inicio_semana, 'YYYY-MM-DD'),
            'cantidad', cantidad_faltante_total,
            'margen', margen_total
          )
          ORDER BY fecha_inicio_semana ASC
        ) AS historial
      FROM datos
      GROUP BY producto_id, producto_codigo, producto_nombre, proveedor_id, proveedor_nombre
      ORDER BY SUM(margen_total) DESC, SUM(cantidad_faltante_total) DESC
      LIMIT $1
    `,
    [limiteProductos, semanasAnalisis]
  );

  const productos = rotacionResult.rows.map((row) => {
    const historial = (row.historial || []).map((item) => ({
      semana: item.semana,
      ano: item.ano,
      fecha: item.fecha,
      cantidad: Number(item.cantidad) || 0,
      margen: Number(item.margen) || 0,
      etiqueta: `Sem ${item.semana}/${item.ano}`,
    }));

    const cantidadTotal = Number(row.cantidad_total) || 0;
    const costoTotal = Number(row.costo_total) || 0;
    const ventaTotal = Number(row.venta_total) || 0;
    const margenTotal = Number(row.margen_total) || 0;
    const faltantesTotal = Number(row.faltantes_total) || 0;
    const semanasConMovimiento = historial.length || 1;

    const promedioSemanal = semanasConMovimiento > 0
      ? cantidadTotal / semanasConMovimiento
      : 0;
    const precioCostoPromedio = cantidadTotal > 0 ? costoTotal / cantidadTotal : 0;
    const precioVentaPromedio = cantidadTotal > 0 ? ventaTotal / cantidadTotal : 0;
    const margenUnitarioPromedio = cantidadTotal > 0 ? margenTotal / cantidadTotal : 0;
    const costoBeneficio = ventaTotal > 0 ? margenTotal / ventaTotal : 0;

    const tendenciaReciente = (() => {
      if (historial.length === 0) return 0;
      const ultimasDos = historial.slice(-2).reduce((sum, item) => sum + item.cantidad, 0);
      const anteriores = historial.slice(-4, -2).reduce((sum, item) => sum + item.cantidad, 0);
      return parseFloat((ultimasDos - anteriores).toFixed(2));
    })();

    return {
      producto_id: row.producto_id,
      codigo: row.producto_codigo,
      nombre: row.producto_nombre,
      proveedor_id: row.proveedor_id,
      proveedor_nombre: row.proveedor_nombre,
      cantidad_total: cantidadTotal,
      registros_total: faltantesTotal,
      costo_total: costoTotal,
      venta_total: ventaTotal,
      margen_total: margenTotal,
      precio_costo_promedio: parseFloat(precioCostoPromedio.toFixed(2)),
      precio_venta_promedio: parseFloat(precioVentaPromedio.toFixed(2)),
      margen_unitario_promedio: parseFloat(margenUnitarioPromedio.toFixed(2)),
      costo_beneficio: parseFloat(costoBeneficio.toFixed(4)),
      semanas_con_movimiento: semanasConMovimiento,
      ultimo_registro: row.ultima_semana,
      promedio_semanal: parseFloat(promedioSemanal.toFixed(2)),
      tendencia_reciente: tendenciaReciente,
      historial,
    };
  });

  const resumen = {
    semanas_analizadas: semanasAnalisis,
    productos_analizados: productos.length,
    total_unidades: productos.reduce((sum, p) => sum + p.cantidad_total, 0),
    total_registros: productos.reduce((sum, p) => sum + p.registros_total, 0),
    costo_total: productos.reduce((sum, p) => sum + p.costo_total, 0),
    venta_total: productos.reduce((sum, p) => sum + p.venta_total, 0),
    margen_total: productos.reduce((sum, p) => sum + p.margen_total, 0),
  };

  const insights = {
    top_margen: [...productos].sort((a, b) => b.margen_total - a.margen_total).slice(0, 5),
    top_rotacion: [...productos].sort((a, b) => b.cantidad_total - a.cantidad_total).slice(0, 5),
    mejor_costo_beneficio: [...productos]
      .filter((p) => p.costo_beneficio > 0)
      .sort((a, b) => b.costo_beneficio - a.costo_beneficio)
      .slice(0, 5),
  };

  return {
    productos,
    resumen,
    insights,
    filtros: {
      semanas: semanasAnalisis,
      limite: limiteProductos,
    },
  };
}

module.exports = {
  obtenerRotacionProductos,
};

