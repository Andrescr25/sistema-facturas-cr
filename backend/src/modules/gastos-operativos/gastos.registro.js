const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, texto } = require('../../utils/validacion');
const { registrarSinInventario } = require('../compras/registrarSinInventario');
const { liberarCuentaPorPagar, crearCuentaDeContado } = require('../compras/liberarCuentaPorPagar');
const { analizarOriginal, cedula } = require('./gastos.originales');
const { uuid, categoria } = require('./gastos.validacion');

async function proveedorEn(db, f, usuarioId) {
  const proveedores = (await db.query(`SELECT * FROM proveedor WHERE
    ltrim(regexp_replace(identificacion, '[[:space:]-]', '', 'g'), '0')=$1 FOR UPDATE`, [cedula(f.proveedor_cedula)])).rows;
  if (proveedores.length > 1) throw httpError(409, 'Hay varias fichas con esa identificación tributaria. Revisá el proveedor antes de clasificar.');
  let proveedor = proveedores[0];
  if (!proveedor) {
    proveedor = (await db.query(
      `INSERT INTO proveedor (nombre, identificacion) VALUES ($1,$2)
       ON CONFLICT (identificacion) WHERE identificacion IS NOT NULL
       DO UPDATE SET identificacion=EXCLUDED.identificacion RETURNING *`,
      [f.proveedor_nombre.trim(), f.proveedor_cedula]
    )).rows[0];
    await registrarCambio(db, { entidad: 'proveedor', entidadId: proveedor.id, accion: 'crear', despues: proveedor, usuarioId,
      motivo: 'Proveedor identificado en el XML de un gasto operativo' });
  }
  return proveedor;
}

/** Buzón bloqueado por quien llama: idempotente, sin red, catálogo ni pagos. */
async function crearGastoEn(db, f, datos, usuarioId = null, recibida = null) {
  const cat = categoria(datos.categoria);
  const existente = (await db.query('SELECT id FROM gasto_operativo WHERE factura_id=$1', [f.id])).rows[0];
  if (existente) return { id: existente.id, existente: true };
  if ((await db.query('SELECT id FROM compra WHERE factura_proveedor_id=$1', [f.id])).rows.length) {
    throw httpError(409, 'La factura ya está registrada como compra. No se reclasifica por aquí porque podría haber movido inventario o tener una respuesta fiscal.');
  }
  if (f.estado === 'GASTO_RECURRENTE' && f.tratamiento === 'comercial') {
    throw httpError(409, 'Esta factura ya se gestiona en Pagos Recurrentes. No se registra en dos módulos.');
  }
  const proveedor = await proveedorEn(db, f, usuarioId);
  const original = await analizarOriginal(db, f, recibida);
  const descripcion = texto(2000)(datos.descripcion ?? null, 'Descripción') ||
    (cat === 'combustible' ? 'Combustible' : 'Alimentación y viáticos');
  const gasto = (await db.query(
    `INSERT INTO gasto_operativo (factura_id, categoria, descripcion, originales,
       validacion, motivo_validacion, iva_maximo)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING *`,
    [f.id, cat, descripcion, JSON.stringify(original.originales), original.validacion, original.motivo, original.ivaMaximo]
  )).rows[0];
  await db.query("UPDATE facturas_proveedores SET tratamiento=$2, estado='GASTO_RECURRENTE' WHERE id=$1", [f.id, cat]);
  // El vínculo al catálogo en esta factura deja de tener efecto. No se toca el
  // mapeo del proveedor: puede seguir vendiendo mercadería (proveedor mixto).
  await db.query(`UPDATE productos_factura_proveedor SET producto_id=NULL, mapeo_id=NULL,
    alegra_item_id=NULL, confianza=NULL, estado_relacionado='PENDIENTE' WHERE factura_id=$1`, [f.id]);
  if (original.validacion === 'validado') {
    const compra = await registrarSinInventario(db, f, proveedor.id, usuarioId);
    await db.query('UPDATE gasto_operativo SET compra_id=$2 WHERE id=$1', [gasto.id, compra.id]);
    gasto.compra_id = compra.id;
    const cuenta = await liberarCuentaPorPagar(db, f.id, compra.id);
    if (!cuenta) await crearCuentaDeContado(db, f, compra);
    await registrarCambio(db, { entidad: 'compra', entidadId: compra.id, accion: 'crear', despues: compra, usuarioId,
      motivo: 'Gasto operativo: sin inventario ni aceptación automática' });
  }
  await registrarCambio(db, { entidad: 'gasto_operativo', entidadId: gasto.id, accion: 'crear',
    despues: { ...gasto, originales: undefined }, usuarioId, motivo: 'Clasificación documental; no es un pago ni una aceptación fiscal' });
  if (datos.guardarPreferencia === true) {
    await db.query('UPDATE proveedor SET tratamiento_facturas=$2, actualizado_en=CURRENT_TIMESTAMP WHERE id=$1', [proveedor.id, cat]);
    await registrarCambio(db, { entidad: 'proveedor', entidadId: proveedor.id, accion: 'editar',
      antes: { tratamiento_facturas: proveedor.tratamiento_facturas }, despues: { tratamiento_facturas: cat }, usuarioId,
      motivo: 'Preferencia explícita desde una factura de gasto' });
  }
  return { id: gasto.id, validacion: original.validacion, compraId: gasto.compra_id };
}

async function desdeFactura(facturaId, datos, usuarioId) {
  const id = uuid(facturaId);
  return enTransaccion(pool, async (db) => {
    const f = (await db.query('SELECT * FROM facturas_proveedores WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!f) throw httpError(404, 'No existe esa factura.');
    return crearGastoEn(db, f, datos, usuarioId);
  });
}

module.exports = { crearGastoEn, desdeFactura };
