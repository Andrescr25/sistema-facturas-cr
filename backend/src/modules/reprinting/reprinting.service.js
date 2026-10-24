/**
 * Reprinting Module - Service
 * Lógica de negocio para operaciones de reimpresión
 */

const { query } = require('../../../config/database');

const colaImpresion = require('./colaImpresion');

// Las dos listas de la cola salen de colaImpresion.js, sobre la factura propia
// (migración independencia/032). Las columnas `categoria` y `total_ajustes` que
// esto creaba al vuelo ya existen en todas las bases.
const getPendingInvoices = () => colaImpresion.listarPendientes();
const getProcessedInvoices = (pagina) => colaImpresion.listarProcesadas(pagina);

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

module.exports = {
  getPendingInvoices,
  getProcessedInvoices,
  getHistory
};
