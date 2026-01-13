/**
 * Reprinting Module - Service
 * Lógica de negocio para operaciones de reimpresión
 */

const { query } = require('../../../config/database');

// Función para asegurar que existan las columnas necesarias en facturas_reimpresion
const ensureReimpresionSchema = (() => {
  let ensured = false;
  return async () => {
    if (ensured) return;
    await query(`
      ALTER TABLE facturas_reimpresion 
      ADD COLUMN IF NOT EXISTS categoria VARCHAR(32) DEFAULT 'requiere_cambios'
    `);
    await query(`
      ALTER TABLE facturas_reimpresion 
      ADD COLUMN IF NOT EXISTS total_ajustes INTEGER DEFAULT 0
    `);
    ensured = true;
  };
})();

/**
 * Obtiene facturas pendientes de reimpresión
 */
async function getPendingInvoices() {
  await ensureReimpresionSchema();

  const result = await query(`
    SELECT
      fr.id as reimpresion_id,
      fr.ajustes_realizados,
      fr.estado as estado_reimpresion,
      fr.fecha_creacion,
      fr.categoria,
      fr.total_ajustes,
      fa.id as factura_id,
      fa.numero_factura,
      fa.alegra_id,
      fa.cliente_nombre,
      fa.cliente_email,
      fa.fecha_emision,
      fa.total
    FROM facturas_reimpresion fr
    JOIN facturas fa ON fr.factura_id = fa.id
    WHERE fr.estado = 'pendiente'
    ORDER BY fr.fecha_creacion DESC
  `);

  // Procesar los ajustes JSONB
  const facturasConAjustes = result.rows.map(factura => {
    const ajustes = typeof factura.ajustes_realizados === 'string'
      ? JSON.parse(factura.ajustes_realizados)
      : factura.ajustes_realizados;

    const requiereActualizacion = ajustes?.some(aj => aj.requiere_actualizacion) || false;

    return {
      ...factura,
      ajustes_realizados: ajustes,
      total_ajustes: ajustes?.length || 0,
      requiere_actualizacion: requiereActualizacion,
      categoria: factura.categoria || (requiereActualizacion ? 'requiere_cambios' : 'sin_cambios')
    };
  });

  const sinCambios = facturasConAjustes.filter(f => f.categoria === 'sin_cambios');
  const requiereCambios = facturasConAjustes.filter(f => f.categoria !== 'sin_cambios');

  return {
    success: true,
    data: {
      sin_cambios: sinCambios,
      requiere_cambios: requiereCambios
    },
    total_pendientes: facturasConAjustes.length,
    resumen: {
      facturas_pendientes: facturasConAjustes.length,
      facturas_sin_cambios: sinCambios.length,
      facturas_con_cambios: requiereCambios.length
    }
  };
}

/**
 * Obtiene facturas procesadas de reimpresión
 */
async function getProcessedInvoices() {
  await ensureReimpresionSchema();

  const result = await query(`
    SELECT
      fr.id as reimpresion_id,
      fr.ajustes_realizados,
      fr.estado as estado_reimpresion,
      fr.fecha_creacion,
      fr.fecha_procesamiento,
      fr.categoria,
      fr.total_ajustes,
      fa.id as factura_id,
      fa.numero_factura,
      fa.alegra_id,
      fa.cliente_nombre,
      fa.fecha_emision,
      fa.total
    FROM facturas_reimpresion fr
    JOIN facturas fa ON fr.factura_id = fa.id
    WHERE fr.estado = 'procesada'
      AND fr.fecha_procesamiento >= CURRENT_DATE - INTERVAL '7 days'
    ORDER BY fr.fecha_procesamiento DESC
  `);

  const facturasConAjustes = result.rows.map(factura => {
    const ajustes = typeof factura.ajustes_realizados === 'string'
      ? JSON.parse(factura.ajustes_realizados)
      : factura.ajustes_realizados;

    return {
      ...factura,
      ajustes_realizados: ajustes,
      total_ajustes: ajustes?.length || 0
    };
  });

  return {
    success: true,
    data: facturasConAjustes,
    total: facturasConAjustes.length
  };
}

/**
 * Obtiene el historial de procesamientos
 */
async function getHistory({ fechaDesde, fechaHasta, procesadoPor }) {
  let sqlQuery = `
    SELECT 
      p.id,
      p.fecha_procesamiento,
      p.total_facturas,
      p.facturas_para_historial,
      p.facturas_para_reimpresion,
      p.procesado_por,
      p.detalles
    FROM procesamientos p
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  if (fechaDesde) {
    sqlQuery += ` AND p.fecha_procesamiento >= $${paramIndex}`;
    params.push(fechaDesde);
    paramIndex++;
  }

  if (fechaHasta) {
    sqlQuery += ` AND p.fecha_procesamiento <= $${paramIndex}`;
    params.push(fechaHasta);
    paramIndex++;
  }

  if (procesadoPor) {
    sqlQuery += ` AND p.procesado_por ILIKE $${paramIndex}`;
    params.push(`%${procesadoPor}%`);
    paramIndex++;
  }

  sqlQuery += ` ORDER BY p.fecha_procesamiento DESC LIMIT 100`;

  const result = await query(sqlQuery, params);

  return {
    success: true,
    data: result.rows,
    total: result.rows.length
  };
}

/**
 * Limpia el historial de procesamientos
 */
async function clearHistory() {
  const countResult = await query('SELECT COUNT(*) FROM procesamientos');
  const totalRegistros = parseInt(countResult.rows[0].count);

  await query('DELETE FROM procesamientos');

  console.log(`✅ Historial limpiado: ${totalRegistros} registros eliminados`);

  return {
    success: true,
    message: 'Historial limpiado correctamente',
    registros_eliminados: totalRegistros
  };
}

module.exports = {
  getPendingInvoices,
  getProcessedInvoices,
  getHistory,
  clearHistory
};
