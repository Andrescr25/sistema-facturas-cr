const { createHash } = require('node:crypto');
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido, uuidValido, texto } = require('../../utils/validacion');
const { diaEnCostaRica } = require('../../utils/fechaCR');
const { registrarCambio } = require('../../utils/bitacora');
const { registrarPagoEn } = require('../pagos-proveedores/pagosProveedor.service');
const { obtener } = require('./gastos.service');

function solicitud(datos) {
  if (!['aprobar', 'rechazar'].includes(datos.accion)) throw httpError(400, 'Elegí aprobar o rechazar.');
  const s = {
    accion: datos.accion,
    metodoPagoId: datos.accion === 'aprobar' ? idValido(datos.metodoPagoId) : null,
    referencia: datos.accion === 'aprobar' ? texto(60)(datos.referencia || null, 'Referencia') : null,
    motivo: datos.accion === 'rechazar' ? texto(160)(datos.motivo || null, 'Motivo') || 'Gasto no aprobado por el receptor.' : null
  };
  const clave = uuidValido(datos.claveIdempotencia);
  return { ...s, clave, huella: createHash('sha256').update(JSON.stringify(s)).digest('hex') };
}

/** Compromiso local único. La red fiscal corre DESPUÉS y no vuelve a pagar. */
async function decidir(id, datos = {}, usuarioId) {
  const n = idValido(id), s = solicitud(datos);
  const resultado = await enTransaccion(pool, async db => {
    if (s.accion === 'aprobar') await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 61002))', [s.clave]);
    // Hacienda/edición toman compra antes que gasto: conservar ese orden.
    const compra = (await db.query('SELECT compra_id FROM gasto_operativo WHERE id=$1', [n])).rows[0]?.compra_id;
    if (compra) await db.query('SELECT id FROM compra WHERE id=$1 FOR UPDATE', [compra]);
    const g = (await db.query(`SELECT g.*,f.total_factura,f.moneda,f.fecha_emision
      FROM gasto_operativo g JOIN facturas_proveedores f ON f.id=g.factura_id
      WHERE g.id=$1 FOR UPDATE OF g`, [n])).rows[0];
    if (!g) throw httpError(404, 'No existe ese gasto.');
    const decision = s.accion === 'aprobar' ? 'aprobado' : 'rechazado';
    if (g.decision !== 'pendiente') {
      if (g.decision !== decision || (g.decision_huella && g.decision_huella !== s.huella)) {
        throw httpError(409, 'Este gasto ya tiene otra decisión registrada. Actualizá la lista.');
      }
      return { existente: true, decision: g.decision, compraId: g.compra_id };
    }
    if (datos.version !== g.version) throw httpError(409, 'El gasto cambió. Actualizá la factura antes de decidir.');
    if ((await db.query("SELECT id FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1 LIMIT 1", [g.compra_id])).rows.length) {
      throw httpError(409, 'Esta factura ya tiene una respuesta fiscal preparada. Revisala desde Gastos operativos.');
    }
    const cuenta = (await db.query('SELECT id FROM cuentas_por_pagar WHERE factura_id=$1 FOR UPDATE', [g.factura_id])).rows[0];
    let pago = null, fiscal;
    if (s.accion === 'aprobar') {
      if (g.validacion !== 'validado' || !g.compra_id) throw httpError(409, g.motivo_validacion || 'Validá el XML original antes de aprobar.');
      if (g.moneda !== 'CRC') throw httpError(409, 'Este comprobante necesita conversión a colones antes de registrar el pago.');
      fiscal = await revisionAutomatica(db, g);
      if (Number(g.total_factura) > 0) {
        if (!cuenta) throw httpError(409, 'No se encontró la cuenta de este comprobante.');
        const saldo = (await db.query('SELECT saldo FROM cuenta_por_pagar_saldo WHERE id=$1', [cuenta.id])).rows[0];
        if (Number(saldo.saldo) > 0) pago = await registrarPagoEn(db, {
          metodoPagoId: s.metodoPagoId, referencia: s.referencia, claveIdempotencia: s.clave,
          fecha: diaEnCostaRica(g.fecha_emision), aplicaciones: [{ cuentaPorPagarId: cuenta.id, pagarTodo: true }],
          observaciones: 'Pago de contado confirmado al aprobar el gasto operativo.'
        // El usuario pide sólo el medio para estos gastos de contado. No
        // inventar una referencia bancaria ni relajar la API general de pagos.
        }, usuarioId, undefined, { referenciaOpcional: true });
      }
    } else {
      if (cuenta) {
        const saldo = (await db.query('SELECT pagado,pagado_sin_detalle,credito FROM cuenta_por_pagar_saldo WHERE id=$1', [cuenta.id])).rows[0];
        if (Number(saldo.pagado) > 0 || Number(saldo.pagado_sin_detalle) > 0 || Number(saldo.credito) > 0) {
          throw httpError(409, 'La factura tiene pagos o notas aplicadas. Revisala antes de rechazarla.');
        }
        await db.query('UPDATE cuentas_por_pagar SET liberada=FALSE WHERE id=$1', [cuenta.id]);
      }
      if (g.compra_id) await db.query("UPDATE compra SET estado='anulada' WHERE id=$1", [g.compra_id]);
      fiscal = { renta: 'no_deducible', iva: 'sin_credito', credito: 0, gasto: 0, respuesta: '3', condicion: '04', motivo: s.motivo, revisada: true };
    }
    await db.query(`UPDATE gasto_operativo SET decision=$2,decidido_en=CURRENT_TIMESTAMP,decidido_por=$3::integer,
      pago_aprobacion_id=$4,decision_huella=$5,condicion_iva_confirmada=$6,
      renta=$7,iva=$8,iva_credito=$9,gasto_deducible=$10,respuesta=$11,motivo_fiscal=$12,
      revisado_en=CASE WHEN $13::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,revisado_por=CASE WHEN $13::boolean THEN $3::integer ELSE NULL END,
      version=version+1,actualizado_en=CURRENT_TIMESTAMP WHERE id=$1`,
    [n, decision, usuarioId, pago?.id || null, s.huella, fiscal.condicion,
      fiscal.renta, fiscal.iva, fiscal.credito, fiscal.gasto, fiscal.respuesta, fiscal.motivo, fiscal.revisada]);
    await registrarCambio(db, { entidad: 'gasto_operativo', entidadId: n, accion: s.accion,
      antes: { decision: g.decision }, despues: { decision, pagoId: pago?.id || null, metodoPagoId: s.metodoPagoId, condicion: fiscal.condicion },
      usuarioId, motivo: fiscal.motivo });
    return { decision, compraId: g.compra_id, pagoId: pago?.id || null };
  });
  const hacienda = await responderPendiente(resultado.compraId, usuarioId);
  return { ...resultado, gasto: await obtener(n), hacienda };
}

