const { pool } = require('../../../config/database');
const { enTransaccion: enTransaccionCon } = require('../../utils/transaccion');
const { httpError } = require('../../utils/validacion');
const { asegurarFacturaVigente } = require('./vigenciaFactura');

/**
 * UNA FACTURA QUE BODEGA YA TOMÓ NO SE EDITA (2026-10-23, pedido del usuario:
 * «si hay que quitar algo, nota de crédito; si hay que agregar algo, factura
 * nueva; la única forma de editarla es que no la haya tomado nadie en
 * bodega»). Cambiar una factura mientras alguien alista, empaca o ya despachó
 * lo que dice es como el papel y el sistema dejaron de coincidir: el 22/10 la
 * 001000015075 pasó de ₡41.130 a ₡34.361 en cinco ediciones y el papel impreso
 * no decía lo que el sistema.
 *
 * «TOMADA» ES CUALQUIERA DE TRES COSAS, y basta una:
 *  - alguien la abrió en Bodega (factura_en_bodega, migración 066: lo marcado
 *    antes de despachar vive solo en el teléfono, el servidor no lo sabía);
 *  - Bodega la despachó (`estado_bodega = 'procesado'`);
 *  - ya tiene faltantes registrados (lo hace Bodega al despachar).
 * Reabrir un despacho no la libera: la marca de apertura no se borra, y los
 * faltantes tampoco.
 *
 * EXCEPCIÓN: Impresión. Su proceso (rebajar lo que no llegó y poner los
 * precios de catálogo) llama a `editarFacturaEn` directo y no pasa por acá;
 * el usuario lo dejó como está («Impresión sigue ajustando»).
 */
const enTransaccion = (trabajo) => enTransaccionCon(pool, trabajo);

/** La condición SQL de «ya la tomó Bodega», para quien lista facturas. */
function tomadaEnBodegaSql(f = 'f') {
  return `(${f}.estado_bodega = 'procesado'
    OR EXISTS (SELECT 1 FROM factura_en_bodega b WHERE b.factura_id = ${f}.id)
    OR EXISTS (SELECT 1 FROM faltantes x WHERE x.factura_propia_id = ${f}.id))`;
}

async function estaTomadaEn(db, facturaId) {
  const { rows: [r] } = await db.query(`SELECT ${tomadaEnBodegaSql('f')} AS tomada FROM factura f WHERE f.id = $1`, [facturaId]);
  return Boolean(r?.tomada);
}

/** Lo que se le responde a quien intenta editar una factura que Bodega ya tomó. */
function mensajeDeFacturaTomada(numero) {
  return `La factura ${numero} ya la tomó Bodega y no se edita. Si hay que quitar algo, se hace una nota de crédito; ` +
    'si hay que agregar algo, una factura nueva.';
}

/** Deja anotado que la tomaron. Idempotente; el que llama ya tiene la factura bloqueada. */
async function tomarEn(db, facturaId, usuarioId = null) {
  const usuario = Number.isInteger(Number(usuarioId)) && Number(usuarioId) > 0 ? Number(usuarioId) : null;
  await db.query(
    'INSERT INTO factura_en_bodega (factura_id, usuario_id) VALUES ($1, $2) ON CONFLICT (factura_id) DO NOTHING',
    [facturaId, usuario]
  );
}

/**
 * POST /bodega/facturas-propias/:facturaId/tomar — alguien abrió la factura en
 * Bodega. Espera a que termine una edición en curso (bloquea la factura, como
 * `editarFactura`): una de las dos gana, nunca las dos a medias.
 */
async function tomar(facturaIdCrudo, usuarioId = null) {
  const facturaId = Number(facturaIdCrudo);
  if (!Number.isInteger(facturaId) || facturaId <= 0) throw httpError(400, 'Factura inválida.');
  return enTransaccion(async (c) => {
    await asegurarFacturaVigente(facturaId, c, { bloquear: true });
    await tomarEn(c, facturaId, usuarioId);
    return { factura_id: facturaId, tomada: true };
  });
}

module.exports = { tomadaEnBodegaSql, estaTomadaEn, mensajeDeFacturaTomada, tomarEn, tomar };
