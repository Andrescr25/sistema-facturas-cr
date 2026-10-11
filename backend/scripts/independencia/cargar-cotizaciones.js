/**
 * Copia las cotizaciones de Alegra a la base propia (migración 029).
 *
 * LEE de Alegra (solo GET) y ESCRIBE en la base local. Se puede correr las
 * veces que haga falta: actualiza por `alegra_id` y reemplaza las líneas.
 * Hasta el corte, Alegra es la fuente: si una cotización copiada se editó en
 * la rama, volver a correr esto la deja como está en Alegra.
 *
 * LO QUE NO ES OBVIO
 *
 * 1. El precio de cada línea es el COTIZADO (el de Alegra), no el del maestro
 *    de hoy, y la tarifa la que llevaba la línea. Es lo que el cliente vio.
 *
 * 2. Una cotización facturada en Alegra se enlaza a su factura copiada por el
 *    "Cotización N" que el sistema escribe en las observaciones de la venta.
 *    Si no aparece, queda facturada "en Alegra" (`facturada_en` sin
 *    `factura_id`): se sabe que se vendió, no con cuál factura.
 *
 * 3. Si una cotización ya se facturó en la rama, recargarla no le borra la
 *    factura propia.
 *
 * 4. Al final, la serie sigue desde la mayor copiada: si en `main` se
 *    siguieron haciendo cotizaciones en Alegra, la próxima propia no repite
 *    número.
 *
 * Uso:  node scripts/independencia/cargar-cotizaciones.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('./lib/lectura-alegra');

const alegra = getClient();
const PAGINA = 30;   // el tope de /estimates

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;

async function todasLasCotizaciones() {
  const todas = [];
  for (let start = 0; ; start += PAGINA) {
    const pagina = await alegra.request('GET', '/estimates', {
      start, limit: PAGINA, order_field: 'id', order_direction: 'ASC'
    });
    if (!Array.isArray(pagina) || pagina.length === 0) break;
    todas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return todas;
}

async function mapas() {
  const [clientes, productos, impuestos] = await Promise.all([
    pool.query('SELECT id, alegra_id, nombre, identificacion FROM cliente WHERE alegra_id IS NOT NULL'),
    pool.query(`SELECT p.id, p.alegra_id, p.impuesto_id, i.tarifa
                  FROM producto p LEFT JOIN impuesto i ON i.id = p.impuesto_id
                 WHERE p.alegra_id IS NOT NULL`),
    pool.query('SELECT id, tarifa FROM impuesto WHERE activo ORDER BY id')
  ]);
  const impuestoPorTarifa = new Map();
  for (const i of impuestos.rows) {
    const t = Number(i.tarifa);
    if (!impuestoPorTarifa.has(t)) impuestoPorTarifa.set(t, i.id);
  }
  return {
    cliente: new Map(clientes.rows.map((c) => [String(c.alegra_id), c])),
    producto: new Map(productos.rows.map((p) => [String(p.alegra_id), p])),
    impuestoPorTarifa
  };
}

/** Las líneas con los montos calculados como los calcula la factura. */
function lineasDe(e, m, avisos) {
  return (e.items || []).map((item, i) => {
    const producto = m.producto.get(String(item.id));
    if (!producto) avisos.push(`cotización ${e.id}: "${item.name}" (item ${item.id}) no está en el catálogo propio`);

    const cantidad = Number(item.quantity) || 0;
    const precio = Number(item.price) || 0;
    const descuento = Number(item.discount) || 0;
    const tarifa = (item.tax || []).reduce((s, t) => s + (Number(t.percentage) || 0), 0);

    const bruto = cantidad * precio;
    const descuentoMonto = dinero((bruto * descuento) / 100);
    const base = dinero(bruto - descuentoMonto);
    const impuestoMonto = dinero((base * tarifa) / 100);

    // La tarifa del producto si es la misma que se cotizó; si no, la primera
    // del catálogo con esa tarifa. Lo que manda es lo que se cotizó.
    const impuestoId = producto && Number(producto.tarifa) === tarifa
      ? producto.impuesto_id
      : m.impuestoPorTarifa.get(tarifa) || null;

    return {
      numero_linea: i + 1,
      producto_id: producto?.id || null,
      nombre: String(item.name || 'Sin nombre').slice(0, 250),
      referencia: item.reference ? String(item.reference).slice(0, 100) : null,
      cantidad,
      precio_unitario: precio,
      descuento_porcentaje: descuento,
      descuento_monto: descuentoMonto,
      impuesto_id: impuestoId,
      tarifa,
      impuesto_monto: impuestoMonto,
      total: dinero(base + impuestoMonto),
      alegra_item_id: String(item.id),
      base
    };
  });
}

const COLUMNAS_LINEA = [
  'cotizacion_id', 'numero_linea', 'producto_id', 'nombre', 'referencia', 'cantidad', 'precio_unitario',
  'descuento_porcentaje', 'descuento_monto', 'impuesto_id', 'tarifa', 'impuesto_monto', 'total', 'alegra_item_id'
];

