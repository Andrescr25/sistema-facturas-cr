/**
 * Ver una compra ya registrada y corregir el producto de una línea
 * (2026-11-05).
 *
 * El usuario: «un empleado puede cometer un error y enlazar un producto del
 * proveedor con otro producto nuestro mal; esto repercute en Reporte Clientes,
 * porque sale como que no ingresó pero fue por un error. La idea es que me
 * dejes ver esas facturas de compra ya registradas y editar algo que esté mal,
 * y ver el nombre del producto del proveedor para ver que todo esté bien».
 *
 * LO QUE MANDA ES `compra_linea.producto_id`: con él se decide si un producto
 * ingresó (missing-items/ingresoFaltante.js), qué entró al inventario y qué
 * costo se le puso al producto. «Gestionar Relaciones» corrige el mapeo y las
 * líneas del buzón, pero NO la compra ya registrada: medido el 2026-11-04, 165
 * líneas de compra decían un producto y su línea del buzón otro.
 *
 * Corregir una línea, en UNA transacción:
 * 1. Cambia el producto de la línea de la compra y de su línea del buzón.
 * 2. Con `todas`, lo mismo en las demás compras registradas del mismo código
 *    del proveedor que tenían el mismo producto equivocado, en las líneas del
 *    buzón todavía sin registrar, y en la relación: así las próximas facturas
 *    llegan bien.
 * 3. El inventario se reconcilia por compra (solo mueve la diferencia).
 * 4. El costo: a un producto se le recalcula solo si su ÚLTIMA compra era una
 *    de las líneas corregidas (es la que puso su costo al registrarse).
 * NO SE CORRIGE una línea que ya respalda la entrega de un faltante
 * (`faltante_ingreso`): esas unidades ya se le dieron a un cliente de ese
 * producto. Primero se quita esa respuesta en Reporte Clientes.
 */

const { pool } = require('../../../config/database');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido } = require('../../utils/validacion');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { calcularCostoUnitarioPropio } = require('../precios/costo');
const { sincronizarCostoDeLineas } = require('../precios/costoHistorico');
const { reconciliarDocumentoEn } = require('../inventario/inventario.service');
const { productoPropio, cambiarProductoDelMapeo, relacionarLineas } = require('../productos-revision/relacionPropia');
const { bloquearIngresos } = require('../missing-items/ingresoFaltante');
const { actualizarProductoDeLinea } = require('./compras.service');

const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La línea del buzón y su relación salen por (factura del buzón, número de línea).
const BUZON = `LEFT JOIN productos_factura_proveedor b ON b.factura_id = c.factura_proveedor_id AND b.numero_linea = cl.numero_linea
  LEFT JOIN supplier_product_mapping m ON m.id = b.mapeo_id`;
// Entregas vigentes que respalda una línea: las de facturas anuladas ya no cuentan.
const ENTREGAS = `SELECT fi.compra_linea_id, fi.cantidad, fo.numero, fo.cliente_nombre, p.nombre AS producto
  FROM faltante_ingreso fi JOIN faltantes f ON f.id = fi.faltante_id
  JOIN factura fo ON fo.id = f.factura_propia_id AND fo.estado <> 'anulada'
  LEFT JOIN producto p ON p.id = f.producto_propio_id`;

