/**
 * Precio y descuento FIJOS para quien no tiene el permiso «Cambiar precio y
 * descuento» (`precio-factura`, ver usuarios/modulos.js).
 *
 * Decisión del usuario (2026-10-29), para el agente de ventas que va a
 * contratar: «el precio y descuento no lo puede tocar». La pantalla esconde
 * los campos, pero eso es cosmética: lo que protege es esta revisión, que
 * corre en el servidor al crear o editar una factura desde Facturación.
 *
 * QUÉ VALE
 * · Precio: el de lista del producto (`precio_sin_iva`). Al editar una
 *   factura, también el que ya tenía esa línea: el precio de lista pudo
 *   cambiar desde que se emitió, y eso no lo hizo el agente.
 * · Descuento: 0, la oferta vigente del producto (la misma que la pantalla
 *   pone sola al agregarlo) o el descuento global del cliente. Al editar,
 *   también el que ya tenía la línea.
 *
 * NO SE CORRIGE EN SILENCIO: si no calza, se rechaza (409) diciendo qué
 * línea y por qué. Cambiarle el total al sincronizar cambiaría lo que el
 * agente le prometió al cliente — la misma regla que ya sigue el descuento
 * del cliente. Lo más probable es un catálogo viejo en el dispositivo, y el
 * mensaje lo dice.
 *
 * Impresión y Bodega editan facturas por su cuenta (`editarFacturaEn`
 * directo) y no pasan por acá: la restricción es del agente en Facturación.
 */
const { httpError } = require('../../utils/validacion');
const { mapaVigentesPropios } = require('../../utils/descuentosExceso');
const { enColones } = require('./facturaLineas');

const igual = (a, b) => Math.abs(Number(a) - Number(b)) <= 1e-6 * Math.max(1, Math.abs(Number(b)));
const conocido = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

const rechazo = (mensaje) => Object.assign(httpError(409, mensaje), { code: 'PRECIO_FIJO' });

/**
 * @param {{query: Function}} db  la conexión de la transacción de la factura
 * @param {object[]} items  las líneas como las manda la pantalla
 * @param {(item: object) => object|undefined} productoDe  el producto del servidor de esa línea
 * @param {{ porcentajeCliente?: number, anteriores?: Map<number, {precios: number[], descuentos: number[]}> }} opciones
 *   `anteriores`: al editar, lo que ya tenía cada producto en la factura (puede venir en varias líneas).
 */
async function exigirPrecioDeLista(db, items, productoDe, { porcentajeCliente = 0, anteriores = new Map() } = {}) {
  const ofertas = await mapaVigentesPropios(db);

  items.forEach((item, indice) => {
    const p = productoDe(item);
    if (!p) return; // `armarLineas` explica el producto que no existe.
    const antes = anteriores.get(Number(p.id));
    const linea = `Línea ${indice + 1} (${p.nombre})`;

    const precio = Number(item.price ?? item.precio);
    const precios = [p.precio, ...(antes?.precios || [])].filter(conocido);
    if (!precios.some(v => igual(precio, v))) {
      throw rechazo(`${linea}: su usuario no puede cambiar el precio. El de lista es ${enColones(p.precio)} sin IVA. ` +
        'Si el catálogo de este dispositivo está viejo, actualícelo y vuelva a agregar el producto.');
    }

    const oferta = ofertas.get(String(p.id)) || 0;
    const base = [0, oferta, ...(antes?.descuentos || [])].filter(conocido);
    const finales = [...base, Number(porcentajeCliente) || 0];
    const descuento = Number(item.discount ?? item.descuento ?? 0) || 0;
    const descuentoBase = item.descuentoBase ?? null;
    if (!finales.some(v => igual(descuento, v)) || (conocido(descuentoBase) && !base.some(v => igual(descuentoBase, v)))) {
      throw rechazo(`${linea}: su usuario no puede poner descuentos a mano. ` +
        'Solo valen la oferta vigente del producto o el descuento del cliente.');
    }
  });
}

module.exports = { exigirPrecioDeLista };
