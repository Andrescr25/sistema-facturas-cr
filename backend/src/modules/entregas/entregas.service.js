const { pool } = require('../../../config/database');
const { enTransaccion } = require('../../utils/transaccion');
const { httpError, idValido } = require('../../utils/validacion');
const historico = require('./entregasHistoricas.service');
const { lineasEn } = require('./entregasLineas.service');
const { SIN_CREDITO_TOTAL } = require('../facturacion/saldo.sql');

const entero = (valor, nombre) => {
  if (!((typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0) ||
    (typeof valor === 'string' && /^[1-9]\d*$/.test(valor))) || Number(valor) > 2147483647) throw httpError(400, `${nombre} inválido.`);
  return idValido(valor);
};
function validar({ rutaId, pagina = 1, tamano = 20, vista = 'pendientes' } = {}) {
  if (rutaId == null || rutaId === '') throw httpError(400, 'Seleccioná una ruta o Sin ruta.');
  if (rutaId !== 'sin-ruta') rutaId = entero(rutaId, 'Ruta');
  pagina = entero(pagina, 'Página'); tamano = entero(tamano, 'Tamaño de página');
  if (tamano > 50) throw httpError(400, 'Como máximo 50 paradas por página.');
  if (!['pendientes', 'historial'].includes(vista)) throw httpError(400, 'Vista de entregas inválida.');
  return { rutaId, pagina, tamano, vista };
}
const lectura = fn => enTransaccion(pool, async db => {
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  return fn(db);
});

/** Todas las facturas pendientes de la ruta, sin límite de fecha/semana.
 * Antes del primer evento siguen la ficha; una carga ya registrada conserva
 * su ruta/orden/Maps. La historia se consulta aparte, nunca se borra.
 */
