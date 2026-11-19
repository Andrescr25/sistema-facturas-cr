/**
 * Facturas en Bodega corrige el inventario (2026-11-19). El usuario: «quiero
 * que facturas en bodega corrija inventario con los negativos: si marcan que
 * algo no hay físico pero en sistema sí, entonces que ponga la cantidad
 * negativa y se vaya acumulando conforme los clientes». Su ejemplo: sistema 4,
 * físico 0; el cliente A pide 6 → −6; el B pide 3 → −9; y si el domingo no
 * ingresó por Revisión de Precios, vuelve a 0.
 *
 * LA REGLA. La existencia del kardex es lo que hay en el estante menos lo que
 * se les debe a los clientes (lo facturado que Bodega no despachó y que
 * todavía no se resolvió). Cada marca de Bodega es una pequeña auditoría de
 * ese producto:
 *   · Faltó todo o Parcial: el estante quedó vacío → existencia = −deuda.
 *   · Completo: había por lo menos lo pedido → existencia ≥ −deuda. Solo sube
 *     un negativo de más; un positivo no se toca (no se sabe cuántas quedaron).
 * La vuelta a 0 no se fuerza: la compra que ingresa por Revisión de Precios
 * suma, y lo que no llegó lo devuelve Impresión al rebajar la factura.
 *
 * CUÁNDO. Solo si la marca de ese producto es nueva o cambió. Volver a guardar
 * el despacho (se mandan todos los productos) no repite el ajuste: lo marcado
 * ya pasó, y recalcularlo hoy borraría las compras que entraron después. Si
 * cambió, se descuenta lo que esta factura ya había ajustado y se calcula de
 * nuevo con lo de hoy.
 *
 * QUEDA ANOTADO en `despacho_bodega_inventario` (migración 080): quién marcó,
 * qué decía el sistema, cuánto se debía y cuánto se ajustó. En el kardex, un
 * movimiento `ajuste_bodega` con la factura en sus observaciones.
 */
const inv = require('../inventario/inventario.service');
const { cantidadPendiente } = require('../reports/faltantesCompra.sql');
const { SIN_CREDITO_TOTAL } = require('../facturacion/saldo.sql');
const { productoConNotaSql } = require('../facturacion/candadosFactura');

const MARCAS = { completo: 'Completo', total: 'Faltó todo', parcial: 'Parcial' };
const redondear = (n) => Math.round(Number(n) * 10000) / 10000 || 0;

/** La marca efectiva: sin unidades faltantes es Completo, diga lo que diga el tipo. */
function marcaDe(tipo, cantidadFaltante) {
  if (tipo === 'completo' || !(Number(cantidadFaltante) > 0)) return 'completo';
  return tipo === 'total' ? 'total' : 'parcial';
}
/** Marca y unidades en una sola clave, para saber si cambió. */
const claveDe = (marca, cantidad) => (marca === 'completo' ? 'completo' : `${marca}:${redondear(cantidad)}`);

/** En cuánto deja la existencia una marca. Pura, para probarla. */
function existenciaFinal({ marca, existenciaSistema, deuda }) {
  const piso = redondear(-deuda);
  return marca === 'completo' ? Math.max(redondear(existenciaSistema), piso) : piso;
}

/** Lo que se les debe a los clientes de un producto: lo que faltó y sigue
 * pendiente, menos lo que ya llegó para ellos. No cuenta la factura anulada,
 * la acreditada entera ni el producto con nota de crédito en esa factura. */
async function deudaEn(db, productoId) {
  const { rows: [r] } = await db.query(`
    SELECT COALESCE(SUM(${cantidadPendiente('f')}), 0) AS deuda
      FROM faltantes f JOIN factura fa ON fa.id = f.factura_propia_id
     WHERE f.producto_propio_id = $1 AND f.estado = 'pendiente' AND f.tipo_faltante <> 'completo'
       AND f.cantidad_faltante > 0 AND fa.estado = 'emitida'
       AND ${SIN_CREDITO_TOTAL.replace(/\bf\./g, 'fa.')}
       AND NOT ${productoConNotaSql('fa.id', 'f.producto_propio_id')}`, [productoId]);
  return redondear(r.deuda);
}