async function responderPendiente(compraId, usuarioId) {
  if (!compraId) return { estado: 'pendiente', motivo: 'El XML requiere validación para comunicar el rechazo a Hacienda.' };
  try {
    return { estado: 'enviada', comprobante: await require('../../integrations/hacienda/rutas').responderCompra(compraId, usuarioId) };
  } catch (e) {
    return { estado: 'pendiente', motivo: e.status ? e.message : 'El registro está conservado; la respuesta a Hacienda sigue pendiente.' };
  }
}

// La política de IVA se confirma una vez para el negocio; nunca sale del
// medio de pago ni se confunde el impuesto único de combustible con IVA.
async function revisionAutomatica(db, g) {
  const c = (await db.query("SELECT datos FROM hacienda_configuracion WHERE ambiente='produccion'")).rows[0];
  const condicion = c?.datos?.condicion_iva_compras;
  if (!['01', '04', '05'].includes(condicion)) throw httpError(409, 'Elegí una vez la condición de IVA en Configuración → Hacienda → Aceptación de compras.');
  const provisional = condicion === '05';
  const credito = condicion === '01' ? Number(g.iva_maximo) : 0;
  return { condicion, credito, gasto: provisional ? 0 : Math.max(0, Number(g.total_factura) - credito),
    renta: provisional ? 'pendiente' : 'deducible', iva: provisional ? 'pendiente' : credito > 0 ? 'total' : 'sin_credito',
    respuesta: '1', revisada: !provisional,
    motivo: 'Gasto de la actividad aprobado por el receptor; pago de contado confirmado.' };
}

module.exports = { decidir, responderPendiente };
