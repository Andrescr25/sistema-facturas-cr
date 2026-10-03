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
const { COBRADO, ACREDITADO } = require('../facturacion/facturaConsulta.service');
const { hoyEnCostaRica } = require('../../utils/fechaCR');

// La pantalla de Facturas en Bodega solo trae los últimos 30 días. Sin este
// mismo corte el dashboard mostraría el acumulado histórico —cientos de
// facturas viejas que nadie va a alistar— y el número no querría decir nada.
const DIAS_BODEGA = 30;

async function resumen() {
  // Una sola fecha para las tarjetas: a fin de mes, las 00:00 UTC todavía
  // son las 18:00 del día anterior en Costa Rica. Capturarla una vez evita
  // además mezclar dos días si esta lectura atraviesa la medianoche local.
  const hoy = hoyEnCostaRica();
  const periodo = hoy.slice(0, 7);
  const [pedidos, cobrar, bodega, duplicados, pagos, revision, auditorias] = await Promise.all([
    query(`SELECT COUNT(*)::int n FROM pedido_cliente WHERE estado = 'pendiente';`),

    // El saldo sale de NUESTRAS facturas, no del espejo `cuentas_por_cobrar`
    // que se copiaba de Alegra cada 30 minutos: ese se quedaba viejo entre
    // sincronizaciones y contaba como deuda lo que ya se había cobrado.
    // Se calcula —total menos cobros y notas vigentes— para que anular un
    // cobro devuelva el saldo solo, sin nada que recalcular.
    //
    // El día de corte es el de Costa Rica: en Render el servidor corre en UTC
    // y con CURRENT_DATE, pasadas las 6 de la tarde, lo que vence hoy ya
    // aparecería vencido.
    query(`
      WITH pendiente AS (
        SELECT f.fecha_vencimiento,
               f.total - ${COBRADO} - ${ACREDITADO} AS saldo
          FROM factura f
         WHERE f.estado = 'emitida'
      )
      SELECT COUNT(*)::int n,
             COALESCE(SUM(saldo), 0)::numeric total,
             COUNT(*) FILTER (WHERE fecha_vencimiento < $1::date)::int vencidas,
             COALESCE(SUM(saldo) FILTER (WHERE fecha_vencimiento < $1::date), 0)::numeric vencido
        FROM pendiente WHERE saldo > 1;
    `, [hoy]),

    // Las mismas que Bodega tiene por alistar: emitidas de la ventana, sin
    // despachar (bodegaPropia.js). Antes se contaba en la tabla vieja `facturas`.
    query(`
      SELECT COUNT(*)::int n FROM factura
      WHERE estado = 'emitida' AND estado_bodega = 'pendiente'
        AND fecha >= $1::date - $2::integer;
    `, [hoy, DIAS_BODEGA]),

    query(`SELECT COUNT(*)::int n FROM duplicado_electronica WHERE estado IN ('requiere_revision', 'error');`),

    // El módulo guarda YYYY-MM, YYYY-MM-Q1 y YYYY-MM-Q2; incluso puede
    // haber varios recibos de un gasto. El mismo prefijo de obtenerPeriodo
    // cuenta cada pago pendiente y no esconde las quincenas. Inicio solo
    // lee: abrirlo no siembra períodos ni consulta recibos externos.
    query(`
      SELECT COUNT(*)::int n FROM pago_recurrente
      WHERE estado <> 'pagado' AND periodo LIKE $1 || '%';
    `, [periodo]),

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
