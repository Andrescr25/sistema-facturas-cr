const { randomUUID } = require('node:crypto');
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError } = require('../../utils/validacion');
const { registrarCambio } = require('../../utils/bitacora');
const { interno: { entero } } = require('./ordenesCiclo.service');
const { comparar, interno: { uuid, identidad, hash, fuenteEn } } = require('./ordenesCicloFactura.service');

/** Una factura se asigna sola únicamente cuando tiene una orden posible y
 * confiable. Un comprobante parcial no cierra el pedido: puede haber varios.
 * Sólo la cobertura comercial completa lo retira de candidatas; una fuente
 * incierta exige elegir. La recepción física no prueba facturación completa.
 * Cédula/ficha fijan identidad, nunca fechas, nombres o parecidos de producto. */
async function candidatasEn(db, facturaId, proveedorId) {
  let factura;
  if (typeof facturaId === 'object') factura = { ...facturaId, proveedor_id: proveedorId };
  else ({ rows: [factura] } = await db.query(`SELECT f.id, f.proveedor_cedula, p.id proveedor_id
    FROM facturas_proveedores f LEFT JOIN proveedor p ON p.identificacion=f.proveedor_cedula
    WHERE f.id=$1`, [uuid(facturaId)]));
  if (!factura) throw httpError(404, 'Factura no encontrada.');
  if (proveedorId != null && factura.proveedor_id !== proveedorId) throw httpError(409, 'La ficha del proveedor cambió. Revisá la factura.');
  const { rows: [vinculo] } = await db.query("SELECT orden_id FROM orden_compra_ciclo_factura WHERE factura_id=$1 AND estado='vigente'", [factura.id]);
  const { rows: posibles } = await db.query(`SELECT o.id, 'OC-'||o.id referencia, o.enviada_en AS "enviadaEn",
    (SELECT COUNT(*)::int FROM orden_compra_ciclo_linea l WHERE l.orden_id=o.id) AS "totalProductos",
    EXISTS(SELECT 1 FROM orden_compra_ciclo_factura v WHERE v.orden_id=o.id AND v.estado='vigente'
      AND NOT EXISTS(SELECT 1 FROM compra c WHERE c.factura_proveedor_id=v.factura_id
        AND c.estado='registrada' AND c.proveedor_id=o.proveedor_id)) AS "facturasPorRevisar"
    FROM orden_compra_ciclo o
    WHERE o.proveedor_id=$1 AND regexp_replace(upper(o.proveedor_cedula),'[^A-Z0-9]','','g')=$2
      AND o.estado IN ('enviada','parcialmente_recibida') AND o.enviada_en IS NOT NULL
    ORDER BY o.enviada_en DESC, o.id DESC`, [factura.proveedor_id, identidad(factura.proveedor_cedula)]);
  const ordenes = [];
  for (const o of posibles) {
    const comparacion = await comparacionEn(db, o.id);
    const incierta = o.facturasPorRevisar || comparacion.requiereRevision || !comparacion.productos.length;
    const completa = !incierta && comparacion.productos.every(p => p.facturado != null && p.facturado >= p.solicitado);
    if (completa) continue;
    ordenes.push({ ...o, facturacion: incierta ? 'por_revisar' : comparacion.facturas.length ? 'parcial' : 'pendiente' });
  }
  const requiereSeleccion = !vinculo && (ordenes.length > 1 || ordenes.some(o => o.facturacion === 'por_revisar'));
  return { ordenes, automatica: !vinculo && !requiereSeleccion && ordenes.length === 1 ? ordenes[0].id : null,
    vinculada: vinculo?.orden_id || null, requiereSeleccion };
}

async function candidatas(facturaId) {
  return enTransaccion(pool, async db => {
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    return candidatasEn(db, facturaId);
  });
}

/** Se ejecuta bajo el mismo advisory/tx que registrarCompra: entre revisar
 * y guardar puede aparecer otra orden; esa carrera exige elegir de nuevo. */
async function elegirEn(db, factura, proveedorId, ordenCompraId, ordenCompraAutomaticaId) {
  const seleccion = ordenCompraId == null || ordenCompraId === '' ? null : entero(ordenCompraId, 'Orden de compra');
  const esperada = ordenCompraAutomaticaId == null ? ordenCompraAutomaticaId : entero(ordenCompraAutomaticaId, 'Orden automática revisada');
  const lista = await candidatasEn(db, factura, proveedorId);
  if (lista.vinculada) {
    if (seleccion && seleccion !== lista.vinculada) throw httpError(409, 'La factura ya está vinculada a otra orden de compra.');
    return { ordenId: lista.vinculada, existente: true };
  }
  if (seleccion && !lista.ordenes.some(o => o.id === seleccion)) throw httpError(409, 'La orden seleccionada ya no está disponible para esta factura. Revisá la selección.');
  if (!seleccion && lista.requiereSeleccion) throw httpError(409, lista.ordenes.length > 1
    ? 'Hay varias órdenes enviadas de este proveedor. Elegí la orden de compra en Revisión de precios.'
    : 'La orden tiene una factura pendiente de revisar. Elegí la orden de compra en Revisión de precios.');
  // Una orden parcial puede completarse mientras esta revisión está abierta.
  // Si ahora queda otra única candidata, no desviar allí la factura en silencio.
  if (!seleccion && esperada !== undefined && esperada !== lista.automatica) throw httpError(409, 'La orden automática cambió. Actualizá la revisión antes de registrar esta compra.');
  return { ordenId: seleccion || lista.automatica, existente: false };
}

