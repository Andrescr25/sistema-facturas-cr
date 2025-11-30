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
      ),
      ultimo_costos_proveedor AS (
        SELECT DISTINCT ON (alegra_item_id)
          alegra_item_id AS alegra_id,
          precio_unitario::numeric AS costo_reciente,
          descripcion AS descripcion_proveedor
        FROM productos_factura_proveedor
        WHERE alegra_item_id IS NOT NULL
          AND alegra_item_id ~ '^[0-9]+$'
          AND precio_unitario IS NOT NULL
        ORDER BY alegra_item_id, id DESC
      ),
      promedio_costos_proveedor AS (
        SELECT 
          alegra_item_id AS alegra_id,
          AVG(precio_unitario)::numeric AS costo_promedio
        FROM productos_factura_proveedor
        WHERE alegra_item_id IS NOT NULL
          AND alegra_item_id ~ '^[0-9]+$'
          AND precio_unitario IS NOT NULL
        GROUP BY alegra_item_id
      ),
      costos_faltantes AS (
        SELECT 
          producto_id,
          MAX(precio_asignado)::numeric AS precio_asignado_reciente,
          AVG(precio_asignado)::numeric AS precio_asignado_promedio
        FROM faltantes
        WHERE precio_asignado IS NOT NULL
          AND precio_asignado > 0
        GROUP BY producto_id
      ),
      factores_conversion AS (
        SELECT 
          alegra_item_id AS alegra_id,
          MAX(factor_conversion)::numeric AS factor_conversion
        FROM supplier_product_mapping
        WHERE alegra_item_id IS NOT NULL
          AND alegra_item_id ~ '^[0-9]+$'
          AND factor_conversion IS NOT NULL
          AND factor_conversion > 0
        GROUP BY alegra_item_id
      )
      SELECT
        d.producto_id,
        d.producto_codigo,
        d.producto_nombre,
        d.proveedor_id,
        d.proveedor_nombre,
        SUM(d.cantidad_faltante_total) AS cantidad_total,
        SUM(d.faltantes_registrados) AS faltantes_total,
        SUM(d.costo_total) AS costo_total,
        SUM(d.venta_total) AS venta_total,
        SUM(d.margen_total) AS margen_total,
        MIN(d.fecha_inicio_semana) AS primera_semana,
        MAX(d.fecha_inicio_semana) AS ultima_semana,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'semana', d.semana,
            'ano', d.ano,
            'fecha', TO_CHAR(d.fecha_inicio_semana, 'YYYY-MM-DD'),
            'cantidad', d.cantidad_faltante_total,
            'margen', d.margen_total
          )
          ORDER BY d.fecha_inicio_semana ASC
        ) AS historial,
        MAX(p.alegra_id) AS producto_alegra_id,
        MAX(p.precio_unitario) AS producto_precio_unitario,
        MAX(ap.cost) AS alegra_cost,
        COALESCE(ucp.costo_reciente, pcp.costo_promedio) AS proveedor_cost,
        cf.precio_asignado_reciente,
        cf.precio_asignado_promedio,
        ucp.descripcion_proveedor,
        fcm.factor_conversion
      FROM datos d
      LEFT JOIN productos p ON p.id = d.producto_id
      LEFT JOIN alegra_products_cache ap ON ap.alegra_id = p.alegra_id::text
      LEFT JOIN ultimo_costos_proveedor ucp ON ucp.alegra_id = p.alegra_id::text
      LEFT JOIN promedio_costos_proveedor pcp ON pcp.alegra_id = p.alegra_id::text
      LEFT JOIN costos_faltantes cf ON cf.producto_id = d.producto_id
      LEFT JOIN factores_conversion fcm ON fcm.alegra_id = p.alegra_id::text
      GROUP BY 
        d.producto_id, 
        d.producto_codigo, 
        d.producto_nombre, 
        d.proveedor_id, 
        d.proveedor_nombre,
        ucp.costo_reciente,
        pcp.costo_promedio,
        cf.precio_asignado_reciente,
        cf.precio_asignado_promedio,
        ucp.descripcion_proveedor,
        fcm.factor_conversion
      ORDER BY SUM(d.margen_total) DESC, SUM(d.cantidad_faltante_total) DESC
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
    const costoTotalRaw = Number(row.costo_total) || 0;
    const ventaTotal = Number(row.venta_total) || 0;
    const margenTotalRaw = Number(row.margen_total) || 0;
    const costoProducto = Number(row.producto_precio_unitario) || 0;
    const costoAlegra = Number(row.alegra_cost) || 0;
    const costoProveedorRaw = Number(row.proveedor_cost) || 0;
    const precioAsignadoReciente = Number(row.precio_asignado_reciente) || 0;
    const precioAsignadoPromedio = Number(row.precio_asignado_promedio) || 0;
    const factorConversion = Number(row.factor_conversion) && Number(row.factor_conversion) > 0
      ? Number(row.factor_conversion)
      : 1;
    const costoProveedor =
      costoProveedorRaw > 0 ? costoProveedorRaw / factorConversion : costoProveedorRaw;
    const faltantesTotal = Number(row.faltantes_total) || 0;
    const semanasConMovimiento = historial.length || 1;

    const promedioSemanal = semanasConMovimiento > 0 ? cantidadTotal / semanasConMovimiento : 0;

    const unitCostFromTotals =
      cantidadTotal > 0 && costoTotalRaw > 0 ? costoTotalRaw / cantidadTotal : 0;
    const unitCostFallbackCandidates = [
      unitCostFromTotals,
      costoProveedor,
      precioAsignadoReciente,
      precioAsignadoPromedio,
      costoAlegra,
      costoProducto
    ].filter((value) => value && value > 0);
    const unitCostFallback = unitCostFallbackCandidates.length > 0 ? unitCostFallbackCandidates[0] : 0;

    const costoTotalCalculado =
      costoTotalRaw > 0
        ? costoTotalRaw
        : Math.round(unitCostFallback * cantidadTotal * 100) / 100;

    const margenTotalCalculado =
      costoTotalRaw > 0
        ? margenTotalRaw
        : Math.round((ventaTotal - costoTotalCalculado) * 100) / 100;

    const precioCostoPromedio = unitCostFromTotals > 0 ? unitCostFromTotals : unitCostFallback;
    const precioVentaPromedio = cantidadTotal > 0 ? ventaTotal / cantidadTotal : 0;
    const margenUnitarioPromedio =
      cantidadTotal > 0 ? margenTotalCalculado / cantidadTotal : 0;
    const costoBeneficio = ventaTotal > 0 ? margenTotalCalculado / ventaTotal : 0;

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
      costo_total: costoTotalCalculado,
      venta_total: ventaTotal,
      margen_total: margenTotalCalculado,
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