/** La compra que nació de una factura del buzón, con cada línea como la mandó el proveedor y como quedó. */
async function compraDeFactura(facturaProveedorId) {
  if (!UUID.test(String(facturaProveedorId))) throw httpError(400, 'Identificador de factura inválido.');
  const { rows: [compra] } = await pool.query(
    `SELECT c.id, c.numero_consecutivo, c.fecha_emision::text AS fecha_emision, c.total, c.estado, c.creado_en,
            pv.nombre AS proveedor, pv.identificacion AS cedula
       FROM compra c JOIN proveedor pv ON pv.id = c.proveedor_id
      WHERE c.factura_proveedor_id = $1`, [facturaProveedorId]);
  if (!compra) throw httpError(404, 'Esa factura todavía no tiene una compra registrada.');
  const { rows } = await pool.query(
    `SELECT cl.id, cl.numero_linea, cl.codigo_proveedor, cl.descripcion, cl.cantidad, cl.unidad, cl.factor_conversion,
            cl.cantidad_propia, cl.precio_unitario, cl.descuento, cl.impuesto, cl.total_linea,
            p.id AS producto_id, p.nombre AS producto_nombre, p.referencia AS producto_referencia, p.imagen_url, p.activo,
            m.id AS mapeo_id, m.producto_id AS relacion_producto_id, mp.nombre AS relacion_producto_nombre,
            b.id AS buzon_id, b.producto_id AS buzon_producto_id, bp.nombre AS buzon_producto_nombre,
            (SELECT COUNT(*)::int FROM compra_linea o JOIN compra oc ON oc.id = o.compra_id AND oc.estado = 'registrada'
               JOIN productos_factura_proveedor ob ON ob.factura_id = oc.factura_proveedor_id AND ob.numero_linea = o.numero_linea
              WHERE m.id IS NOT NULL AND ob.mapeo_id = m.id AND o.producto_id IS NOT DISTINCT FROM cl.producto_id AND o.id <> cl.id) AS otras_compras,
            (SELECT json_agg(json_build_object('factura', e.numero, 'cliente', e.cliente_nombre, 'producto', e.producto, 'cantidad', e.cantidad))
               FROM (${ENTREGAS}) e WHERE e.compra_linea_id = cl.id) AS entregas
       FROM compra_linea cl JOIN compra c ON c.id = cl.compra_id
       LEFT JOIN producto p ON p.id = cl.producto_id
       ${BUZON}
       LEFT JOIN producto mp ON mp.id = m.producto_id
       LEFT JOIN producto bp ON bp.id = b.producto_id
      WHERE c.id = $1
      ORDER BY cl.numero_linea`, [compra.id]);
  return {
    compra: { ...compra, total: num(compra.total) },
    lineas: rows.map((r) => ({
      id: r.id,
      numeroLinea: r.numero_linea,
      codigoProveedor: r.codigo_proveedor,
      descripcion: r.descripcion,
      cantidad: num(r.cantidad),
      unidad: r.unidad,
      factor: num(r.factor_conversion),
      cantidadPropia: num(r.cantidad_propia),
      costoUnitario: Math.round(calcularCostoUnitarioPropio({
        precioUnitario: r.precio_unitario, descuento: r.descuento, impuesto: r.impuesto, cantidad: r.cantidad, totalLinea: r.total_linea
      }, num(r.factor_conversion) || 1).costoUnitario * 100) / 100,
      producto: r.producto_id ? { id: r.producto_id, nombre: r.producto_nombre, referencia: r.producto_referencia, imagenUrl: r.imagen_url, activo: r.activo } : null,
      // La relación del código HOY. Si no coincide con la compra, una de las dos está mal.
      relacion: r.mapeo_id ? { productoId: r.relacion_producto_id, nombre: r.relacion_producto_nombre } : null,
      // Lo que muestra Revisión de Precios para esta línea (y de donde sale el historial de costos).
      revision: r.buzon_id ? { productoId: r.buzon_producto_id, nombre: r.buzon_producto_nombre } : null,
      otrasCompras: r.otras_compras,
      entregas: (r.entregas || []).map((e) => ({ ...e, cantidad: num(e.cantidad) }))
    }))
  };
}

// Cuántas líneas trae la lista «para revisar», como mucho.
const TOPE_PARA_REVISAR = 500;

/**
 * Las compras de mercadería (del buzón) con alguna línea que no cuadra: sin
 * producto nuestro, o con la relación del código o lo que muestra Revisión de
 * Precios distinto de lo que quedó en la compra. Los gastos (recurrentes y
 * operativos) no llevan producto a propósito y no entran. Una factura por
 * elemento, la más reciente primero.
 */