async function recorridoEn(db, filtros) {
  const { rows: [ruta] } = filtros.rutaId === 'sin-ruta' ? { rows: [{ id: null, nombre: 'Sin ruta' }] }
    : await db.query('SELECT id, nombre FROM ruta_cliente WHERE id=$1', [filtros.rutaId]);
  if (!ruta) throw httpError(404, 'No existe esa ruta.');
  const params = filtros.rutaId === 'sin-ruta' ? [] : [filtros.rutaId];
  const where = filtros.rutaId === 'sin-ruta' ? "(x.ruta->>'id') IS NULL" : "(x.ruta->>'id')::int=$1";
  const { rows } = await db.query(`SELECT f.id, f.numero, f.cliente_id, f.cliente_nombre,
    f.estado_bodega, f.preventa_anticipada, x.ruta, entrega_resumen(f.id) avance,
    f.estado='emitida' AND ${SIN_CREDITO_TOTAL} vigente,
    (SELECT count(*)::int FROM faltantes z WHERE z.factura_propia_id=f.id AND z.tipo_faltante<>'completo'
      AND z.cantidad_faltante>0 AND z.estado IN ('pendiente','procesado')) faltantes,
    e.id evento_id, e.documento->'factura'->>'clienteNombre' nombre_cargado,
    p.id pedido_id, p.origen
    FROM factura f CROSS JOIN LATERAL (SELECT entrega_ruta_operativa(f.id) ruta) x
    LEFT JOIN LATERAL (SELECT id,documento FROM entrega_evento WHERE factura_id=f.id ORDER BY version DESC LIMIT 1) e ON true
    LEFT JOIN LATERAL (SELECT id,origen FROM pedido_cliente WHERE factura_id=f.id
      AND cliente_id IS NOT DISTINCT FROM f.cliente_id ORDER BY id LIMIT 1) p ON true
    WHERE ${where} AND (f.estado='emitida' AND ${SIN_CREDITO_TOTAL} OR e.id IS NOT NULL) ORDER BY f.id`, params);
  const grupos = new Map();
  for (const fila of rows) {
    const pendiente = fila.vigente && fila.avance.estado !== 'entregada';
    // Carga devuelta/anulada no es una entrega pendiente; si sigue en camión
    // se mantiene visible para descargar físicamente, aunque ya no sea venta.
    const operativa = pendiente || Number(fila.avance.enCamion) > 0;
    if (filtros.vista === 'pendientes' ? !operativa : operativa) continue;
    const nombre = fila.nombre_cargado || fila.cliente_nombre || 'Cliente sin nombre';
    // Una ficha puede tener una carga fijada y otras facturas nuevas con otra
    // ubicación/orden: conservar ambos contextos, sin reasignar la carga.
    const clave = `f-${fila.id}`;
    const grupo = fila.cliente_id ? `${fila.cliente_id}:${JSON.stringify(fila.ruta)}` : clave;
    if (!grupos.has(grupo)) grupos.set(grupo, { clave, clienteId: fila.cliente_id, clienteNombre: nombre, ruta: fila.ruta,
      ciclo: null, ubicacion_maps: fila.ruta.ubicacionMaps,
      documentos: [{ tipo: 'factura', id: fila.id, numero: fila.numero, pedidoId: fila.pedido_id,
        origen: fila.origen, anticipado: fila.preventa_anticipada, estadoBodega: fila.estado_bodega,
        revisionBodega: fila.estado_bodega === 'procesado', faltantes: fila.faltantes,
        avance: fila.avance, vigente: fila.vigente }] });
    else grupos.get(grupo).documentos.push({ tipo: 'factura', id: fila.id, numero: fila.numero,
      pedidoId: fila.pedido_id, origen: fila.origen, anticipado: fila.preventa_anticipada,
      estadoBodega: fila.estado_bodega, revisionBodega: fila.estado_bodega === 'procesado',
      faltantes: fila.faltantes, avance: fila.avance, vigente: fila.vigente });
  }
  const paradas = [...grupos.values()].sort((a, b) => (a.ruta.orden ?? Infinity) - (b.ruta.orden ?? Infinity)
    || a.clienteNombre.localeCompare(b.clienteNombre, 'es') || a.documentos[0].id - b.documentos[0].id);
  return { ruta, ciclo: null, paradas };
}
function aPlan({ ruta, paradas }, { pagina, tamano, vista }) {
  const documentos = paradas.flatMap(p => p.documentos);
  const carga = vista === 'historial' ? [] : [...paradas].reverse().filter(p => p.documentos.some(d => d.vigente))
    .map((p, i) => ({ ...p, facturas: p.documentos.filter(d => d.vigente), ordenCarga: i + 1, pagina: Math.floor(paradas.indexOf(p) / tamano) + 1 }));
  return { ruta, ciclo: null, paradas: paradas.slice((pagina - 1) * tamano, pagina * tamano), carga,
    resumen: { paradas: paradas.length, facturas: documentos.length,
      revisadas: documentos.filter(d => d.revisionBodega).length, pedidosSinFacturar: 0 },
    paginacion: { pagina, tamano, paginas: Math.max(1, Math.ceil(paradas.length / tamano)), total: paradas.length } };
}
const esHistorico = datos => datos?.cicloId != null && datos.cicloId !== '';
async function plan(datos) {
  if (esHistorico(datos)) return historico.plan(datos);
  const filtros = validar(datos);
  return lectura(async db => aPlan(await recorridoEn(db, filtros), filtros));
}
function claveValida(clave) {
  if (typeof clave !== 'string' || !/^f-[1-9]\d*$/.test(clave)) throw httpError(400, 'Parada inválida.');
  entero(clave.slice(2), 'Parada');
}
async function parada(clave, datos) {
  if (esHistorico(datos)) return historico.parada(clave, datos);
  claveValida(clave); const filtros = validar(datos);
  return lectura(async db => {
    const r = await recorridoEn(db, filtros), p = r.paradas.find(p => p.clave === clave);
    if (!p) throw httpError(404, 'Esa factura ya no pertenece a la selección. Actualizá la ruta.');
    const lineas = await lineasEn(db, p.documentos.map(d => d.id));
    return { ...p, documentos: p.documentos.map(d => ({ ...d, lineas: lineas.filter(l => l.documento_id === d.id)
      .map(l => ({ productoId: l.producto_id, nombre: l.nombre, referencia: l.referencia, descripcion: l.descripcion, cantidad: Number(l.cantidad) })) })) };
  });
}
async function paraExportar(datos) {
  if (esHistorico(datos)) return historico.paraExportar(datos);
  const filtros = validar({ ...datos, pagina: 1 });
  if (datos?.clave != null) claveValida(datos.clave);
  return lectura(async db => {
    const completo = await recorridoEn(db, filtros);
    const paradas = datos?.clave ? completo.paradas.filter(p => p.clave === datos.clave) : completo.paradas;
    if (datos?.clave && !paradas.length) throw httpError(404, 'Esa factura ya no pertenece a la selección.');
    const p = aPlan({ ...completo, paradas }, { ...filtros, tamano: Math.max(1, paradas.length) });
    if (datos?.clave) p.carga = aPlan(completo, filtros).carga.filter(p => p.clave === datos.clave);
    return { ...p, lineas: await lineasEn(db, paradas.flatMap(p => p.documentos.map(d => d.id))) };
  });
}
async function listarRutas() {
  // Incluye rutas inactivas: una carga/historia fijada allí sigue consultable
  // aunque la ficha del cliente ya se haya movido a otra ruta.
  return lectura(async db => (await db.query('SELECT id,nombre,activo FROM ruta_cliente ORDER BY lower(nombre),id')).rows);
}
module.exports = { plan, parada, paraExportar, listarRutas };
