/**
 * La rotación de cada producto, calculada EN EL MOMENTO desde las ventas.
 *
 * Reemplaza a `producto_rotacion`, que era una foto sacada a mano con
 * scripts/calcular-rotacion.js (la última, del 10 de agosto de 2026) y
 * clasificaba por PLATA facturada. Decisión del usuario (2026-09-25):
 *
 *   · la rotación es por UNIDADES: la cantidad de cada factura, sumada;
 *   · la ventana son los ÚLTIMOS 3 MESES, que es lo que se vende ahora;
 *   · se calcula en cada consulta, sin script ni foto.
 *
 * CLASES A, B Y C (Pareto por unidades): se ordenan los productos de más a
 * menos unidades vendidas y se van acumulando. A = los que juntos hacen el
 * 80 % de las unidades, B = hasta el 95 %, C = el resto. El producto que
 * cruza el corte queda en la clase de arriba (se mira lo acumulado ANTES de
 * sumarlo): así el más vendido es siempre A, aunque solo él pase del 80 %.
 * Lo que no se vendió en la ventana no aparece acá; quien lo lea lo trata
 * como C con cero unidades.
 *
 * El día es el de COSTA RICA, calculado en la base: la sesión puede estar en
 * otra zona, y después de las 6 p.m. "hoy" en UTC ya es mañana.
 *
 * Las ventas salen de `venta_linea` (migración independencia/034): las líneas
 * de las facturas propias EMITIDAS, sin sincronizar nada. Antes salían de
 * `venta_historico`, una copia que se repasaba cada hora contra Alegra.
 *
 * LA IDENTIDAD ES `producto_id`, el id propio. Cada fila trae además
 * `alegra_item_id` (el `producto.alegra_id`, vacío en un producto creado acá)
 * para el costo derivado de Rentabilidad y el motor de precios, pendientes
 * de migrar. El catálogo del agente ya usa producto_id.
 */

const { query } = require('../../../config/database');

const VENTANA_MESES = 3;
const CORTE_A = 0.8;
const CORTE_B = 0.95;

const HOY_CR = `(now() AT TIME ZONE 'America/Costa_Rica')::date`;

/**
 * Una fila por producto vendido en los últimos `meses`. Se usa como
 * subconsulta: `LEFT JOIN (${SQL_ROTACION}) r ON r.producto_id = p.id`.
 *
 * unidades_semana divide entre las semanas REALES de la ventana (3 meses
 * son entre 89 y 92 días), no entre 13 fijas.
 * Con promedioMesesCompletos, sólo unidades_mes usa los meses calendario
 * cerrados anteriores. Los demás campos conservan la ventana móvil.
 */