async function comprasParaRevisar() {
  const { rows } = await pool.query(
    `SELECT f.id AS factura_id, f.proveedor_nombre, f.numero_consecutivo, f.fecha_emision::date::text AS fecha, f.total_factura,
            cl.id, cl.descripcion, pc.nombre AS compra, pb.nombre AS revision, mp.nombre AS relacion,
            (cl.producto_id IS NULL) AS sin_producto,
            (m.id IS NOT NULL AND m.producto_id IS DISTINCT FROM cl.producto_id) AS relacion_distinta,
            (b.id IS NOT NULL AND b.producto_id IS DISTINCT FROM cl.producto_id) AS revision_distinta
       FROM compra c JOIN facturas_proveedores f ON f.id = c.factura_proveedor_id AND f.estado = 'ENVIADA'
       JOIN compra_linea cl ON cl.compra_id = c.id
       ${BUZON}
       LEFT JOIN producto pc ON pc.id = cl.producto_id
       LEFT JOIN producto pb ON pb.id = b.producto_id
       LEFT JOIN producto mp ON mp.id = m.producto_id
      WHERE c.estado = 'registrada'
        AND NOT EXISTS (SELECT 1 FROM gasto_operativo g WHERE g.compra_id = c.id)
        AND (cl.producto_id IS NULL
             OR (m.id IS NOT NULL AND m.producto_id IS DISTINCT FROM cl.producto_id)
             OR (b.id IS NOT NULL AND b.producto_id IS DISTINCT FROM cl.producto_id))
      ORDER BY c.creado_en DESC, cl.numero_linea
      LIMIT ${TOPE_PARA_REVISAR}`);
  const porFactura = new Map();
  for (const r of rows) {
    if (!porFactura.has(r.factura_id)) {
      porFactura.set(r.factura_id, { facturaId: r.factura_id, proveedor: r.proveedor_nombre, numero: r.numero_consecutivo,
        fecha: r.fecha, total: num(r.total_factura), lineas: [] });
    }
    porFactura.get(r.factura_id).lineas.push({
      id: r.id, descripcion: r.descripcion, compra: r.compra, revision: r.revision, relacion: r.relacion,
      motivo: r.sin_producto ? 'sin-producto' : r.relacion_distinta ? 'relacion' : 'revision'
    });
  }
  return { facturas: [...porFactura.values()], lineas: rows.length, tope: rows.length === TOPE_PARA_REVISAR };
}

/** La última línea registrada de un producto: la que le puso el costo al registrarse. */
async function ultimaCompraDe(db, productoId) {
  const { rows: [l] } = await db.query(
    `SELECT cl.* FROM compra_linea cl JOIN compra c ON c.id = cl.compra_id
      WHERE cl.producto_id = $1 AND c.estado = 'registrada'
      ORDER BY c.creado_en DESC, cl.id DESC LIMIT 1`, [productoId]);
  return l || null;
}

/**
 * La relación del código pasa a ser el producto de esta compra, que estaba
 * bien. Se llevan también las líneas del buzón que la seguían: la de las
 * compras registradas con ese mismo producto y la de las facturas todavía sin
 * registrar. Medido el 2026-11-04: en 165 líneas la compra y el buzón decían
 * productos distintos, y en las revisadas la compra era la correcta.
 */
