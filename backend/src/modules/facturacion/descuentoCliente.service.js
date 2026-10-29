const { pool } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { clasificarProducto, CLASIFICACION } = require('../precios/auditoria');
const { obtenerCostosDerivados } = require('../precios/costoDerivado');

/** La misma calidad de costo que Rentabilidad, con la tarifa real. */
async function costosParaDescuentoEn(db, productos) {
  const derivados = await obtenerCostosDerivados({ db, productoIds: productos.map(p => p.id) });
  const costos = new Map();
  for (const p of productos) {
    // Una tarifa ausente no acredita exención: falta cómo quitarle IVA al costo.
    if (p.tarifa === null || p.tarifa === undefined || !Number.isFinite(Number(p.tarifa))) continue;
    const derivado = derivados.get(Number(p.id));
    const dato = clasificarProducto({
      price: p.precio, cost: p.costo, tarifa: p.tarifa ?? 0,
      costoDerivado: derivado?.costo, historialInestable: derivado?.historialInestable
    });
    if ([CLASIFICACION.OK, CLASIFICACION.MARGEN_NEGATIVO].includes(dato.clasificacion)) {
      costos.set(Number(p.id), dato.costoSinIva);
    }
  }
  return costos;
}

function descuentoAplicable(precio, costo, porcentaje) {
  // Comparar importes evita convertir 21% exacto en 21.000000000000004%.
  return Number.isFinite(costo) && costo > 0 && precio > 0 &&
    precio * 0.79 - costo > 1e-9 * Math.max(1, precio) && costo / precio >= 0.05
    ? porcentaje : 0;
}

/**
 * La pantalla revisó estos porcentajes y pudo elegir un cobro. Si cambió la
 * ficha o el costo mientras tanto, pedir revisión en vez de cobrar otro total.
 * Los consumidores internos sin vista previa reciben la regla vigente.
 */
async function aplicarDescuentoEn(db, cliente, items, productos, claveDe, { revisado, preciosConImpuesto = false, claveItem = item => item.productoId ?? item.id } = {}) {
  const porcentaje = Number(cliente.descuento_global) || 0;
  const visto = revisado !== undefined;
  const conflicto = () => Object.assign(httpError(409, 'Cambió el descuento del cliente o el margen de un producto. Revisá los descuentos de la factura antes de volver a guardarla.'), { code: 'DESCUENTO_CLIENTE_CAMBIO' });
  if (visto && (!Number.isFinite(Number(revisado)) || Number(revisado) !== porcentaje)) throw conflicto();
  if (!porcentaje && !visto) return items;
  const costos = porcentaje ? await costosParaDescuentoEn(db, productos) : new Map();
  const porClave = new Map(productos.map(p => [String(claveDe(p)), p]));
  return items.map(item => {
    const p = porClave.get(String(claveItem(item)));
    if (!p) return item; // La validación de líneas explica el producto ausente.
    const descuento = Number(item.discount ?? item.descuento ?? 0);
    const base = Number(item.descuentoBase ?? descuento);
    if (!Number.isFinite(base) || base < 0 || base > 100 || !Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
      throw httpError(400, `${p.nombre}: el descuento va entre 0 y 100.`);
    }
    const precio = Number(item.price ?? item.precio) / (preciosConImpuesto ? 1 + Number(p.tarifa ?? 0) / 100 : 1);
    const automatico = descuentoAplicable(precio, costos.get(Number(p.id)), porcentaje);
    const efectivo = Math.max(base, automatico);
    if (visto && Math.abs(descuento - efectivo) > 1e-9) throw conflicto();
    return { ...item, discount: efectivo };
  });
}

/** Endpoint privado de Facturación: los costos nunca van al catálogo público. */
/**
 * El descuento del cliente y en qué productos aplica.
 *
 * `conCostos: false` (quien no puede cambiar precio, 2026-10-29): no viajan los
 * costos —con ellos se saca el margen de cada producto—. Como ese usuario
 * siempre factura a precio de lista, el servidor manda ya resuelto en qué
 * productos aplica (`aplica`), con la misma regla que usa al guardar.
 */
async function condicionesDelCliente(clienteId, { conCostos = true } = {}) {
  const { rows: [cliente] } = await pool.query('SELECT id, activo, descuento_global FROM cliente WHERE id = $1', [idValido(clienteId)]);
  if (!cliente) throw httpError(404, 'No existe ese cliente.');
  if (!cliente.activo) throw httpError(400, 'Ese cliente está inactivo.');
  const porcentaje = Number(cliente.descuento_global) || 0;
  if (!porcentaje) return { clienteId: cliente.id, porcentaje, costos: [], ...(conCostos ? {} : { aplica: [] }) };
  const { rows } = await pool.query(`SELECT p.id, p.precio_sin_iva AS precio, p.costo_con_iva AS costo, i.tarifa
    FROM producto p LEFT JOIN impuesto i ON i.id = p.impuesto_id WHERE p.activo = true`);
  const costos = await costosParaDescuentoEn(pool, rows);
  if (!conCostos) {
    const aplica = rows.filter(p => descuentoAplicable(Number(p.precio), costos.get(Number(p.id)), porcentaje) > 0).map(p => p.id);
    return { clienteId: cliente.id, porcentaje, costos: [], aplica };
  }
  return { clienteId: cliente.id, porcentaje, costos: [...costos].map(([id, costoSinIva]) => ({ id, costoSinIva })) };
}

module.exports = { condicionesDelCliente, aplicarDescuentoEn, costosParaDescuentoEn, descuentoAplicable };