/** Por producto, la marca de antes (la primera vez que aparece) y la de ahora (la última). */
function cambiosDe(detectados) {
  const porProducto = new Map();
  for (const d of detectados) {
    const previo = porProducto.get(d.productoId);
    porProducto.set(d.productoId, {
      productoId: d.productoId,
      antes: previo ? previo.antes : (d.existia ? claveDe(marcaDe(d.tipoAnterior, d.cantidadAnterior), d.cantidadAnterior) : null),
      marca: marcaDe(d.tipo, d.cantidadFaltante),
      cantidadFaltante: redondear(d.cantidadFaltante)
    });
  }
  return [...porProducto.values()]
    .filter((c) => c.antes !== claveDe(c.marca, c.cantidadFaltante))
    .sort((a, b) => a.productoId - b.productoId);
}

/**
 * Después de guardar las marcas (`guardarFaltantes`), en la misma
 * transacción. `detectados` trae, por producto, la marca anterior y la nueva.
 */
async function auditarDespachoEn(db, facturaId, detectados, usuarioId = null) {
  const cambios = cambiosDe(detectados);
  if (!cambios.length) return [];
  await inv.bloquear(db);
  const { rows: [factura] } = await db.query('SELECT numero FROM factura WHERE id = $1', [facturaId]);
  const hechos = [];
  for (const c of cambios) {
    const { rows: [p] } = await db.query(`
      SELECT p.id, p.inventariable, p.costo_con_iva, s.existencia, s.costo_promedio
        FROM producto p JOIN inventario_saldo s ON s.producto_id = p.id WHERE p.id = $1`, [c.productoId]);
    if (!p?.inventariable) continue;
    const { rows: [previo] } = await db.query(
      'SELECT * FROM despacho_bodega_inventario WHERE factura_id = $1 AND producto_id = $2 FOR UPDATE', [facturaId, p.id]);
    const existencia = redondear(p.existencia);
    const existenciaSistema = redondear(existencia - Number(previo?.ajuste || 0));
    const deuda = await deudaEn(db, p.id);
    const final = existenciaFinal({ marca: c.marca, existenciaSistema, deuda });
    const movimiento = redondear(final - existencia);
    // Un Completo que no mueve nada y nunca movió no deja fila: es lo de siempre.
    if (!previo && movimiento === 0 && c.marca === 'completo') continue;

    const { rows: [linea] } = await db.query(
      'SELECT COALESCE(SUM(cantidad), 0) AS cantidad FROM factura_linea WHERE factura_id = $1 AND producto_id = $2', [facturaId, p.id]);
    const valores = [facturaId, p.id, c.marca, redondear(linea.cantidad), c.marca === 'completo' ? 0 : c.cantidadFaltante,
      existenciaSistema, deuda, final, redondear(final - existenciaSistema), usuarioId];
    const { rows: [registro] } = await db.query(previo ? `
      UPDATE despacho_bodega_inventario SET marca = $3, cantidad_pedida = $4, cantidad_faltante = $5,
             existencia_sistema = $6, deuda_clientes = $7, existencia_final = $8, ajuste = $9, usuario_id = $10,
             version = version + 1, actualizado_en = CURRENT_TIMESTAMP
       WHERE factura_id = $1 AND producto_id = $2 RETURNING *` : `
      INSERT INTO despacho_bodega_inventario (factura_id, producto_id, marca, cantidad_pedida, cantidad_faltante,
             existencia_sistema, deuda_clientes, existencia_final, ajuste, usuario_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, valores);

    if (movimiento !== 0) {
      await inv.registrarEn(db, {
        productoId: p.id, tipo: 'ajuste_bodega', cantidad: movimiento.toFixed(4),
        costoUnitario: p.costo_promedio ?? p.costo_con_iva ?? null,
        origenTipo: 'despacho_bodega', origenId: registro.id,
        clave: `bodega:${facturaId}:${p.id}:${registro.version}`, usuarioId,
        observaciones: `Bodega · factura ${factura.numero}: ${MARCAS[c.marca]} ` +
          `(pidió ${Number(registro.cantidad_pedida)}, faltaron ${Number(registro.cantidad_faltante)}). ` +
          `Se les debía ${deuda} a los clientes; el sistema decía ${existenciaSistema}.`
      });
    }
    hechos.push({ productoId: p.id, marca: c.marca, existenciaSistema, deuda, existenciaFinal: final, movimiento });
  }
  return hechos;
}

module.exports = { auditarDespachoEn, existenciaFinal, marcaDe, cambiosDe };