async function corregirSoloRelacion(cliente, linea, producto, usuarioId) {
  const anterior = linea.relacion_producto_id;
  await cambiarProductoDelMapeo(linea.mapeo_id, producto, cliente);
  const { rows } = await cliente.query(
    `SELECT b.id FROM productos_factura_proveedor b JOIN facturas_proveedores f ON f.id = b.factura_id
      LEFT JOIN compra c ON c.factura_proveedor_id = f.id AND c.estado = 'registrada'
      LEFT JOIN compra_linea cl ON cl.compra_id = c.id AND cl.numero_linea = b.numero_linea
     WHERE b.mapeo_id = $1 AND b.producto_id IS DISTINCT FROM $2
       AND (cl.producto_id = $2 OR (c.id IS NULL AND f.estado <> 'ENVIADA'))`, [linea.mapeo_id, producto.id]);
  const buzonIds = rows.map((r) => r.id);
  if (buzonIds.length) await relacionarLineas({ lineaIds: buzonIds }, producto, { mapeoId: linea.mapeo_id }, cliente);
  await registrarCambio(cliente, {
    entidad: 'compra', entidadId: linea.compra_id, accion: 'editar',
    antes: { relacionProductoId: anterior }, despues: { relacionProductoId: producto.id, producto: producto.nombre, relacionCorregida: true },
    usuarioId, motivo: 'dejar la relación del código como esta compra registrada'
  });
  return { cambiadas: 0, compras: 0, relacionCorregida: true, costosActualizados: [], producto: { id: producto.id, nombre: producto.nombre }, buzonIds };
}

/**
 * Corregir el producto de una línea de compra registrada.
 * @param {{productoId: number, todas?: boolean}} datos  `todas`: también las demás compras de ese código y la relación
 */
