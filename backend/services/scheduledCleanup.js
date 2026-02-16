const cron = require('node-cron');
const { query } = require('../config/database');

/**
 * Limpieza automática de faltantes pendientes y procesados.
 * Se ejecuta cada domingo a las 23:59 (hora del servidor).
 * 
 * Lógica extraída del endpoint DELETE /reportes/faltantes/proveedor/limpiar
 */
async function ejecutarLimpiezaFaltantes() {
  try {
    console.log('🧹 [CRON] Iniciando limpieza semanal de faltantes...');

    // Obtener faltantes pendientes
    const faltantesPendientes = await query(`
      SELECT f.id, f.factura_id
      FROM faltantes f
      WHERE f.estado = 'pendiente'
    `);

    // Obtener faltantes procesados
    const faltantesProcesados = await query(`
      SELECT f.id, f.factura_id
      FROM faltantes f
      WHERE f.estado = 'procesado'
    `);

    if (faltantesPendientes.rows.length === 0 && faltantesProcesados.rows.length === 0) {
      console.log('🧹 [CRON] No hay faltantes para limpiar. Nada que hacer.');
      return;
    }

    const stats = {
      pendientes: { faltantes: 0, ajustes: 0 },
      procesados: { faltantes: 0, ajustes: 0 }
    };

    // Eliminar faltantes pendientes
    const faltantesPendientesIds = faltantesPendientes.rows.map(f => f.id);
    if (faltantesPendientesIds.length > 0) {
      const ajustesPendientes = await query(`
        DELETE FROM faltantes_ajustes
        WHERE faltante_id = ANY($1::int[])
        RETURNING id
      `, [faltantesPendientesIds]);

      const pendientesEliminados = await query(`
        DELETE FROM faltantes 
        WHERE id = ANY($1::int[])
        RETURNING id
      `, [faltantesPendientesIds]);

      stats.pendientes.ajustes = ajustesPendientes.rows.length;
      stats.pendientes.faltantes = pendientesEliminados.rows.length;
    }

    // Eliminar faltantes procesados
    const faltantesProcesadosIds = faltantesProcesados.rows.map(f => f.id);
    if (faltantesProcesadosIds.length > 0) {
      const ajustesProcesados = await query(`
        DELETE FROM faltantes_ajustes
        WHERE faltante_id = ANY($1::int[])
        RETURNING id
      `, [faltantesProcesadosIds]);

      const procesadosEliminados = await query(`
        DELETE FROM faltantes
        WHERE id = ANY($1::int[])
        RETURNING id
      `, [faltantesProcesadosIds]);

      stats.procesados.ajustes = ajustesProcesados.rows.length;
      stats.procesados.faltantes = procesadosEliminados.rows.length;
    }

    // Limpiar facturas pendientes manualmente relacionadas
    const facturaIdsParaLimpiar = Array.from(new Set([
      ...faltantesPendientes.rows.map(f => f.factura_id),
      ...faltantesProcesados.rows.map(f => f.factura_id)
    ])).filter(Boolean);

    let pendientesManualesEliminados = 0;
    if (facturaIdsParaLimpiar.length > 0) {
      const pendientesResult = await query(`
        DELETE FROM facturas_pendientes
        WHERE factura_id = ANY($1::int[])
        RETURNING id
      `, [facturaIdsParaLimpiar]);
      pendientesManualesEliminados = pendientesResult.rows.length;
    }

    // Limpiar observaciones adicionales de facturas que ya no tienen faltantes
    await query(`
      UPDATE facturas 
      SET observaciones_adicionales = NULL
      WHERE observaciones_adicionales IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM faltantes f 
        WHERE f.factura_id = facturas.id 
        AND f.estado = 'pendiente'
      )
    `);

    console.log(`🧹 [CRON] Limpieza completada:`);
    console.log(`   ✅ ${stats.pendientes.faltantes} faltantes pendientes borrados`);
    console.log(`   ✅ ${stats.procesados.faltantes} faltantes procesados borrados`);
    console.log(`   ✅ ${stats.pendientes.ajustes + stats.procesados.ajustes} ajustes eliminados`);
    console.log(`   ✅ ${pendientesManualesEliminados} facturas pendientes liberadas`);

  } catch (error) {
    console.error('❌ [CRON] Error en limpieza semanal:', error.message);
  }
}

/**
 * Inicializar el cron job de limpieza semanal.
 * Cron: '59 23 * * 0' = Domingo a las 23:59
 */
function iniciarLimpiezaProgramada() {
  // '59 23 * * 0' = minuto 59, hora 23, cualquier día del mes, cualquier mes, domingo (0)
  const task = cron.schedule('59 23 * * 0', () => {
    console.log('⏰ [CRON] Disparando limpieza semanal (Domingo 23:59)...');
    ejecutarLimpiezaFaltantes();
  }, {
    timezone: 'America/Costa_Rica'
  });

  console.log('⏰ Limpieza semanal programada: Domingos a las 23:59 (America/Costa_Rica)');
  return task;
}

module.exports = { iniciarLimpiezaProgramada, ejecutarLimpiezaFaltantes };
