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
// Un producto con menos de esto se promedia como si llevara un mes: dos días
// de ventas no dicen cuánto se vende al mes.
const DIAS_MINIMOS = 30;

const HOY_CR = `(now() AT TIME ZONE 'America/Costa_Rica')::date`;

/**
 * Una fila por producto vendido en los últimos `meses`. Se usa como
 * subconsulta: `LEFT JOIN (${SQL_ROTACION}) r ON r.producto_id = p.id`.
 *
 * `unidades_mes` es el PROMEDIO por mes de la ventana: lo vendido entre los
 * meses que tiene (3 meses son entre 89 y 92 días, se cuentan los reales).
 *
 * CON `porVida` (2026-11-11, pedido del usuario: «que la medida de la rotación
 * no sea por mes sino los últimos 3 meses, y si el producto es nuevo y tiene
 * apenas mes y medio, que saque la estadística con eso»): si el producto
 * empezó DENTRO de la ventana, se promedia sobre los días que lleva, nunca
 * menos de `DIAS_MINIMOS`. Empezó = su primera venta o su primera compra
 * registrada, la que sea antes: `producto.creado_en` es el día de la
 * migración para casi todos y no dice nada. `dias_rotacion` son los días
 * promediados y `rotacion_nueva` dice si fueron menos que la ventana.
 *
 * El Pareto (A/B/C) acumula ese promedio: sin `porVida` ordena igual que las
 * unidades de la ventana (todas se dividen entre lo mismo).
 */
function sqlRotacion(meses = VENTANA_MESES, { porVida = false } = {}) {
  const n = Number(meses);
  if (!Number.isInteger(n) || n < 1 || n > 36) throw new Error(`Ventana de rotación inválida: ${meses}`);
  const inicio = `(${HOY_CR} - INTERVAL '${n} months')::date`;
  // Los días de la ventana: después de `inicio` y hasta hoy, incluido.
  const ventana = `(${HOY_CR} - ${inicio})`;
  const dias = porVida ? `LEAST(${ventana}, GREATEST(${DIAS_MINIMOS}, ${HOY_CR} - i.desde + 1))` : ventana;
  const inicioDelProducto = porVida ? `
            LEFT JOIN (
              SELECT producto_id, MIN(desde) AS desde FROM (
                SELECT producto_id, MIN(fecha) AS desde FROM venta_linea WHERE producto_id IS NOT NULL GROUP BY producto_id
                UNION ALL
                SELECT l.producto_id, MIN(c.fecha_emision)::date FROM compra_linea l JOIN compra c ON c.id = l.compra_id
                 WHERE c.estado = 'registrada' AND l.producto_id IS NOT NULL GROUP BY l.producto_id
              ) primeras GROUP BY producto_id
            ) i ON i.producto_id = vl.producto_id` : '';
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
         ROUND(v.mensual, 2) AS unidades_mes,
         ROUND(v.unidades / (v.dias / 7.0), 2) AS unidades_semana,
         v.dias AS dias_rotacion,
         v.dias < ${ventana} AS rotacion_nueva,
         CASE
           WHEN v.mensual = 0 THEN 'C'
           WHEN (v.acumulado - v.mensual) < ${CORTE_A} * v.total THEN 'A'
           WHEN (v.acumulado - v.mensual) < ${CORTE_B} * v.total THEN 'B'
           ELSE 'C'
         END AS clase
    FROM (
      SELECT a.*,
             SUM(a.mensual) OVER (ORDER BY a.mensual DESC, a.producto_id
                                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS acumulado,
             SUM(a.mensual) OVER () AS total
        FROM (
          SELECT vl.producto_id,
                 SUM(vl.cantidad) AS unidades,
                 -- Lo vendido SIN IVA, con el descuento de la línea ya restado.
                 SUM(vl.importe) AS ventas,
                 COUNT(DISTINCT vl.factura_id) AS facturas,
                 COUNT(DISTINCT vl.cliente_id) AS clientes_distintos,
                 MAX(vl.fecha) AS ultima_venta,
                 ${dias} AS dias,
                 SUM(vl.cantidad) / (${n} * ${dias} / ${ventana}::numeric) AS mensual
            FROM venta_linea vl${inicioDelProducto}
           WHERE vl.fecha > ${inicio}
             AND vl.fecha <= ${HOY_CR}
             AND vl.producto_id IS NOT NULL
           GROUP BY vl.producto_id${porVida ? ', i.desde' : ''}
          HAVING SUM(vl.cantidad) > 0
        ) a
    ) v
    JOIN producto pr ON pr.id = v.producto_id`;
}

/**
 * LA rotación de la pantalla: Gestión de Catálogo (y su filtro de rotación
 * baja), Rentabilidad y su Excel, y las clases A/B del catálogo del agente.
 * Promedio por mes de los últimos 3 meses, o de lo que lleva si es nuevo.
 *
 * Reemplaza a «los últimos 30 días» (2026-10-14), que se había elegido por un
 * producto nuevo agotado en menos de un mes (GEL BOMBILLO LED: 43 + 31
 * vendidas, que entre 3 meses daban 16): `porVida` resuelve ese caso sin
 * perder la ventana de 3 meses.
 */
const SQL_ROTACION = sqlRotacion(VENTANA_MESES, { porVida: true });

/**
 * La del MOTOR DE PRECIOS (Revisión de Precios): 12 meses, sin `porVida`. Sus
 * umbrales —10 u/mes es "rota alto", 3 clientes o menos es "exclusivo"— se
 * calibraron con promedios de un año; cambiarle la cuenta subiría o bajaría
 * sugerencias sin que nadie lo decidiera. Misma cuenta, su propia ventana.
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
    diasRotacion: Number(r.dias_rotacion),
    rotacionNueva: Boolean(r.rotacion_nueva),
    facturas: Number(r.facturas),
    clientesDistintos: Number(r.clientes_distintos),
    ultimaVenta: r.ultima_venta
  };
}

/** La rotación de todos los productos vendidos en la ventana, por `producto.id`. */
async function rotacionPorProducto() {
  const { rows } = await query(SQL_ROTACION);
  return new Map(rows.map((r) => [Number(r.producto_id), aFila(r)]));
}

/**
 * Solo los ids de A y de B: lo que usa el catálogo de "Cliente nuevo".
 *
 * Por producto.id, también los creados solo en el sistema.
 */
async function clasesAB() {
  const { rows } = await query(`SELECT producto_id, clase FROM (${SQL_ROTACION}) r WHERE clase IN ('A', 'B') ORDER BY unidades_mes DESC, producto_id`);
  const clases = { A: [], B: [] };
  for (const r of rows) clases[r.clase].push(String(r.producto_id));
  return clases;
}

module.exports = { SQL_ROTACION, SQL_ROTACION_PRECIOS, sqlRotacion, HOY_CR, VENTANA_MESES, DIAS_MINIMOS, CORTE_A, CORTE_B, rotacionPorProducto, clasesAB, aFila };