async function corregirProducto(compraLineaId, datos = {}, usuarioId = null) {
  const lineaId = idValido(compraLineaId);
  const nuevoId = idValido(datos.productoId);
  const todas = datos.todas === true;

  const resultado = await enTransaccion(async (cliente) => {
    const { rows: [linea] } = await cliente.query(
      `SELECT cl.*, c.estado, c.factura_proveedor_id, b.id AS buzon_id, b.mapeo_id, b.producto_id AS buzon_producto_id, m.producto_id AS relacion_producto_id
         FROM compra_linea cl JOIN compra c ON c.id = cl.compra_id ${BUZON}
        WHERE cl.id = $1 FOR UPDATE OF cl`, [lineaId]);
    if (!linea) throw httpError(404, 'Esa línea de compra no existe.');
    if (linea.estado !== 'registrada') throw httpError(409, 'Esa compra no está registrada (fue anulada o devuelta): no se corrige.');
    const nuevo = await productoPropio(nuevoId, cliente);
    if (!nuevo.activo) throw httpError(409, `«${nuevo.nombre}» está dado de baja: actívelo antes de usarlo.`);
    const anteriorId = linea.producto_id;
    if (anteriorId === nuevo.id) {
      // La compra está bien y lo malo es la relación del código: con `todas`,
      // se deja la relación como esta compra (sin tocar inventario ni costo).
      const desfase = linea.relacion_producto_id !== nuevo.id || linea.buzon_producto_id !== nuevo.id;
      if (!(todas && linea.mapeo_id && desfase)) return { cambiadas: 0, producto: nuevo };
      return corregirSoloRelacion(cliente, linea, nuevo, usuarioId);
    }

    await bloquearIngresos(cliente, [anteriorId, nuevo.id].filter(Boolean));
    const anteriorUltima = anteriorId ? await ultimaCompraDe(cliente, anteriorId) : null;

    // Qué líneas: esta, o todas las registradas de ese código con el mismo producto equivocado.
    const { rows: lineas } = todas && linea.mapeo_id
      ? await cliente.query(
        `SELECT cl.id, cl.compra_id, b.id AS buzon_id FROM compra_linea cl JOIN compra c ON c.id = cl.compra_id ${BUZON}
          WHERE c.estado = 'registrada' AND b.mapeo_id = $1 AND cl.producto_id IS NOT DISTINCT FROM $2
          ORDER BY cl.id FOR UPDATE OF cl`, [linea.mapeo_id, anteriorId])
      : { rows: [{ id: linea.id, compra_id: linea.compra_id, buzon_id: linea.buzon_id }] };
    const ids = lineas.map((l) => l.id);

    const { rows: entregas } = await cliente.query(`${ENTREGAS} WHERE fi.compra_linea_id = ANY($1::int[])`, [ids]);
    if (entregas.length) {
      const cuales = entregas.slice(0, 3).map((e) => `${e.cliente_nombre || 'cliente'} (factura ${e.numero})`).join(', ');
      throw httpError(409, `Esta compra ya se usó para dar por llegado ${entregas.length === 1 ? 'un faltante' : `${entregas.length} faltantes`} de «${entregas[0].producto}»: ${cuales}${entregas.length > 3 ? '…' : ''}. ` +
        'Primero quíteles la respuesta en Reporte Clientes y después corrija el producto.');
    }

    await cliente.query('UPDATE compra_linea SET producto_id = $2 WHERE id = ANY($1::int[])', [ids, nuevo.id]);
    // La línea del buzón de cada una, con su relación (o la del código si se corrige todo).
    const mapeoId = linea.mapeo_id || null;
    const buzon = lineas.map((l) => l.buzon_id).filter(Boolean);
    let pendientes = [];
    if (todas && mapeoId) {
      await cambiarProductoDelMapeo(mapeoId, nuevo, cliente);
      // Las facturas del buzón de ese código que todavía no se registran, también.
      ({ rows: pendientes } = await cliente.query(
        `SELECT b.id FROM productos_factura_proveedor b JOIN facturas_proveedores f ON f.id = b.factura_id
          WHERE b.mapeo_id = $1 AND b.producto_id IS NOT DISTINCT FROM $2 AND f.estado <> 'ENVIADA'`, [mapeoId, anteriorId]));
    }
    const buzonIds = [...buzon, ...pendientes.map((p) => p.id)];
    if (buzonIds.length) await relacionarLineas({ lineaIds: buzonIds }, nuevo, { mapeoId }, cliente);

    const compras = [...new Set(lineas.map((l) => l.compra_id))];
    for (const compraId of compras) await reconciliarDocumentoEn(cliente, 'compra', compraId, usuarioId);

    // El costo, solo donde la compra corregida era la última del producto.
    const costos = [];
    const nuevoUltima = await ultimaCompraDe(cliente, nuevo.id);
    if (nuevoUltima && ids.includes(nuevoUltima.id)) {
      const r = await actualizarProductoDeLinea(cliente, nuevoUltima, null, { compraId: nuevoUltima.compra_id, usuarioId });
      if (r.costoActualizado) costos.push(nuevo.id);
    }
    if (anteriorUltima && ids.includes(anteriorUltima.id)) {
      const queda = await ultimaCompraDe(cliente, anteriorId);
      if (queda) {
        const r = await actualizarProductoDeLinea(cliente, queda, null, { compraId: queda.compra_id, usuarioId });
        if (r.costoActualizado) costos.push(anteriorId);
      }
    }

    for (const compraId of compras) {
      await registrarCambio(cliente, {
        entidad: 'compra', entidadId: compraId, accion: 'editar',
        antes: { productoId: anteriorId, lineas: lineas.filter((l) => l.compra_id === compraId).map((l) => l.id) },
        despues: { productoId: nuevo.id, producto: nuevo.nombre, relacionCorregida: Boolean(todas && mapeoId) },
        usuarioId, motivo: 'corregir el producto de una compra registrada'
      });
    }
    return { cambiadas: ids.length, compras: compras.length, relacionCorregida: Boolean(todas && mapeoId),
      costosActualizados: costos, producto: { id: nuevo.id, nombre: nuevo.nombre }, buzonIds };
  });

  // El historial de costos lee con Prisma, fuera de la transacción (como «Gestionar Relaciones»).
  if (resultado.buzonIds?.length) {
    await sincronizarCostoDeLineas(resultado.buzonIds).catch((e) => console.error('⚠️ No se pudo actualizar el historial de costos:', e.message));
  }
  const { buzonIds: _b, ...respuesta } = resultado;
  return respuesta;
}

module.exports = { compraDeFactura, corregirProducto, comprasParaRevisar };
