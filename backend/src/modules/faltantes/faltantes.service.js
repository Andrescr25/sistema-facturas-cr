/**
 * Faltantes Module - Service
 * Lógica de negocio para el registro de faltantes de facturas (tablas SQL legacy)
 */

const { query } = require('../../../config/database');

/**
 * Error con código de estado HTTP para que el controller responda con el status correcto.
 */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Obtener todos los faltantes, con filtros opcionales
 */
async function getFaltantes({ semana, mes, ano, tipo_faltante, proveedor_id }) {
  let sql = `
    SELECT f.*,
           fa.numero_factura, fa.cliente_nombre, fa.fecha_emision,
           p.nombre as producto_nombre, p.codigo as producto_codigo,
           pr.nombre as proveedor_nombre
    FROM faltantes f
    JOIN facturas fa ON f.factura_id = fa.id
    JOIN productos p ON f.producto_id = p.id
    LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
  `;

  const conditions = ["f.tipo_faltante != 'completo'", "f.cantidad_faltante > 0"];
  const params = [];
  let paramIndex = 1;

  if (semana) {
    conditions.push(`fa.semana = $${paramIndex++}`);
    params.push(semana);
  }

  if (mes) {
    conditions.push(`fa.mes = $${paramIndex++}`);
    params.push(mes);
  }

  if (ano) {
    conditions.push(`fa.ano = $${paramIndex++}`);
    params.push(ano);
  }

  if (tipo_faltante) {
    conditions.push(`f.tipo_faltante = $${paramIndex++}`);
    params.push(tipo_faltante);
  }

  if (proveedor_id) {
    conditions.push(`p.proveedor_id = $${paramIndex++}`);
    params.push(proveedor_id);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY f.created_at DESC';

  const result = await query(sql, params);

  return {
    data: result.rows,
    total: result.rows.length,
    filters: { semana, mes, ano, tipo_faltante, proveedor_id }
  };
}

/**
 * Actualizar la cantidad_entregada de factura_items según el tipo de faltante
 */
async function actualizarCantidadEntregada(factura_id, producto_id, tipo_faltante, cantidad_faltante) {
  if (tipo_faltante === 'parcial') {
    await query(`
      UPDATE factura_items
      SET cantidad_entregada = cantidad_original - $1
      WHERE factura_id = $2 AND producto_id = $3
    `, [cantidad_faltante, factura_id, producto_id]);
  } else if (tipo_faltante === 'total') {
    await query(`
      UPDATE factura_items
      SET cantidad_entregada = 0
      WHERE factura_id = $1 AND producto_id = $2
    `, [factura_id, producto_id]);
  }
}

/**
 * Registrar un nuevo faltante
 */
async function registrarFaltante({ factura_id, producto_id, cantidad_faltante, tipo_faltante, observaciones, registrado_por }) {
  if (!factura_id || !producto_id || !cantidad_faltante || !tipo_faltante) {
    throw httpError(400, 'Faltan campos requeridos: factura_id, producto_id, cantidad_faltante, tipo_faltante');
  }

  if (!['total', 'parcial'].includes(tipo_faltante)) {
    throw httpError(400, 'tipo_faltante debe ser "total" o "parcial"');
  }

  const facturaCheck = await query('SELECT id FROM facturas WHERE id = $1', [factura_id]);
  if (facturaCheck.rows.length === 0) {
    throw httpError(404, 'Factura no encontrada');
  }

  const productoCheck = await query('SELECT id FROM productos WHERE id = $1', [producto_id]);
  if (productoCheck.rows.length === 0) {
    throw httpError(404, 'Producto no encontrado');
  }

  const result = await query(`
    INSERT INTO faltantes (factura_id, producto_id, cantidad_faltante,
                         tipo_faltante, observaciones, registrado_por)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [factura_id, producto_id, cantidad_faltante, tipo_faltante, observaciones, registrado_por]);

  await actualizarCantidadEntregada(factura_id, producto_id, tipo_faltante, cantidad_faltante);

  return result.rows[0];
}

/**
 * Registrar múltiples faltantes de una factura de una sola vez.
 * registrado_por es compartido para todo el lote (no por ítem).
 */
async function registrarFaltantesMultiples(factura_id, faltantes, registrado_por) {
  if (!faltantes || !Array.isArray(faltantes) || faltantes.length === 0) {
    throw httpError(400, 'Se requiere un array de faltantes');
  }

  const insertedFaltantes = [];

  for (const faltante of faltantes) {
    const { producto_id, cantidad_faltante, tipo_faltante, observaciones } = faltante;

    // Validar cada faltante
    if (!producto_id || !cantidad_faltante || !tipo_faltante) {
      continue; // Saltar este faltante si faltan datos
    }

    const result = await query(`
      INSERT INTO faltantes (factura_id, producto_id, cantidad_faltante,
                           tipo_faltante, observaciones, registrado_por)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [factura_id, producto_id, cantidad_faltante, tipo_faltante, observaciones, registrado_por]);

    insertedFaltantes.push(result.rows[0]);

    await actualizarCantidadEntregada(factura_id, producto_id, tipo_faltante, cantidad_faltante);
  }

  return insertedFaltantes;
}

