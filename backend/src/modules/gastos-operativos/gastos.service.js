const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { registrarCambio } = require('../../utils/bitacora');
const { httpError, idValido, texto } = require('../../utils/validacion');
const { pagosDeCuentas, registrarPago } = require('../pagos-proveedores/pagosProveedor.service');
const { analizarOriginal, cedula } = require('./gastos.originales');
const { registrarSinInventario } = require('../compras/registrarSinInventario');
const { liberarCuentaPorPagar, crearCuentaDeContado } = require('../compras/liberarCuentaPorPagar');
const { categoria, revisionFiscal } = require('./gastos.validacion');

const SELECT = `SELECT g.id, g.factura_id, g.compra_id, g.categoria, g.descripcion,
  g.empleado, g.placa, g.validacion, g.motivo_validacion, g.iva_maximo,
  g.renta, g.gasto_deducible, g.iva, g.iva_credito, g.respuesta, g.motivo_fiscal,
  g.revisado_en, g.version, g.creado_en,
  f.proveedor_nombre, f.proveedor_cedula, f.numero_consecutivo, f.clave,
  f.fecha_emision, f.moneda, f.total_factura,
  (f.xml_ruta IS NOT NULL) AS tiene_xml, (f.pdf_ruta IS NOT NULL) AS tiene_pdf,
  cp.id AS cuenta_id, s.saldo, s.pagado, s.estado AS estado_pago,
  h.estado AS estado_hacienda, (h.id IS NOT NULL) AS fiscal_reservada
 FROM gasto_operativo g JOIN facturas_proveedores f ON f.id=g.factura_id
 LEFT JOIN cuentas_por_pagar cp ON cp.factura_id=f.id
 LEFT JOIN cuenta_por_pagar_saldo s ON s.id=cp.id
 LEFT JOIN LATERAL (SELECT id, estado FROM hacienda_comprobante
   WHERE origen='compra' AND origen_id=g.compra_id AND ambiente='produccion'
   ORDER BY revision_documento DESC LIMIT 1) h ON TRUE`;

async function listar({ buscar = '', categoria: cat = '', revision = '', pagina = 1 } = {}) {
  const pag = Math.max(1, Math.min(100000, Number.parseInt(pagina, 10) || 1));
  const params = [];
  const where = [];
  if (cat) { params.push(categoria(cat)); where.push(`g.categoria=$${params.length}`); }
  if (buscar) {
    params.push(`%${String(buscar).trim().slice(0, 160)}%`);
    where.push(`(f.proveedor_nombre || ' ' || f.numero_consecutivo || ' ' || COALESCE(g.empleado,'') || ' ' || COALESCE(g.placa,'')) ILIKE $${params.length}`);
  }
  if (revision === 'pendiente') where.push('g.revisado_en IS NULL');
  else if (revision && revision !== 'todos') throw httpError(400, 'Filtro de revisión inválido.');
  const filtro = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  params.push((pag - 1) * 30);
  const { rows } = await pool.query(
    `${SELECT.replace('SELECT g.id', 'SELECT COUNT(*) OVER()::int AS total, g.id')}${filtro}
     ORDER BY g.creado_en DESC, g.id DESC LIMIT 30 OFFSET $${params.length}`, params
  );
  return { gastos: rows.map(({ total, ...g }) => g), pagina: pag, total: rows[0]?.total || 0 };
}

async function obtener(id, db = pool) {
  const n = idValido(id);
  const g = (await db.query(`${SELECT} WHERE g.id=$1`, [n])).rows[0];
  if (!g) throw httpError(404, 'No existe ese gasto.');
  const originales = (await db.query('SELECT originales FROM gasto_operativo WHERE id=$1', [n])).rows[0].originales;
  const historial = (await db.query(
    `SELECT b.id, b.accion, b.cambios, b.motivo, b.creado_en, u.nombre AS usuario
       FROM bitacora_cambio b LEFT JOIN usuario u ON u.id=b.usuario_id
      WHERE b.entidad='gasto_operativo' AND b.entidad_id=$1 ORDER BY b.id DESC LIMIT 30`, [String(n)]
  )).rows;
  const pagos = g.cuenta_id ? (await pagosDeCuentas([g.cuenta_id])).get(g.cuenta_id) || [] : [];
  return { ...g, originales, historial, pagos };
}

