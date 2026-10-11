/** Kardex propio. Se llama con la MISMA conexión de la operación comercial. */
const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');

const conTransaccion = trabajo => enTransaccion(pool, trabajo);
function decimal(v, nombre, { negativo = false, decimales = 8 } = {}) {
  const texto = typeof v === 'number' ? String(v) : v;
  if (typeof texto !== 'string' || !/^-?\d+(?:\.\d{1,8})?$/.test(texto) || !Number.isFinite(Number(texto)) ||
      (texto.split('.')[1]?.length || 0) > decimales || Math.abs(Number(texto)) > 999999999 || (!negativo && Number(texto) < 0)) throw httpError(400, `${nombre}: número válido requerido (hasta ${decimales} decimales).`);
  return texto;
}

async function bloquear(db) {
  const { rows } = await db.query('SELECT * FROM inventario_bodega WHERE id=1 FOR UPDATE');
  if (!rows[0]) throw httpError(503, 'Aplicar la migración de inventario antes de operar.');
  return rows[0];
}

async function saldo(db, productoId) {
  const { rows } = await db.query('SELECT * FROM inventario_saldo WHERE producto_id=$1', [idValido(productoId)]);
  return rows[0] || { producto_id: Number(productoId), existencia: '0.0000', costo_promedio: null, revision_stock: '0', conteo_confirmado: false };
}