/**
 * Obtener los faltantes de una factura específica
 */
async function getFaltantesPorFactura(id) {
  const result = await query(`
    SELECT f.*,
           p.nombre as producto_nombre, p.codigo as producto_codigo,
           pr.nombre as proveedor_nombre
    FROM faltantes f
    JOIN productos p ON f.producto_id = p.id
    LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
    WHERE f.factura_id = $1 AND f.tipo_faltante != 'completo' AND f.cantidad_faltante > 0
    ORDER BY f.created_at DESC
  `, [id]);

  return { data: result.rows, total: result.rows.length };
}

/**
 * Actualizar un faltante existente
 */
async function actualizarFaltante(id, { cantidad_faltante, tipo_faltante, observaciones }) {
  const result = await query(`
    UPDATE faltantes
    SET cantidad_faltante = COALESCE($1, cantidad_faltante),
        tipo_faltante = COALESCE($2, tipo_faltante),
        observaciones = COALESCE($3, observaciones)
    WHERE id = $4
    RETURNING *
  `, [cantidad_faltante, tipo_faltante, observaciones, id]);

  if (result.rows.length === 0) {
    throw httpError(404, 'Faltante no encontrado');
  }

  return result.rows[0];
}

/**
 * Eliminar un faltante y restaurar la cantidad entregada en factura_items
 */
async function eliminarFaltante(id) {
  const faltanteInfo = await query(`
    SELECT factura_id, producto_id, cantidad_faltante, tipo_faltante
    FROM faltantes
    WHERE id = $1
  `, [id]);

  if (faltanteInfo.rows.length === 0) {
    throw httpError(404, 'Faltante no encontrado');
  }

  const { factura_id, producto_id, cantidad_faltante, tipo_faltante } = faltanteInfo.rows[0];

  await query('DELETE FROM faltantes WHERE id = $1', [id]);

  // Restaurar cantidad entregada en factura_items
  if (tipo_faltante === 'total') {
    // Si era faltante total, restaurar cantidad original
    await query(`
      UPDATE factura_items
      SET cantidad_entregada = cantidad_original
      WHERE factura_id = $1 AND producto_id = $2
    `, [factura_id, producto_id]);
  } else if (tipo_faltante === 'parcial') {
    // Si era faltante parcial, sumar la cantidad que faltaba
    await query(`
      UPDATE factura_items
      SET cantidad_entregada = cantidad_entregada + $1
      WHERE factura_id = $2 AND producto_id = $3
    `, [cantidad_faltante, factura_id, producto_id]);
  }
}

/**
 * Obtener el resumen de faltantes de un período (año/mes/semana)
 */
async function getResumenPorPeriodo(ano, mes, semana) {
  const result = await query(`
    SELECT
      COUNT(*) as total_faltantes,
      COUNT(DISTINCT f.factura_id) as facturas_con_faltantes,
      COUNT(DISTINCT f.producto_id) as productos_faltantes,
      SUM(f.cantidad_faltante) as cantidad_total_faltante,
      COUNT(CASE WHEN f.tipo_faltante = 'total' THEN 1 END) as faltantes_totales,
      COUNT(CASE WHEN f.tipo_faltante = 'parcial' THEN 1 END) as faltantes_parciales
    FROM faltantes f
    JOIN facturas fa ON f.factura_id = fa.id
    WHERE fa.ano = $1 AND fa.mes = $2 AND fa.semana = $3
      AND f.tipo_faltante != 'completo' AND f.cantidad_faltante > 0
  `, [ano, mes, semana]);

  return result.rows[0];
}

module.exports = {
  getFaltantes,
  registrarFaltante,
  registrarFaltantesMultiples,
  getFaltantesPorFactura,
  actualizarFaltante,
  eliminarFaltante,
  getResumenPorPeriodo
};