function sqlRotacion(meses = VENTANA_MESES, { promedioMesesCompletos = false } = {}) {
  const n = Number(meses);
  if (!Number.isInteger(n) || n < 1 || n > 36) throw new Error(`Ventana de rotación inválida: ${meses}`);
  const inicio = `(${HOY_CR} - INTERVAL '${n} months')::date`;
  const mesActual = `date_trunc('month', ${HOY_CR})::date`;
  const inicioPromedio = `(${mesActual} - INTERVAL '${n} months')::date`;
  // Rentabilidad pide meses cerrados para el promedio mensual. Leer desde
  // su inicio permite contar también un mes sin ventas como cero, sin mover
  // la ventana vigente de totales, semanas, clientes ni Pareto.
  const filtroVigente = promedioMesesCompletos ? ` FILTER (WHERE fecha > ${inicio})` : '';
  const suma = (columna) => promedioMesesCompletos
    ? `COALESCE(SUM(${columna})${filtroVigente}, 0)` : `SUM(${columna})`;
  const cantidad = suma('cantidad');
  const promedio = promedioMesesCompletos ? 'v.unidades_meses_completos' : 'v.unidades';
  return `
  SELECT v.producto_id,
         pr.alegra_id AS alegra_item_id,
         v.unidades,
         v.ventas,
         v.facturas,
         v.clientes_distintos,
         -- Como texto: un DATE llega a Node como medianoche LOCAL y, en JSON,
         -- cambia de día según la zona del servidor.
         v.ultima_venta::text AS ultima_venta,
         ROUND(${promedio} / ${n}.0, 2) AS unidades_mes,
         ROUND(v.unidades / ((${HOY_CR} - ${inicio}) / 7.0), 2) AS unidades_semana,
         CASE
           WHEN v.unidades = 0 THEN 'C'
           WHEN (v.acumulado - v.unidades) < ${CORTE_A} * v.total THEN 'A'
           WHEN (v.acumulado - v.unidades) < ${CORTE_B} * v.total THEN 'B'
           ELSE 'C'
         END AS clase
    FROM (
      SELECT producto_id,
             ${cantidad} AS unidades,
             ${promedioMesesCompletos ? `COALESCE(SUM(cantidad) FILTER (WHERE fecha < ${mesActual}), 0) AS unidades_meses_completos,` : ''}
             -- Lo vendido SIN IVA, con el descuento de la línea ya restado.
             ${suma('importe')} AS ventas,
             COUNT(DISTINCT factura_id)${filtroVigente} AS facturas,
             COUNT(DISTINCT cliente_id)${filtroVigente} AS clientes_distintos,
             MAX(fecha)${filtroVigente} AS ultima_venta,
             SUM(${cantidad}) OVER (ORDER BY ${cantidad} DESC, producto_id
                                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado,
             SUM(${cantidad}) OVER () AS total
        FROM venta_linea
       WHERE fecha ${promedioMesesCompletos ? `>= ${inicioPromedio}` : `> ${inicio}`}
         AND fecha <= ${HOY_CR}
         AND producto_id IS NOT NULL
       GROUP BY producto_id
      HAVING SUM(cantidad) > 0
    ) v
    JOIN producto pr ON pr.id = v.producto_id`;
}

/** La rotación de la pantalla y del catálogo del agente: los últimos 3 meses. */
const SQL_ROTACION = sqlRotacion(VENTANA_MESES);

/**
 * La del MOTOR DE PRECIOS (Revisión de Precios): 12 meses. Sus umbrales —10
 * u/mes es "rota alto", 3 clientes o menos es "exclusivo"— se calibraron con
 * promedios de un año; con 3 meses muchos más productos parecerían
 * exclusivos y las sugerencias subirían sin que nadie lo decidiera. Misma
 * cuenta, en el momento, con su propia ventana.
 */
const SQL_ROTACION_PRECIOS = sqlRotacion(12);

function aFila(r) {
  return {
    productoId: Number(r.producto_id),
    alegraItemId: r.alegra_item_id === null || r.alegra_item_id === undefined ? null : String(r.alegra_item_id),
    clase: r.clase,
    unidades: Number(r.unidades),
    ventas: Number(r.ventas),
    unidadesMes: Number(r.unidades_mes),
    unidadesSemana: Number(r.unidades_semana),
    facturas: Number(r.facturas),
    clientesDistintos: Number(r.clientes_distintos),
    ultimaVenta: r.ultima_venta
  };
}

/** La rotación de todos los productos vendidos en la ventana, por `producto.id`. */
async function rotacionPorProducto({ promedioMesesCompletos = false } = {}) {
  const sql = promedioMesesCompletos ? sqlRotacion(VENTANA_MESES, { promedioMesesCompletos }) : SQL_ROTACION;
  const { rows } = await query(sql);
  return new Map(rows.map((r) => [Number(r.producto_id), aFila(r)]));
}

/**
 * Solo los ids de A y de B: lo que usa el catálogo de "Cliente nuevo".
 *
 * Por producto.id, también los creados solo en el sistema.
 */
async function clasesAB() {
  const { rows } = await query(`SELECT producto_id, clase FROM (${SQL_ROTACION}) r WHERE clase IN ('A', 'B') ORDER BY unidades DESC, producto_id`);
  const clases = { A: [], B: [] };
  for (const r of rows) clases[r.clase].push(String(r.producto_id));
  return clases;
}

module.exports = { SQL_ROTACION, SQL_ROTACION_PRECIOS, sqlRotacion, HOY_CR, VENTANA_MESES, CORTE_A, CORTE_B, rotacionPorProducto, clasesAB, aFila };
