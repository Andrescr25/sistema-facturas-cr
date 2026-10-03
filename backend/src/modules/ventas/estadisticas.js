/**
 * Cuánto se vende y CUÁNDO: por semana, mes y año, y en qué parte del mes,
 * de la semana y del año. Del negocio entero o de un solo producto.
 *
 * Todo sale de `venta_linea` (las líneas de las facturas propias emitidas,
 * migración independencia/034) en el momento de pedirlo, sin fotos ni
 * scripts, con el día de Costa Rica calculado en la base.
 *
 * CADA FILA TRAE UNIDADES, VENTAS Y FACTURAS; la pantalla elige cuál mirar.
 * Para el negocio entero se mira la plata: sumar unidades de productos
 * distintos (kilos de clavo con galones de pintura) no dice nada. Para un
 * producto, las unidades.
 *
 * LOS PROMEDIOS SON POR DÍA DE CALENDARIO, no por día con ventas: "el día 31
 * se vende más" no puede salir de que solo 7 meses tienen día 31. Cada día
 * del mes (o de la semana, o cada mes del año) se divide entre las veces que
 * apareció en la ventana.
 *
 * Ventas = el importe de la línea SIN IVA, con su descuento restado.
 *
 * El producto se filtra por `producto.id`, el id propio.
 */

const { query } = require('../../../config/database');
const { HOY_CR } = require('./rotacion');

const SEMANAS = 26;
const MESES = 24;

const AGREGADOS = `SUM(cantidad) AS u, SUM(importe) AS m, COUNT(DISTINCT factura_id) AS f`;

