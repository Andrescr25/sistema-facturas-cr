/**
 * Lo que ingresó por Revisión de precios, y a cuál faltante se le entregó
 * (2026-10-25, migración 067).
 *
 * El usuario: «que el sistema sepa cuándo entra el producto del proveedor, y
 * así no dejar marcar que sí llegó desde Reporte Clientes si el sistema no ha
 * detectado que el producto ingresara a través de Revisión de precios». Medido
 * antes en producción (45 días): 83 de 674 «Llegó todo» no tenían ninguna
 * compra del producto detrás.
 *
 * INGRESÓ = una compra REGISTRADA con una línea de ese producto, registrada
 * después de anotarse el faltante. Cuenta en unidades propias
 * (`cantidad_propia` ya trae el factor del proveedor). Una compra anulada o
 * devuelta deja de contar.
 *
 * SE REPARTE (decisión del usuario): lo que se le entregó a un cliente no
 * sirve para el faltante de otro. Se toma de la compra más vieja a la más
 * nueva. Lo de una factura anulada vuelve a quedar libre.
 */
const { httpError } = require('../../utils/validacion');

// Bodega anota el faltante cuando alista, y la compra de esa mañana puede
// haberse registrado un rato antes: en el análisis, 12 horas cubrían los
// casos reales sin traer compras de otro pedido.
const TOLERANCIA = "interval '12 hours'";

// Una sola cola por producto (migración 067): dos faltantes del mismo
// producto no se reparten la misma unidad al mismo tiempo.
const CANDADO = 67001;

/**
 * Las líneas de compra que pueden respaldar al faltante del alias `f`, con
 * lo que les queda libre para él (lo suyo no se descuenta: se vuelve a repartir).
 */
const lineasPara = (f) => `
  SELECT cl.id, co.id AS compra_id, co.numero_consecutivo, co.creado_en,
         GREATEST(cl.cantidad_propia - COALESCE((
           SELECT SUM(fi.cantidad) FROM faltante_ingreso fi
             JOIN faltantes otro ON otro.id = fi.faltante_id
             JOIN factura fo ON fo.id = otro.factura_propia_id
            WHERE fi.compra_linea_id = cl.id AND fi.faltante_id <> ${f}.id AND fo.estado <> 'anulada'), 0), 0) AS libre
    FROM compra_linea cl
    JOIN compra co ON co.id = cl.compra_id
   WHERE cl.producto_id = ${f}.producto_propio_id
     AND co.estado = 'registrada'
     AND co.creado_en >= COALESCE(${f}.created_at, '-infinity'::timestamp) - ${TOLERANCIA}
     AND cl.cantidad_propia > 0`;

/** Cuánto ingresó que este faltante puede usar, como columna de una consulta sobre `faltantes ${f}`. */
const ingresoDisponibleSql = (f) => `(SELECT COALESCE(SUM(l.libre), 0) FROM (${lineasPara(f)}) l)`;

const redondear = (n) => Math.round(Number(n) * 1000) / 1000;

/** Suelta lo que el faltante tenía asignado: «No llegó» o quitar la respuesta. */
async function soltarIngreso(db, faltanteId) {
  await db.query('DELETE FROM faltante_ingreso WHERE faltante_id = $1', [faltanteId]);
}

/**
 * Le asigna `cantidad` unidades de lo que ingresó, o lanza un 409 que dice
 * cuánto hay. Reemplaza lo que tuviera antes. Corre en la transacción de
 * quien guarda la respuesta, que ya bloqueó la factura y el faltante.
 */
async function asignarIngreso(db, faltante, cantidad, usuarioId = null) {
  await db.query('SELECT pg_advisory_xact_lock($1, $2)', [CANDADO, faltante.producto_propio_id]);
  await soltarIngreso(db, faltante.id);
  if (!(cantidad > 0)) return [];

  const { rows: lineas } = await db.query(
    `SELECT l.* FROM faltantes f, LATERAL (${lineasPara('f')}) l WHERE f.id = $1 ORDER BY l.creado_en, l.id`,
    [faltante.id]
  );
  const tomadas = [];
  let resta = cantidad;
  for (const l of lineas) {
    const toma = redondear(Math.min(resta, Number(l.libre)));
    if (toma <= 0) continue;
    tomadas.push({ compraLineaId: l.id, cantidad: toma });
    resta = redondear(resta - toma);
    if (resta <= 0) break;
  }
  if (resta > 0) {
    const hay = redondear(cantidad - resta);
    throw httpError(409, hay > 0
      ? `Solo ingresaron ${hay} de este producto por Revisión de precios; faltan ${resta} para marcar ${cantidad}.`
      : 'Este producto todavía no ingresa por Revisión de precios. Registre la compra (o cargue la factura a mano) antes de marcar que llegó.');
  }
  for (const t of tomadas) {
    await db.query(
      'INSERT INTO faltante_ingreso (faltante_id, compra_linea_id, cantidad, usuario_id) VALUES ($1, $2, $3, $4)',
      [faltante.id, t.compraLineaId, t.cantidad, usuarioId]
    );
  }
  return tomadas;
}

/**
 * Lo asignado a cada faltante que todavía respaldan compras registradas. Al
 * mandar a Impresión: una compra pudo anularse después de marcar.
 * @returns {Promise<Map<number, number>>} faltante_id → unidades respaldadas
 */
async function ingresoRespaldado(db, faltanteIds) {
  if (!faltanteIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT fi.faltante_id, SUM(fi.cantidad) AS cantidad
       FROM faltante_ingreso fi
       JOIN compra_linea cl ON cl.id = fi.compra_linea_id
       JOIN compra co ON co.id = cl.compra_id AND co.estado = 'registrada'
      WHERE fi.faltante_id = ANY($1::int[])
      GROUP BY fi.faltante_id`,
    [faltanteIds]
  );
  return new Map(rows.map((r) => [r.faltante_id, Number(r.cantidad)]));
}

module.exports = { ingresoDisponibleSql, asignarIngreso, soltarIngreso, ingresoRespaldado };
