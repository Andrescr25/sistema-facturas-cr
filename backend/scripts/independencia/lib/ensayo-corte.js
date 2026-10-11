/** Guardas y comprobaciones compartidas por el ensayo; no abre conexiones. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { periodo } = require('./conciliacion-ventas');

function validarBase(base) {
  if (typeof base !== 'string' || !/^tachi_ensayo_[a-z0-9_]{4,45}$/.test(base)) {
    throw new Error('Usar una base nueva tachi_ensayo_<nombre>; la compartida y producción están excluidas.');
  }
  return base;
}
function argumentos(args) {
  const v = {};
  for (const a of args) {
    const m = /^--(base|dump|destino|desde|hasta|pasadas)=(.+)$/.exec(a);
    if (!m || v[m[1]]) throw new Error('Uso: --base=tachi_ensayo_<nombre> --dump=/ruta/origen.dump --destino=/ruta/nueva --desde=YYYY-MM-DD --hasta=YYYY-MM-DD [--pasadas=2].');
    v[m[1]] = m[2];
  }
  const base = validarBase(v.base), p = periodo(v.desde, v.hasta);
  const pasadas = v.pasadas == null ? 2 : Number(v.pasadas);
  if (![1, 2].includes(pasadas)) throw new Error('El ensayo permite una o dos pasadas completas.');
  if (!v.dump || !v.destino || !path.isAbsolute(v.dump) || !path.isAbsolute(v.destino)) throw new Error('Dump y destino deben ser rutas absolutas privadas.');
  return { base, dump: path.resolve(v.dump), destino: path.resolve(v.destino), p, pasadas };
}
async function fueraDeGit(ruta) {
  for (let actual = ruta; ; actual = path.dirname(actual)) {
    try { await fs.lstat(path.join(actual, '.git')); throw new Error('Los archivos privados del ensayo deben quedar fuera de Git.'); }
    catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e; }
    if (path.dirname(actual) === actual) break;
  }
}
async function revisarArchivos({ dump, destino }) {
  if (await fs.realpath(dump) !== dump) throw new Error('El dump no puede usar enlaces simbólicos.');
  const st = await fs.lstat(dump);
  if (!st.isFile() || st.size === 0 || (st.mode & 0o077)) throw new Error('El dump debe ser un archivo privado no vacío (0600).');
  const padre = path.dirname(destino);
  if (await fs.realpath(padre) !== padre) throw new Error('El padre del destino no puede usar enlaces simbólicos.');
  await fueraDeGit(dump); await fueraDeGit(destino);
  try { await fs.lstat(destino); throw new Error('El destino ya existe: no se sobrescribe un ensayo anterior.'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const TABLAS = ['producto', 'cliente', 'proveedor', 'factura', 'factura_linea', 'pago', 'pago_factura',
  'nota_credito', 'nota_credito_linea', 'nota_credito_factura', 'debito_ingreso_historico', 'nota_credito_debito_ingreso',
  'compra', 'compra_linea', 'cotizacion', 'cotizacion_linea'];
async function estado(pool) {
  const huellas = {};
  for (const tabla of TABLAS) {
    // La recarga conserva identidad de documentos; reemplaza las líneas.
    // Tiempos de importación, ids de línea y firmas de fotos no son negocio.
    const excluir = ['creado_en', 'actualizado_en', 'copiado_en'];
    if (tabla.endsWith('_linea') || ['pago_factura', 'nota_credito_factura', 'nota_credito_debito_ingreso'].includes(tabla)) excluir.push('id');
    if (tabla === 'producto') excluir.push('imagen_url');
    const json = 'to_jsonb(t)' + excluir.map(c => ` - '${c}'`).join('');
    huellas[tabla] = (await pool.query(`SELECT COUNT(*)::integer AS filas,
      md5(COALESCE(string_agg(j::text, '' ORDER BY j::text), '')) AS huella
      FROM (SELECT ${json} AS j FROM ${tabla} t) d`)).rows[0];
  }
  const stock = (await pool.query(`SELECT COUNT(*)::integer AS productos,
    COUNT(*) FILTER (WHERE existencia<>0)::integer AS con_existencias,
    COUNT(*) FILTER (WHERE conteo_confirmado)::integer AS contados FROM inventario_saldo`)).rows[0];
  const pendientes = (await pool.query(`SELECT COUNT(*)::integer AS intentos_no_resueltos
    FROM factura_intento WHERE estado='creada' AND huella IS NOT NULL
      AND alegra_invoice_id IS NOT NULL AND factura_id IS NULL`)).rows[0];
  const series = (await pool.query(`SELECT s.serie,s.siguiente::text,s.electronica,s.activo,
    COALESCE(MAX(d.consecutivo),0)::text AS maximo
    FROM serie_consecutivo s LEFT JOIN (
      SELECT serie,consecutivo FROM factura UNION ALL SELECT serie,consecutivo FROM nota_credito
    ) d ON d.serie=s.serie WHERE s.tipo_documento IN ('factura','tiquete','nota_credito')
    GROUP BY s.id ORDER BY s.serie`)).rows;
  return { huellas, stock, ...pendientes, series };
}
function verificarEstado(e) {
  if (!Number.isSafeInteger(e.stock.productos) || e.stock.productos <= 0 || e.stock.con_existencias !== 0 || e.stock.contados !== 0) throw new Error('La apertura del ensayo debe seguir en cero provisional.');
  if (e.intentos_no_resueltos !== 0) throw new Error('Quedan intentos históricos de factura sin resolver después de la 041.');
  if (!Array.isArray(e.series) || !e.series.length || e.series.some(s => BigInt(s.siguiente) <= BigInt(s.maximo) || (s.electronica && s.activo))) throw new Error('Consecutivos inseguros o serie electrónica activa; no se certifica el ensayo.');
}
module.exports = { validarBase, argumentos, revisarArchivos, fueraDeGit, estado, verificarEstado };