/** El snapshot nace de las líneas de compra ya registradas, con su conversión
 * histórica. El vínculo se revierte junto con compra/precios/CxP si algo falla.
 * No cambia el PDF enviado ni acredita recepción física de mercadería. */
async function vincularRegistradaEn(db, seleccion, facturaId, actor) {
  if (!seleccion.ordenId || seleccion.existente) return seleccion.ordenId;
  const { rows: [orden] } = await db.query('SELECT * FROM orden_compra_ciclo WHERE id=$1 FOR SHARE', [seleccion.ordenId]);
  if (!orden || !['enviada','parcialmente_recibida'].includes(orden.estado)) throw httpError(409, 'La orden ya no está disponible para vincular esta compra.');
  const fuente = await fuenteEn(db, orden, facturaId);
  if (fuente.documento.fuente !== 'compra_registrada') throw httpError(409, 'La factura debe pasar por Revisión de precios antes de compararla.');
  const clave = randomUUID();
  await db.query(`INSERT INTO orden_compra_ciclo_factura(id,orden_id,factura_id,solicitud,documento,lineas,firma,creado_por)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [clave, orden.id, facturaId,
    { facturaId, compraId: fuente.documento.compra_id, origen: 'revision_precios', version: orden.version },
    fuente.documento, JSON.stringify(fuente.lineas), hash(fuente), actor || null]);
  await registrarCambio(db, { entidad: 'orden_compra_ciclo', entidadId: orden.id, accion: 'vincular_factura',
    despues: { vinculoId: clave, facturaId, compraId: fuente.documento.compra_id }, usuarioId: actor });
  return orden.id;
}

/** Lectura del reporte: sólo un vínculo exacto con compra registrada permite
 * afirmar Facturado/No facturado. Sin comprobante revisado las cifras son NULL.
 * No usa FOR SHARE ni prepara órdenes; admite transacciones READ ONLY. */
async function comparacionEn(db, ordenId) {
  const { rows: [orden] } = await db.query('SELECT id,proveedor_id,proveedor_cedula FROM orden_compra_ciclo WHERE id=$1', [entero(ordenId)]);
  if (!orden) throw httpError(404, 'Orden de compra no encontrada.');
  const { rows: lineas } = await db.query('SELECT producto_id,producto_nombre,cantidad_propia::text FROM orden_compra_ciclo_linea WHERE orden_id=$1 ORDER BY id', [orden.id]);
  orden.lineas = lineas;
  const { rows: vinculos } = await db.query(`SELECT v.factura_id,v.documento,v.lineas,v.firma
    FROM orden_compra_ciclo_factura v JOIN compra c ON c.factura_proveedor_id=v.factura_id
    WHERE v.orden_id=$1 AND v.estado='vigente' AND c.estado='registrada' AND c.proveedor_id=$2
    ORDER BY v.secuencia`, [orden.id, orden.proveedor_id]);
  const documentos = [];
  let requiereRevision = false;
  for (const v of vinculos) {
    try {
      const fuente = await fuenteEn(db, orden, v.factura_id, { bloquear: false });
      // Un vínculo antiguo del buzón queda conservado; al revisar precios se
      // compara la compra final. Una compra que cambió después sí exige revisión.
      const fuenteCambio = v.documento.fuente === 'compra_registrada' && hash(fuente) !== v.firma;
      documentos.push({ ...fuente, factura_id: v.factura_id, fuenteCambio });
      requiereRevision ||= fuenteCambio;
    } catch (error) {
      if (![404, 409].includes(error.status)) throw error;
      requiereRevision = true;
    }
  }
  const resultado = comparar(orden, documentos);
  if (requiereRevision) resultado.productos = resultado.productos.map(p => ({ ...p, facturado: null, faltante: null, exceso: null, estado: 'por_revisar' }));
  return { ...resultado, requiereRevision: resultado.requiereRevision || requiereRevision,
    facturas: documentos.map(v => ({ id: v.factura_id, numero: v.documento.numero_consecutivo, compraId: v.documento.compra_id })) };
}

module.exports = { candidatas, candidatasEn, elegirEn, vincularRegistradaEn, comparacionEn };
