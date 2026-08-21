/**
 * Dashboard - Resumen de lo que está pendiente.
 *
 * TODO SALE DE LA BASE LOCAL, en una sola petición y con las consultas en
 * paralelo. La pantalla de inicio se abre decenas de veces por día: si
 * consultara Alegra tardaría minutos, y si hiciera una llamada por tarjeta
 * serían siete idas y vueltas para dibujar una pantalla.
 *
 * Cada número es trabajo que alguien tiene que hacer, no una métrica de
 * vanidad: si un contador está en cero, esa tarjeta no tiene nada que pedir.
 */

const { query } = require('../../../config/database');

// La pantalla de Facturas en Bodega solo trae los últimos 30 días. Sin este
// mismo corte el dashboard mostraría el acumulado histórico —cientos de
// facturas viejas que nadie va a alistar— y el número no querría decir nada.
const DIAS_BODEGA = 30;

async function resumen() {
  const [pedidos, cobrar, bodega, duplicados, pagos, revision, auditorias] = await Promise.all([
    query(`SELECT COUNT(*)::int n FROM pedido_cliente WHERE estado = 'pendiente';`),

    query(`
      SELECT COUNT(*)::int n,
             COALESCE(SUM(saldo), 0)::numeric total,
             COUNT(*) FILTER (WHERE fecha_vencimiento < CURRENT_DATE)::int vencidas,
             COALESCE(SUM(saldo) FILTER (WHERE fecha_vencimiento < CURRENT_DATE), 0)::numeric vencido
      FROM cuentas_por_cobrar WHERE saldo > 0;
    `),

    query(`
      SELECT COUNT(*)::int n FROM facturas
      WHERE estado_bodega = 'pendiente'
        AND fecha_emision >= CURRENT_DATE - $1::integer;
    `, [DIAS_BODEGA]),

    query(`SELECT COUNT(*)::int n FROM duplicado_electronica WHERE estado IN ('requiere_revision', 'error');`),

    query(`
      SELECT COUNT(*)::int n FROM pago_recurrente
      WHERE estado <> 'pagado' AND periodo = to_char(CURRENT_DATE, 'YYYY-MM');
    `),

    query(`SELECT COUNT(*)::int n FROM facturas_proveedores WHERE estado = 'PROCESADA';`),

    query(`SELECT COUNT(*)::int n, tipo FROM inventario_auditorias WHERE estado = 'en_progreso' GROUP BY tipo;`)
  ]);

  const porTipo = new Map(auditorias.rows.map(r => [r.tipo, r.n]));

  return {
    pedidosPortal: pedidos.rows[0].n,
    cuentasPorCobrar: {
      facturas: cobrar.rows[0].n,
      total: Math.round(Number(cobrar.rows[0].total) * 100) / 100,
      vencidas: cobrar.rows[0].vencidas,
      vencido: Math.round(Number(cobrar.rows[0].vencido) * 100) / 100
    },
    bodega: bodega.rows[0].n,
    duplicados: duplicados.rows[0].n,
    pagosRecurrentes: pagos.rows[0].n,
    revisionPrecios: revision.rows[0].n,
    excesos: porTipo.get('exceso') || 0,
    auditorias: [...porTipo.entries()].filter(([t]) => t !== 'exceso').reduce((s, [, n]) => s + n, 0),
    diasBodega: DIAS_BODEGA
  };
}

module.exports = { resumen };
