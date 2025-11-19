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
      WITH faltantes_semana AS (
        SELECT
          p.codigo,
          p.nombre,
          fa.semana,
          fa.ano,
          DATE_TRUNC('week', fa.fecha_emision) AS semana_fecha,
          SUM(f.cantidad_faltante) AS cantidad_total,
          COUNT(f.id) AS registros_total,
          MAX(f.created_at) AS ultimo_registro
        FROM faltantes f
        JOIN productos p ON f.producto_id = p.id
        JOIN facturas fa ON f.factura_id = fa.id
        WHERE f.estado IN ('pendiente', 'procesado')
          AND fa.fecha_emision >= CURRENT_DATE - ($2 * INTERVAL '1 week')
        GROUP BY p.codigo, p.nombre, fa.semana, fa.ano, DATE_TRUNC('week', fa.fecha_emision)
      )
      SELECT
        codigo,
        nombre,
        SUM(cantidad_total) AS cantidad_total,
        SUM(registros_total) AS registros_total,
        COUNT(*) AS semanas_con_movimiento,
        MAX(ultimo_registro) AS ultimo_registro,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'semana', semana,
            'ano', ano,
            'fecha', TO_CHAR(semana_fecha, 'YYYY-MM-DD'),
            'cantidad', cantidad_total,
            'registros', registros_total
          )
          ORDER BY semana_fecha ASC
        ) AS historial
      FROM faltantes_semana
      GROUP BY codigo, nombre
      ORDER BY SUM(cantidad_total) DESC
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
      registros: Number(item.registros) || 0,
      etiqueta: `Semana ${item.semana}/${item.ano}`,
    }));

    const totalSemanas = historial.length || 1;
    const promedioSemanal = (Number(row.cantidad_total) || 0) / totalSemanas;

    const tendenciaReciente = (() => {
      if (historial.length === 0) return 0;
      const ultimasDos = historial.slice(-2).reduce((sum, item) => sum + item.cantidad, 0);
      const anteriores = historial.slice(-4, -2).reduce((sum, item) => sum + item.cantidad, 0);
      return parseFloat((ultimasDos - anteriores).toFixed(2));
    })();

    return {
      codigo: row.codigo,
      nombre: row.nombre,
      cantidad_total: Number(row.cantidad_total) || 0,
      registros_total: Number(row.registros_total) || 0,
      semanas_con_movimiento: Number(row.semanas_con_movimiento) || historial.length,
      ultimo_registro: row.ultimo_registro,
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
  };

  return {
    productos,
    resumen,
    filtros: {
      semanas: semanasAnalisis,
      limite: limiteProductos,
    },
  };
}

module.exports = {
  obtenerRotacionProductos,
};

