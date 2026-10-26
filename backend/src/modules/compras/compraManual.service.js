/**
 * Factura de compra cargada a mano en Revisión de precios (2026-10-25).
 *
 * Para lo que llega sin factura electrónica. El usuario: «hay que crear algo
 * en revisión de precios para meter una factura de compra a mano». Desde ese
 * día Reporte Clientes solo deja marcar que llegó lo que ingresó por una
 * compra (missing-items/ingresoFaltante.js), y 23 de los productos marcados
 * en los 45 días previos venían de proveedores que no mandan factura
 * electrónica (café, tornillos…).
 *
 * Es la misma compra que Registrar compra, en una sola transacción: entra al
 * inventario, actualiza el costo y deja su cuenta por pagar. Lo que no tiene:
 * clave ni XML de Hacienda (no hay nada que aceptar) ni fila del buzón
 * (`factura_proveedor_id` NULL). La migración 067 impide cargar dos veces el
 * mismo número del mismo proveedor.
 *
 * Cada línea se carga como dice el papel: cuántas unidades nuestras y cuánto
 * costó cada una CON IVA. El IVA sale de la tarifa del producto, nunca de un
 * 13 % fijo.
 */
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { AHORA_CR_SQL, hoyEnCostaRica, sumarDias } = require('../../utils/fechaCR');
const { httpError, texto, numero, opcion, idValido } = require('../../utils/validacion');
const { reconciliarDocumentoEn } = require('../inventario/inventario.service');
const { actualizarProductoDeLinea } = require('./compras.service');
const { crearCuentaDeContado, crearCuentaACredito } = require('./liberarCuentaPorPagar');

const MAX_LINEAS = 100;
const dosDecimales = (n) => Math.round(n * 100) / 100;

/** Lo que manda la pantalla, revisado. Pura: `hoy` es el día en Costa Rica. */
function validarCompraManual(datos, hoy) {
  const d = datos || {};
  const proveedorId = idValido(d.proveedorId);
  const numeroFactura = texto(30)(d.numero, 'Número de la factura');
  if (!numeroFactura) throw httpError(400, 'Falta el número de la factura del proveedor.');
  const fecha = String(d.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || sumarDias(fecha, 0) !== fecha) {
    throw httpError(400, 'La fecha de la factura no es válida.');
  }
  if (fecha > hoy) throw httpError(400, 'La fecha de la factura no puede ser después de hoy.');
  const condicion = opcion(['contado', 'credito'])(d.condicion, 'Condición');
  const plazoDias = condicion === 'credito' ? numero({ min: 1, max: 365, entero: true })(d.plazoDias ?? null, 'Plazo') : 0;
  if (condicion === 'credito' && !plazoDias) throw httpError(400, 'Falta el plazo del crédito, en días.');
  if (!Array.isArray(d.lineas) || d.lineas.length === 0) throw httpError(400, 'La factura no tiene ninguna línea.');
  if (d.lineas.length > MAX_LINEAS) throw httpError(400, `Hasta ${MAX_LINEAS} líneas por factura.`);
  const lineas = d.lineas.map((l, i) => {
    const n = `Línea ${i + 1}`;
    const cantidad = numero({ min: 0.001, max: 1e6 })(l?.cantidad ?? null, `${n}, cantidad`);
    const costoConIva = numero({ min: 0, max: 1e9 })(l?.costoConIva ?? null, `${n}, costo con IVA`);
    if (cantidad === null || costoConIva === null) throw httpError(400, `${n}: faltan la cantidad o el costo.`);
    return { productoId: idValido(l.productoId), cantidad, costoConIva };
  });
  return { proveedorId, numero: numeroFactura, fecha, condicion, plazoDias, lineas };
}

/**
 * Los montos de una línea en la forma de `compra_linea` (precio sin IVA,
 * impuesto aparte), con la tarifa del producto. Pura.
 */
function montosDeLinea({ cantidad, costoConIva }, tarifa) {
  const total = dosDecimales(cantidad * costoConIva);
  const impuesto = dosDecimales(total - total / (1 + tarifa / 100));
  return {
    cantidad,
    precio_unitario: Math.round(((total - impuesto) / cantidad) * 100000) / 100000,
    descuento: 0,
    impuesto,
    total_linea: total
  };
}