/** El filtro por producto, si lo hay, y sus parámetros. */
function deProducto(productoId) {
  if (productoId === null || productoId === undefined || productoId === '') return { donde: '', params: [] };
  const id = Number(productoId);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Producto inválido: ${productoId}`);
  return { donde: 'AND producto_id = $1', params: [id] };
}

const numero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const fila = (r, extra = {}) => ({ ...extra, unidades: numero(r.unidades), ventas: numero(r.ventas), facturas: numero(r.facturas) });

/** Las últimas 26 semanas (lunes a domingo), con las que no vendieron en cero. */
async function porSemana(productoId) {
  const { donde, params } = deProducto(productoId);
  const { rows } = await query(`
    WITH periodos AS (
      SELECT generate_series(date_trunc('week', ${HOY_CR} - INTERVAL '${SEMANAS - 1} weeks'),
                             date_trunc('week', ${HOY_CR}), INTERVAL '1 week')::date AS inicio
    ), v AS (
      SELECT date_trunc('week', fecha)::date AS inicio, ${AGREGADOS}
        FROM venta_linea
       WHERE fecha >= (SELECT MIN(inicio) FROM periodos) AND fecha <= ${HOY_CR} ${donde}
       GROUP BY 1
    )
    SELECT p.inicio::text AS inicio, COALESCE(v.u, 0) AS unidades, COALESCE(v.m, 0) AS ventas, COALESCE(v.f, 0) AS facturas
      FROM periodos p LEFT JOIN v USING (inicio) ORDER BY p.inicio`, params);
  return rows.map((r) => fila(r, { inicio: r.inicio }));
}

/** Los últimos 24 meses, con los que no vendieron en cero. */
async function porMes(productoId) {
  const { donde, params } = deProducto(productoId);
  const { rows } = await query(`
    WITH periodos AS (
      SELECT generate_series(date_trunc('month', ${HOY_CR} - INTERVAL '${MESES - 1} months'),
                             date_trunc('month', ${HOY_CR}), INTERVAL '1 month')::date AS inicio
    ), v AS (
      SELECT date_trunc('month', fecha)::date AS inicio, ${AGREGADOS}
        FROM venta_linea
       WHERE fecha >= (SELECT MIN(inicio) FROM periodos) AND fecha <= ${HOY_CR} ${donde}
       GROUP BY 1
    )
    SELECT p.inicio::text AS inicio, COALESCE(v.u, 0) AS unidades, COALESCE(v.m, 0) AS ventas, COALESCE(v.f, 0) AS facturas
      FROM periodos p LEFT JOIN v USING (inicio) ORDER BY p.inicio`, params);
  return rows.map((r) => fila(r, { inicio: r.inicio }));
}

/**
 * Cada año con ventas. Trae desde y hasta qué día hay datos: el primer año
 * empezó a mitad (junio de 2024) y el actual no terminó, y compararlos sin
 * decirlo sería injusto con los dos.
 */
async function porAnio(productoId) {
  const { donde, params } = deProducto(productoId);
  const { rows } = await query(`
    WITH cobertura AS (
      SELECT EXTRACT(YEAR FROM fecha)::int AS anio,
             MIN(fecha)::text AS desde, MAX(fecha)::text AS hasta
        FROM venta_linea WHERE fecha <= ${HOY_CR} GROUP BY 1
    ), v AS (
      SELECT EXTRACT(YEAR FROM fecha)::int AS anio, ${AGREGADOS}
        FROM venta_linea WHERE fecha <= ${HOY_CR} ${donde} GROUP BY 1
    )
    SELECT c.anio, c.desde, c.hasta, COALESCE(v.u, 0) AS unidades, COALESCE(v.m, 0) AS ventas, COALESCE(v.f, 0) AS facturas
      FROM cobertura c LEFT JOIN v USING (anio) ORDER BY c.anio`, params);
  return rows.map((r) => fila(r, { anio: r.anio, desde: r.desde, hasta: r.hasta }));
}

/**
 * Promedio por día del mes (1 al 31), en los últimos 12 meses: la venta de
 * todos los "días 15" dividida entre cuántos días 15 hubo.
 */
async function porDiaDelMes(productoId) {
  const { donde, params } = deProducto(productoId);
  const { rows } = await query(`
    WITH dias AS (
      SELECT EXTRACT(DAY FROM d)::int AS clave, COUNT(*) AS n
        FROM generate_series(${HOY_CR} - INTERVAL '12 months' + INTERVAL '1 day', ${HOY_CR}, INTERVAL '1 day') d
       GROUP BY 1
    ), v AS (
      SELECT EXTRACT(DAY FROM fecha)::int AS clave, ${AGREGADOS}
        FROM venta_linea
       WHERE fecha > ${HOY_CR} - INTERVAL '12 months' AND fecha <= ${HOY_CR} ${donde}
       GROUP BY 1
    )
    SELECT d.clave, COALESCE(v.u, 0) / d.n AS unidades, COALESCE(v.m, 0) / d.n AS ventas, COALESCE(v.f, 0)::numeric / d.n AS facturas
      FROM dias d LEFT JOIN v USING (clave) ORDER BY d.clave`, params);
  return rows.map((r) => fila(r, { dia: r.clave }));
}

/** Promedio por día de la semana (1 = lunes … 7 = domingo), últimos 12 meses. */
async function porDiaDeSemana(productoId) {
  const { donde, params } = deProducto(productoId);
  const { rows } = await query(`
    WITH dias AS (
      SELECT EXTRACT(ISODOW FROM d)::int AS clave, COUNT(*) AS n
        FROM generate_series(${HOY_CR} - INTERVAL '12 months' + INTERVAL '1 day', ${HOY_CR}, INTERVAL '1 day') d
       GROUP BY 1
    ), v AS (
      SELECT EXTRACT(ISODOW FROM fecha)::int AS clave, ${AGREGADOS}
        FROM venta_linea
       WHERE fecha > ${HOY_CR} - INTERVAL '12 months' AND fecha <= ${HOY_CR} ${donde}
       GROUP BY 1
    )
    SELECT d.clave, COALESCE(v.u, 0) / d.n AS unidades, COALESCE(v.m, 0) / d.n AS ventas, COALESCE(v.f, 0)::numeric / d.n AS facturas
      FROM dias d LEFT JOIN v USING (clave) ORDER BY d.clave`, params);
  return rows.map((r) => fila(r, { diaSemana: r.clave }));
}

/**
 * Promedio por mes del año (enero … diciembre) con TODO el historial, solo
 * meses completos: el mes en curso todavía no terminó y bajaría el promedio
 * de su mes sin razón.
 */
async function porMesDelAnio(productoId) {
  const { donde, params } = deProducto(productoId);
  const { rows } = await query(`
    WITH meses AS (
      SELECT EXTRACT(MONTH FROM m)::int AS clave, COUNT(*) AS n
        FROM generate_series(date_trunc('month', (SELECT MIN(fecha) FROM venta_linea)),
                             date_trunc('month', ${HOY_CR}) - INTERVAL '1 month', INTERVAL '1 month') m
       GROUP BY 1
    ), v AS (
      SELECT EXTRACT(MONTH FROM fecha)::int AS clave, ${AGREGADOS}
        FROM venta_linea
       WHERE fecha < date_trunc('month', ${HOY_CR}) ${donde}
       GROUP BY 1
    )
    SELECT m.clave, m.n AS veces, COALESCE(v.u, 0) / m.n AS unidades, COALESCE(v.m, 0) / m.n AS ventas, COALESCE(v.f, 0)::numeric / m.n AS facturas
      FROM meses m LEFT JOIN v USING (clave) ORDER BY m.clave`, params);
  return rows.map((r) => fila(r, { mes: r.clave, veces: Number(r.veces) }));
}

/** Todas las series juntas (en paralelo: cada viaje a la base cuesta ~500 ms). */
async function series(productoId = null) {
  const [semanas, meses, anios, diasDelMes, diasDeSemana, mesesDelAnio] = await Promise.all([
    porSemana(productoId), porMes(productoId), porAnio(productoId),
    porDiaDelMes(productoId), porDiaDeSemana(productoId), porMesDelAnio(productoId)
  ]);
  return { semanas, meses, anios, diasDelMes, diasDeSemana, mesesDelAnio };
}

module.exports = { series, porSemana, porMes, porAnio, porDiaDelMes, porDiaDeSemana, porMesDelAnio, SEMANAS, MESES };
