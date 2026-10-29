/**
 * Cada quien ve solo SUS facturas si no tiene «Ver las facturas de todos»
 * (`facturas-todas`, ver usuarios/modulos.js).
 *
 * Decisión del usuario (2026-10-29), para el agente de ventas: «el agente ve
 * solo sus facturas». Una factura es suya si la creó él (`factura.creado_por`);
 * la que armó sin señal y subió después también, porque la sube su sesión.
 *
 * LO HACE VALER EL SERVIDOR, en todo lo que abre una factura por su número:
 * la lista se filtra, y una ajena pedida por id «no existe» (404, sin decir
 * que existe y es de otro) al verla, imprimirla, mandarla, editarla, emitirla
 * ante Hacienda o bajar su XML. Lo mismo con las notas de crédito, que son
 * suyas si las hizo él o si cuelgan de una factura suya.
 */
const { pool } = require('../../../config/database');
const { puedeHacer } = require('../usuarios/permisos.middleware');
const { httpError } = require('../../utils/validacion');

/** El usuario por el que hay que filtrar, o null si ve todas. */
async function soloDe(req) {
  return (await puedeHacer(req, 'facturas-todas')) ? null : req.usuario.id;
}

const entero = (v) => (/^\d+$/.test(String(v)) ? Number(v) : 0);
// Con `code`: el enrutador de Hacienda solo respeta el estado de un error que lo trae.
const noExiste = (que) => Object.assign(httpError(404, `No existe esa ${que}.`), { code: 'NO_EXISTE' });

async function exigirFacturaPropia(req, facturaId) {
  const usuario = await soloDe(req);
  if (usuario === null) return;
  const { rows } = await pool.query('SELECT 1 FROM factura WHERE id = $1 AND creado_por = $2', [entero(facturaId), usuario]);
  if (rows.length === 0) throw noExiste('factura');
}

async function exigirNotaPropia(req, notaId) {
  const usuario = await soloDe(req);
  if (usuario === null) return;
  const { rows } = await pool.query(
    `SELECT 1 FROM nota_credito nc
      WHERE nc.id = $1
        AND (nc.creado_por = $2 OR EXISTS (
              SELECT 1 FROM nota_credito_factura nf JOIN factura f ON f.id = nf.factura_id
               WHERE nf.nota_credito_id = nc.id AND f.creado_por = $2))`,
    [entero(notaId), usuario]);
  if (rows.length === 0) throw noExiste('nota de crédito');
}

/** Middleware: `req.params.id` es una factura. */
const facturaPropia = (req, res, next) => exigirFacturaPropia(req, req.params.id).then(() => next(), next);
/** Middleware: `req.params.id` es una nota de crédito. */
const notaPropia = (req, res, next) => exigirNotaPropia(req, req.params.id).then(() => next(), next);
/** Middleware: la nota nueva se hace sobre `req.body.facturaId`. */
const facturaDelCuerpoPropia = (req, res, next) => exigirFacturaPropia(req, req.body?.facturaId).then(() => next(), next);

module.exports = { soloDe, exigirFacturaPropia, exigirNotaPropia, facturaPropia, notaPropia, facturaDelCuerpoPropia };