async function editar(id, datos = {}, usuarioId) {
  const n = idValido(id);
  await enTransaccion(pool, async (db) => {
    // Mismo orden que Hacienda: compra primero, gasto después.
    const compraId = (await db.query('SELECT compra_id FROM gasto_operativo WHERE id=$1', [n])).rows[0]?.compra_id;
    if (compraId) await db.query('SELECT id FROM compra WHERE id=$1 FOR UPDATE', [compraId]);
    const g = (await db.query(`SELECT g.*, f.total_factura FROM gasto_operativo g
      JOIN facturas_proveedores f ON f.id=g.factura_id WHERE g.id=$1 FOR UPDATE OF g`, [n])).rows[0];
    if (!g) throw httpError(404, 'No existe ese gasto.');
    if (datos.version !== g.version) throw httpError(409, 'Otra persona modificó el gasto. Actualizá la ficha antes de guardar.');
    const cambios = {};
    for (const [campo, max] of [['descripcion', 2000], ['empleado', 160], ['placa', 30]]) {
      if (datos[campo] !== undefined) cambios[campo] = texto(max)(datos[campo], campo);
    }
    if (cambios.descripcion === null) throw httpError(400, 'La descripción es obligatoria.');
    const motivo = texto(500)(datos.motivo ?? null, 'Motivo');
    if (datos.categoria !== undefined && datos.categoria !== g.categoria) {
      cambios.categoria = categoria(datos.categoria);
      if (!motivo) throw httpError(400, 'Indicá por qué reclasificás el gasto.');
    }
    if (datos.fiscal !== undefined) {
      const { completo, ...fiscal } = revisionFiscal(datos.fiscal, g);
      Object.assign(cambios, fiscal, { revisado_en: completo ? new Date() : null, revisado_por: completo ? usuarioId : null });
    }
    if (!Object.keys(cambios).length) return;
    if ('categoria' in cambios || datos.fiscal !== undefined) {
      if ((await db.query("SELECT id FROM hacienda_comprobante WHERE origen='compra' AND origen_id=$1 LIMIT 1", [g.compra_id])).rows.length) {
        throw httpError(409, 'La respuesta fiscal ya está preparada. Conservá la clasificación y los importes declarados.');
      }
    }
    const campos = Object.keys(cambios);
    const despues = (await db.query(
      `UPDATE gasto_operativo SET ${campos.map((k, i) => `${k}=$${i + 2}`).join(', ')},
       version=version+1, actualizado_en=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
      [n, ...campos.map(k => cambios[k])]
    )).rows[0];
    if (cambios.categoria) await db.query('UPDATE facturas_proveedores SET tratamiento=$2 WHERE id=$1', [g.factura_id, cambios.categoria]);
    const { originales: _a, total_factura: _t, ...antes } = g;
    const { originales: _d, ...final } = despues;
    await registrarCambio(db, { entidad: 'gasto_operativo', entidadId: n, accion: 'editar', antes, despues: final, usuarioId, motivo });
  });
  return obtener(n);
}

/** Reintenta validación local, nunca envía a Hacienda ni toca inventario. */
async function revalidar(id, usuarioId) {
  const n = idValido(id);
  await enTransaccion(pool, async (db) => {
    const f = (await db.query(`SELECT f.* FROM facturas_proveedores f JOIN gasto_operativo g
      ON g.factura_id=f.id WHERE g.id=$1 FOR UPDATE OF f`, [n])).rows[0];
    if (!f) throw httpError(404, 'No existe ese gasto.');
    const g = (await db.query('SELECT * FROM gasto_operativo WHERE id=$1 FOR UPDATE', [n])).rows[0];
    if (g.compra_id) return;
    const a = await analizarOriginal(db, f);
    let compra = null;
    if (a.validacion === 'validado') {
      const proveedor = (await db.query(`SELECT id FROM proveedor WHERE
        ltrim(regexp_replace(identificacion, '[[:space:]-]', '', 'g'), '0')=$1`, [cedula(f.proveedor_cedula)])).rows[0];
      if (!proveedor) throw httpError(409, 'Falta la ficha del proveedor.');
      compra = await registrarSinInventario(db, f, proveedor.id, usuarioId);
      const cuenta = await liberarCuentaPorPagar(db, f.id, compra.id);
      if (!cuenta) await crearCuentaDeContado(db, f, compra);
    }
    await db.query(`UPDATE gasto_operativo SET compra_id=$2, originales=$3::jsonb, validacion=$4,
      motivo_validacion=$5, iva_maximo=$6, version=version+1, actualizado_en=CURRENT_TIMESTAMP WHERE id=$1`,
    [n, compra?.id || null, JSON.stringify(a.originales), a.validacion, a.motivo, a.ivaMaximo]);
    await registrarCambio(db, { entidad: 'gasto_operativo', entidadId: n, accion: 'revalidar',
      despues: { validacion: a.validacion, compraId: compra?.id }, usuarioId });
  });
  return obtener(n);
}

async function pagar(id, datos, usuarioId) {
  const gasto = await obtener(id);
  if (!gasto.compra_id || !gasto.cuenta_id) throw httpError(409, 'Validá el comprobante antes de registrar un pago.');
  if (gasto.moneda !== 'CRC') throw httpError(409, 'La caja trabaja en colones. Este comprobante requiere registrar su conversión antes de pagar.');
  // Es el mismo pago que aparece en Pago Proveedores y en Caja, no otra salida.
  return registrarPago({ metodoPagoId: datos.metodoPagoId, referencia: datos.referencia, claveIdempotencia: datos.claveIdempotencia,
    fecha: datos.fecha, aplicaciones: [{ cuentaPorPagarId: gasto.cuenta_id, pagarTodo: datos.pagarTodo === true, monto: datos.monto }] }, usuarioId);
}

module.exports = { listar, obtener, editar, revalidar, pagar };