async function guardar(e, m, avisos) {
  const cliente = m.cliente.get(String(e.client?.id));
  if (!cliente) {
    avisos.push(`cotización ${e.id} (N° ${e.number}): el cliente ${e.client?.id} "${e.client?.name}" no está en la base propia — no se copió`);
    return 'omitida';
  }

  const consecutivo = Number(e.number);
  if (!Number.isInteger(consecutivo) || consecutivo <= 0) {
    avisos.push(`cotización ${e.id}: número "${e.number}" no es un entero — no se copió`);
    return 'omitida';
  }
  const numero = String(e.numberTemplate?.fullNumber || e.number);

  const lineas = lineasDe(e, m, avisos);
  const subtotal = dinero(lineas.reduce((s, l) => s + l.base, 0));
  const descuento = dinero(lineas.reduce((s, l) => s + l.descuento_monto, 0));
  const impuesto = dinero(lineas.reduce((s, l) => s + l.impuesto_monto, 0));
  const total = dinero(subtotal + impuesto);
  if (Math.abs(total - Number(e.total)) > 1) {
    avisos.push(`cotización ${e.id} (N° ${numero}): el total calculado ₡${total} no es el de Alegra ₡${e.total}`);
  }

  const cx = await pool.connect();
  try {
    await cx.query('BEGIN');

    // El mismo número en otra fila: una propia de prueba hecha en la rama
    // antes de recargar. No se pisa; se avisa.
    const choque = await cx.query(
      'SELECT id FROM cotizacion WHERE consecutivo = $1 AND alegra_id IS DISTINCT FROM $2',
      [consecutivo, String(e.id)]
    );
    if (choque.rows.length > 0) {
      await cx.query('ROLLBACK');
      avisos.push(`cotización ${e.id}: el número ${numero} ya lo tiene la cotización propia ${choque.rows[0].id} — no se copió`);
      return 'omitida';
    }

    let facturaId = null;
    const facturada = e.status !== 'unbilled';
    if (facturada) {
      const f = await cx.query(
        `SELECT id FROM factura
          WHERE cliente_id = $1 AND observaciones ILIKE $2
          ORDER BY id DESC LIMIT 1`,
        [cliente.id, `Cotización ${numero}%`]
      );
      facturaId = f.rows[0]?.id || null;
    }

    const { rows } = await cx.query(
      `INSERT INTO cotizacion (consecutivo, numero, fecha, vence, cliente_id, cliente_nombre, cliente_identificacion,
                               observaciones, subtotal, descuento, impuesto, total, factura_id, facturada_en, alegra_id)
       VALUES ($1, $2, $3, GREATEST($3::date, $4::date), $5, $6, $7, $8, $9, $10, $11, $12, $13,
               CASE WHEN $14 THEN CURRENT_TIMESTAMP END, $15)
       ON CONFLICT (alegra_id) DO UPDATE SET
         consecutivo = EXCLUDED.consecutivo, numero = EXCLUDED.numero, fecha = EXCLUDED.fecha,
         vence = EXCLUDED.vence, cliente_id = EXCLUDED.cliente_id, cliente_nombre = EXCLUDED.cliente_nombre,
         cliente_identificacion = EXCLUDED.cliente_identificacion, observaciones = EXCLUDED.observaciones,
         subtotal = EXCLUDED.subtotal, descuento = EXCLUDED.descuento, impuesto = EXCLUDED.impuesto,
         total = EXCLUDED.total,
         -- La factura propia que se le haya hecho en la rama no se pierde.
         factura_id = COALESCE(cotizacion.factura_id, EXCLUDED.factura_id),
         facturada_en = COALESCE(cotizacion.facturada_en, EXCLUDED.facturada_en),
         actualizado_en = CURRENT_TIMESTAMP
       RETURNING id, (xmax = 0) AS nueva`,
      [
        consecutivo, numero, e.date, e.dueDate || e.date, cliente.id, cliente.nombre, cliente.identificacion,
        e.observations || null, subtotal, descuento, impuesto, total, facturaId, facturada, String(e.id)
      ]
    );
    const id = rows[0].id;

    await cx.query('DELETE FROM cotizacion_linea WHERE cotizacion_id = $1', [id]);
    for (const l of lineas) {
      await cx.query(
        `INSERT INTO cotizacion_linea (${COLUMNAS_LINEA.join(', ')})
         VALUES (${COLUMNAS_LINEA.map((_, i) => `$${i + 1}`).join(', ')})`,
        COLUMNAS_LINEA.map((c) => (c === 'cotizacion_id' ? id : l[c]))
      );
    }

    await cx.query('COMMIT');
    if (facturada && !facturaId) avisos.push(`cotización ${e.id} (N° ${numero}): facturada en Alegra, sin factura copiada que la nombre`);
    return rows[0].nueva ? 'nueva' : 'actualizada';
  } catch (error) {
    await cx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cx.release();
  }
}

async function principal() {
  const [cotizaciones, m] = await Promise.all([todasLasCotizaciones(), mapas()]);
  console.log(`Alegra devolvió ${cotizaciones.length} cotización(es).`);

  const avisos = [];
  const cuenta = { nueva: 0, actualizada: 0, omitida: 0 };
  for (const e of cotizaciones) cuenta[await guardar(e, m, avisos)]++;

  const serie = await pool.query(
    `UPDATE serie_consecutivo
        SET siguiente = GREATEST(siguiente, (SELECT COALESCE(MAX(consecutivo), 0) + 1 FROM cotizacion))
      WHERE tipo_documento = 'cotizacion' AND NOT electronica
      RETURNING siguiente`
  );

  console.log(`Nuevas: ${cuenta.nueva} · actualizadas: ${cuenta.actualizada} · omitidas: ${cuenta.omitida}`);
  console.log(`La próxima cotización propia será la ${serie.rows[0]?.siguiente ?? '(sin serie: falta la migración 029)'}.`);
  if (avisos.length) {
    console.log(`\n${avisos.length} aviso(s):`);
    avisos.forEach((a) => console.log(`  · ${a}`));
  }
}

principal()
  .catch((e) => { console.error('Falló la carga de cotizaciones:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