async function registrarEn(db, { productoId, tipo, cantidad, costoUnitario = null, origenTipo, origenId,
  clave, usuarioId = null, observaciones = null, cantidadContada = null }) {
  await bloquear(db);
  productoId = idValido(productoId); origenId = idValido(origenId);
  cantidad = decimal(cantidad, 'Cantidad', { negativo: true, decimales: 4 });
  if (costoUnitario != null) costoUnitario = decimal(costoUnitario, 'Costo');
  if (cantidadContada != null) cantidadContada = decimal(cantidadContada, 'Cantidad contada', { decimales: 4 });
  if ((tipo==='inicial') !== (cantidadContada!=null)) throw httpError(400,'El conteo inicial requiere su cantidad física.');
  const { rows: previas } = await db.query('SELECT * FROM movimiento_inventario WHERE clave_operacion=$1', [clave]);
  if (previas[0]) {
    const p = previas[0];
    const {rows:[comparacion]}=await db.query(`SELECT $1::numeric=$2::numeric AND
      $3::numeric IS NOT DISTINCT FROM $4::numeric AND $5::numeric IS NOT DISTINCT FROM $6::numeric AS coincide`,
      [p.cantidad,cantidad,p.costo_unitario,costoUnitario,p.cantidad_contada,cantidadContada]);
    if (p.producto_id !== productoId || p.tipo !== tipo || !comparacion.coincide ||
        p.origen_tipo !== origenTipo || p.origen_id !== origenId) {
      throw httpError(409, 'La misma operación de inventario llegó con otros datos.');
    }
    return p;
  }
  const anterior = await saldo(db, productoId);
  if(tipo==='inicial') {
    // NUMERIC, también para fracciones: no comparar saldos por punto flotante.
    const {rows:[c]}=await db.query('SELECT $1::numeric+$2::numeric=$3::numeric AS coincide',
      [anterior.existencia,cantidad,cantidadContada]);
    if(!c.coincide)throw httpError(409,'El ajuste inicial no coincide con el conteo físico.');
  }
  const contabiliza = true;
  const { rows } = await db.query(`INSERT INTO movimiento_inventario
    (producto_id,tipo,cantidad,costo_unitario,contabiliza,origen_tipo,origen_id,clave_operacion,usuario_id,observaciones,cantidad_contada)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [productoId,tipo,cantidad,costoUnitario,contabiliza,origenTipo,origenId,clave,usuarioId,observaciones,cantidadContada]);
  await db.query('UPDATE inventario_bodega SET revision=revision+1 WHERE id=1');
  return rows[0];
}

/** Compara contra las líneas vigentes: un reintento o una edición no descuenta dos veces. */
async function reconciliarDocumentoEn(db, tipo, id, usuarioId = null, { recepcionId } = {}) {
  if (!['factura','nota_credito','compra'].includes(tipo)) throw httpError(400, 'Documento de inventario inválido.');
  id = idValido(id);
  const bodega = await bloquear(db);
  const sql = tipo === 'compra' ? `
    SELECT l.producto_id, SUM(l.cantidad_propia) AS cantidad,FALSE AS por_recepcion,
      (SUM(l.cantidad*l.precio_unitario-l.descuento+l.impuesto)/NULLIF(SUM(l.cantidad_propia),0))::numeric(20,8) AS costo
    FROM compra_linea l JOIN compra c ON c.id=l.compra_id JOIN producto p ON p.id=l.producto_id
    WHERE c.id=$1 AND c.estado='registrada' AND NOT c.inventario_por_recepcion AND p.inventariable GROUP BY l.producto_id
    UNION ALL
    SELECT l.producto_id,SUM(r.cantidad) AS cantidad,TRUE AS por_recepcion,
      (SUM(r.cantidad*(l.cantidad*l.precio_unitario-l.descuento+l.impuesto)/NULLIF(l.cantidad_propia,0))/NULLIF(SUM(r.cantidad),0))::numeric(20,8) AS costo
    FROM compra_linea l JOIN compra c ON c.id=l.compra_id JOIN producto p ON p.id=l.producto_id
    JOIN (SELECT compra_linea_id,SUM(cantidad) cantidad FROM orden_compra_ciclo_recepcion_linea GROUP BY compra_linea_id) r ON r.compra_linea_id=l.id
    WHERE c.id=$1 AND c.estado='registrada' AND c.inventario_por_recepcion AND p.inventariable GROUP BY l.producto_id`
    : `SELECT l.producto_id, SUM(l.cantidad)*${tipo === 'factura' ? '-1' : '1'} AS cantidad
       FROM ${tipo}_linea l JOIN ${tipo} d ON d.id=l.${tipo}_id JOIN producto p ON p.id=l.producto_id
       WHERE d.id=$1 AND d.estado='emitida' AND d.alegra_id IS NULL AND p.inventariable GROUP BY l.producto_id`;
  const { rows: deseadas } = await db.query(sql, [id]);
  const { rows: anteriores } = await db.query(`SELECT producto_id,SUM(cantidad) AS cantidad,
    (SUM(cantidad*costo_unitario)/NULLIF(SUM(cantidad),0))::numeric(20,8) AS costo
    FROM movimiento_inventario WHERE origen_tipo=$1 AND origen_id=$2 GROUP BY producto_id`, [tipo,id]);
  const actual = new Map(anteriores.map(r => [r.producto_id,r]));
  const destino = new Map(deseadas.map(r => [r.producto_id,r]));
  for (const productoId of new Set([...actual.keys(),...destino.keys()])) {
    const antes = actual.get(productoId), despues = destino.get(productoId);
    // PostgreSQL hace la diferencia decimal; no se acumulan restas binarias de cantidades.
    const { rows: [d] } = await db.query('SELECT ($1::numeric-$2::numeric)::numeric(14,4) AS cantidad',
      [despues?.cantidad || '0',antes?.cantidad || '0']);
    if (Number(d.cantidad) === 0) continue;
    const s = await saldo(db,productoId);
    let costo = tipo === 'compra' ? (despues?.costo ?? antes?.costo) : s.costo_promedio;
    // Valorar las partidas de ESTA entrega: usar el promedio acumulado
    // revaloraría lo anterior y restarlo perdería centésimas por redondeo.
    // Una regalía posterior tiene costo cero aunque la partida pagada use
    // conversión con fracciones; nunca inventar un costo negativo.
    if (tipo === 'compra' && despues?.por_recepcion) {
      if (!recepcionId) throw httpError(409, 'La entrada física requiere su recepción confirmada.');
      const {rows:[valor]}=await db.query(`SELECT
        (SUM(r.cantidad*(l.cantidad*l.precio_unitario-l.descuento+l.impuesto)/NULLIF(l.cantidad_propia,0))/NULLIF(SUM(r.cantidad),0))::numeric(20,8) costo
        FROM orden_compra_ciclo_recepcion_linea r JOIN compra_linea l ON l.id=r.compra_linea_id
        WHERE r.recepcion_id=$1 AND l.compra_id=$2 AND l.producto_id=$3`,
        [recepcionId,id,productoId]);
      if (valor.costo == null) throw httpError(409, 'La recepción no contiene la partida de esta entrada.');
      costo=valor.costo;
    }
    if (!despues || (tipo === 'factura' && Number(d.cantidad)>0)) costo = antes?.costo ?? costo;
    if (tipo === 'nota_credito' && despues) {
      // Devuelve el valor de la salida original, aunque hayan llegado compras
      // más caras después. La anulación devuelve el valor de esta misma nota.
      const { rows: [original] } = await db.query(`SELECT
        (SUM(m.cantidad*m.costo_unitario)/NULLIF(SUM(m.cantidad),0))::numeric(20,8) AS costo
        FROM movimiento_inventario m JOIN nota_credito_factura nf ON nf.factura_id=m.origen_id
        WHERE nf.nota_credito_id=$1 AND m.origen_tipo='factura' AND m.producto_id=$2`, [id,productoId]);
      costo = original?.costo ?? costo;
    }
    if (costo == null) {
      const { rows: [p] } = await db.query('SELECT costo_con_iva FROM producto WHERE id=$1',[productoId]);
      costo = p?.costo_con_iva ?? null;
    }
    await registrarEn(db,{productoId,tipo: !despues ? 'reversa' : tipo === 'factura' ? 'venta' : tipo,
      cantidad:d.cantidad,costoUnitario:costo,origenTipo:tipo,origenId:id,
      clave:`${tipo}:${id}:${productoId}:${bodega.revision}`,usuarioId,
      observaciones: !s.conteo_confirmado ? 'Apertura provisional en cero autorizada; pendiente el conteo físico completo.' : null});
  }
}

const SELECT_PRODUCTOS = `SELECT p.id AS producto_id,p.nombre,p.referencia,p.imagen_url,p.activo,p.inventariable,
  p.costo_con_iva,p.precio_sin_iva,p.stock_minimo,p.stock_objetivo,c.nombre AS categoria,
  s.existencia,s.costo_promedio,s.revision_stock,s.conteo_confirmado,
  s.existencia < p.stock_minimo AS stock_bajo,
  CASE WHEN s.existencia < p.stock_minimo THEN GREATEST(p.stock_objetivo-s.existencia,0) ELSE 0 END AS cantidad_sugerida
  FROM producto p LEFT JOIN categoria_producto c ON c.id=p.categoria_id
  LEFT JOIN inventario_saldo s ON s.producto_id=p.id`;

async function listarExistencias({ q='',categoriaId=null,soloBajo=false,soloSinConteo=false,start=0,limit=100 } = {}, db=pool) {
  start=Number(start);limit=Number(limit);
  if (!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(limit)||limit<1||limit>500) throw httpError(400,'Paginación de inventario inválida.');
  const { rows } = await db.query(`${SELECT_PRODUCTOS}
    WHERE p.activo AND p.inventariable AND (p.nombre ILIKE '%'||$1||'%' OR COALESCE(p.referencia,'') ILIKE '%'||$1||'%')
    AND ($2::integer IS NULL OR p.categoria_id=$2) AND (NOT $3::boolean OR s.existencia<p.stock_minimo)
    AND (NOT $4::boolean OR NOT s.conteo_confirmado) ORDER BY p.nombre,p.id LIMIT $5 OFFSET $6`,
    [String(q).trim().slice(0,200),categoriaId==null?null:idValido(categoriaId),soloBajo===true,soloSinConteo===true,limit,start]);
  const {rows: [bodega]}=await db.query('SELECT * FROM inventario_bodega WHERE id=1');
  return {bodega,productos:rows,start,limit};
}

async function kardex(productoId,{start=0,limit=100}={},db=pool) {
  productoId=idValido(productoId);start=Number(start);limit=Number(limit);
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(limit)||limit<1||limit>500)throw httpError(400,'Paginación del kardex inválida.');
  const {rows:[producto]}=await db.query(`${SELECT_PRODUCTOS} WHERE p.id=$1`,[productoId]);
  if(!producto)throw httpError(404,'Producto no encontrado.');
  const {rows}=await db.query(`SELECT m.*,k.existencia,k.costo_promedio,u.nombre AS usuario_nombre
    FROM movimiento_inventario m LEFT JOIN inventario_kardex k ON k.id=m.id
    LEFT JOIN usuario u ON u.id=m.usuario_id
    WHERE m.producto_id=$1 ORDER BY m.id DESC LIMIT $2 OFFSET $3`,[productoId,limit,start]);
  return {producto,movimientos:rows,start,limit};
}

async function guardarUmbrales(productoId, { stockMinimo, stockObjetivo }) {
  productoId = idValido(productoId);
  stockMinimo = decimal(stockMinimo, 'Stock mínimo', { decimales: 4 });
  stockObjetivo = decimal(stockObjetivo, 'Stock objetivo', { decimales: 4 });
  if (Number(stockObjetivo) < Number(stockMinimo)) throw httpError(400, 'El stock objetivo debe cubrir el mínimo.');
  const { rows: [p] } = await pool.query(`UPDATE producto SET stock_minimo=$2, stock_objetivo=$3
    WHERE id=$1 AND activo AND inventariable RETURNING id,stock_minimo,stock_objetivo`, [productoId,stockMinimo,stockObjetivo]);
  if (!p) throw httpError(404, 'Producto inventariable no encontrado.');
  return p;
}

module.exports={decimal,bloquear,saldo,registrarEn,reconciliarDocumentoEn,listarExistencias,kardex,guardarUmbrales,SELECT_PRODUCTOS,conTransaccion};