async function registrarCompraManual(datos, usuarioId = null) {
  const d = validarCompraManual(datos, hoyEnCostaRica());
  return enTransaccion(pool, async (db) => {
    const { rows: [proveedor] } = await db.query(
      'SELECT id, nombre, identificacion FROM proveedor WHERE id = $1 AND activo', [d.proveedorId]
    );
    if (!proveedor) throw httpError(404, 'Ese proveedor no existe o está inactivo.');

    const repetida = (await db.query(
      `SELECT id FROM compra WHERE proveedor_id = $1 AND factura_proveedor_id IS NULL AND estado <> 'anulada'
          AND lower(btrim(numero_consecutivo)) = lower(btrim($2))`, [proveedor.id, d.numero]
    )).rows[0];
    if (repetida) throw httpError(409, `La factura ${d.numero} de ${proveedor.nombre} ya está cargada (compra ${repetida.id}).`);

    const { rows: productos } = await db.query(
      `SELECT p.id, p.nombre, p.unidad, p.cabys, i.tarifa
         FROM producto p LEFT JOIN impuesto i ON i.id = p.impuesto_id
        WHERE p.id = ANY($1::int[]) AND p.activo`,
      [[...new Set(d.lineas.map((l) => l.productoId))]]
    );
    const porId = new Map(productos.map((p) => [p.id, p]));
    const lineas = d.lineas.map((l, i) => {
      const p = porId.get(l.productoId);
      if (!p) throw httpError(404, `La línea ${i + 1} tiene un producto que no existe o está inactivo.`);
      if (p.tarifa == null) throw httpError(422, `${p.nombre} no tiene el IVA configurado: corregilo en el producto antes de cargar la factura.`);
      return { ...montosDeLinea(l, Number(p.tarifa)), numero_linea: i + 1, producto_id: p.id, descripcion: p.nombre,
        unidad: p.unidad, codigo_cabys: p.cabys ? String(p.cabys).trim() : null, factor_conversion: 1 };
    });
    const total = dosDecimales(lineas.reduce((s, l) => s + l.total_linea, 0));
    const vencimiento = d.condicion === 'credito' ? sumarDias(d.fecha, d.plazoDias) : d.fecha;

    let compra;
    try {
      compra = (await db.query(
        `INSERT INTO compra (proveedor_id, numero_consecutivo, fecha_emision, fecha_vencimiento, moneda, total,
           estado, registrada_por, observaciones, creado_en)
         VALUES ($1,$2,$3,$4,'CRC',$5,'registrada',$6,'Cargada a mano en Revisión de precios',${AHORA_CR_SQL})
         RETURNING *`,
        [proveedor.id, d.numero, d.fecha, vencimiento, total, usuarioId]
      )).rows[0];
    } catch (e) {
      // Dos cargas a la vez del mismo papel: la segunda choca con el índice de la 067.
      if (e.code === '23505') throw httpError(409, `La factura ${d.numero} de ${proveedor.nombre} ya está cargada.`);
      throw e;
    }
    await registrarCambio(db, { entidad: 'compra', entidadId: compra.id, accion: 'crear', despues: compra, usuarioId,
      motivo: 'Factura de compra cargada a mano en Revisión de precios' });

    for (const l of lineas) {
      await db.query(
        `INSERT INTO compra_linea (compra_id, numero_linea, producto_id, descripcion, codigo_cabys,
           cantidad, unidad, factor_conversion, precio_unitario, descuento, impuesto, total_linea)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,0,$9,$10)`,
        [compra.id, l.numero_linea, l.producto_id, l.descripcion, l.codigo_cabys, l.cantidad, l.unidad,
          l.precio_unitario, l.impuesto, l.total_linea]
      );
    }
    await reconciliarDocumentoEn(db, 'compra', compra.id, usuarioId);

    let costosActualizados = 0;
    for (const l of lineas) {
      const r = await actualizarProductoDeLinea(db, l, null, { compraId: compra.id, usuarioId });
      if (r.costoActualizado) costosActualizados++;
    }

    const papel = { id: null, proveedor_nombre: proveedor.nombre, proveedor_cedula: proveedor.identificacion || '', numero_consecutivo: d.numero };
    if (d.condicion === 'credito') await crearCuentaACredito(db, papel, compra, d.plazoDias);
    else await crearCuentaDeContado(db, papel, compra);

    return { compra: { id: compra.id, numero: d.numero, total, proveedor: proveedor.nombre }, lineas: lineas.length, costosActualizados };
  });
}

/** Los proveedores a los que se les puede cargar una factura: la lista de la ficha. */
async function proveedoresActivos() {
  const { rows } = await pool.query(
    'SELECT id, nombre, identificacion FROM proveedor WHERE activo ORDER BY lower(nombre)'
  );
  return rows;
}

module.exports = { validarCompraManual, montosDeLinea, registrarCompraManual, proveedoresActivos };
