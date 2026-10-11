/**
 * Portal de clientes - Sus facturas pendientes.
 *
 * Sale de NUESTRAS tablas (`factura`, `pago_factura`, `nota_credito_factura`),
 * no del espejo `cuentas_por_cobrar` que se copiaba de Alegra cada 30 minutos.
 *
 * POR QUÉ SE CAMBIÓ. El espejo se quedaba viejo por diseño: entre dos
 * sincronizaciones podía haber media hora, y al comparar las dos fuentes había
 * dos facturas de un cliente ya pagadas en efectivo que el espejo seguía
 * mostrando pendientes. Un cliente que abre el portal y ve como deuda lo que
 * pagó ayer no vuelve a creerle a la pantalla. Leyendo de la base propia el
 * saldo es el de este segundo, porque el cobro se registra acá mismo.
 *
 * EL SALDO NO SE GUARDA, SE CALCULA: total − cobros vigentes − notas de
 * crédito vigentes. Se usan las MISMAS expresiones que la pantalla de la casa
 * (`facturaConsulta.service`), a propósito: si el cliente y el cobrador vieran
 * saldos distintos, la discusión en el mostrador no la gana nadie.
 *
 * EL FILTRO POR CLIENTE SALE DEL TOKEN, nunca de la petición. Es la
 * diferencia entre que alguien vea lo que debe y que vea lo que deben los
 * demás negocios del pueblo. Y se filtra por `cliente_id`, NUNCA por nombre:
 * hay fichas con nombres casi iguales ("OG PWR HOUSE ...-GYM Palmares" y
 * "... GYM-San Ramón") y calzar por texto le enseñaría a un cliente las
 * facturas de otro.
 *
 * QUÉ NO SE MUESTRA: nada de márgenes, costos ni el estado interno del cobro
 * (gestiones, notas). Solo lo que el propio cliente ya sabe o debería saber:
 * qué factura, de cuándo, cuánto era, cuánto abonó y cuánto queda.
 */

const { query } = require('./portal-clientes.auth');
const { COBRADO, ACREDITADO } = require('../facturacion/facturaConsulta.service');
const { hoyEnCostaRica } = require('../../utils/fechaCR');

/** Las facturas de cliente.id, tomado de la cuenta verificada en la base. */
async function facturasPendientes(clienteId) {
  const r = await query(`
    SELECT f.numero, f.fecha, f.fecha_vencimiento, f.total,
           f.condicion_venta, f.plazo_texto,
           ${COBRADO} AS cobrado,
           ${ACREDITADO} AS acreditado,
           ($2::date - f.fecha_vencimiento) AS dias_atraso
      FROM factura f
     WHERE f.cliente_id = $1
       AND f.estado = 'emitida'
       AND f.total - ${COBRADO} - ${ACREDITADO} > 1
     ORDER BY f.fecha_vencimiento ASC NULLS LAST, f.fecha ASC;
  `, [Number(clienteId), hoyEnCostaRica()]);

  const facturas = r.rows.map((f) => {
    const total = Number(f.total) || 0;
    const pagado = (Number(f.cobrado) || 0) + (Number(f.acreditado) || 0);
    const dias = f.dias_atraso === null ? null : Number(f.dias_atraso);

    return {
      numero: f.numero,
      fecha: f.fecha,
      vencimiento: f.fecha_vencimiento,
      total,
      // Lo abonado incluye lo acreditado por notas: para el cliente las dos
      // cosas son "ya no lo debo", y separarlas acá solo confunde.
      pagado: Math.round(pagado * 100) / 100,
      saldo: Math.round((total - pagado) * 100) / 100,
      condicion: f.condicion_venta,
      plazo: f.plazo_texto,
      diasVencida: dias !== null && dias > 0 ? dias : 0,
      vencida: dias !== null && dias > 0
    };
  });

  return {
    facturas,
    total: Math.round(facturas.reduce((s, f) => s + f.saldo, 0) * 100) / 100,
    vencido: Math.round(facturas.filter((f) => f.vencida).reduce((s, f) => s + f.saldo, 0) * 100) / 100,
    cantidad: facturas.length
  };
}

module.exports = { facturasPendientes };
