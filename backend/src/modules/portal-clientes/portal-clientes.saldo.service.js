/**
 * Portal de clientes - Sus facturas pendientes.
 *
 * Sale del espejo local `cuentas_por_cobrar`, el mismo que ve la casa en su
 * pantalla de Cuentas por Cobrar, y que se sincroniza desde Alegra cada 30
 * minutos. No se consulta Alegra en vivo: el cliente abre esto desde el
 * teléfono y no puede esperar una paginación de la API.
 *
 * EL FILTRO POR CLIENTE SALE DEL TOKEN, nunca de la petición. Es la
 * diferencia entre que alguien vea lo que debe y que vea lo que deben los
 * demás negocios del pueblo.
 *
 * QUÉ NO SE MUESTRA: nada de márgenes, costos ni el estado interno del cobro
 * (gestiones, notas). Solo lo que el propio cliente ya sabe o debería saber:
 * qué factura, de cuándo, cuánto era, cuánto abonó y cuánto queda.
 */

const { query } = require('./portal-clientes.auth');

async function facturasPendientes(alegraContactId) {
  const r = await query(`
    SELECT numero_factura, fecha_emision, fecha_vencimiento,
           total, total_pagado, saldo, condicion_venta, plazo
    FROM cuentas_por_cobrar
    WHERE cliente_id = $1 AND saldo > 0
    ORDER BY fecha_vencimiento ASC, fecha_emision ASC;
  `, [String(alegraContactId)]);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const facturas = r.rows.map(f => {
    const vence = f.fecha_vencimiento ? new Date(f.fecha_vencimiento) : null;
    if (vence) vence.setHours(0, 0, 0, 0);
    // Días en positivo = ya venció. La resta va sobre medianoche local, no
    // sobre la hora exacta: si no, una factura que vence hoy aparecería
    // vencida o al día según la hora en que se mire.
    const dias = vence ? Math.round((hoy - vence) / 86400000) : null;

    return {
      numero: f.numero_factura,
      fecha: f.fecha_emision,
      vencimiento: f.fecha_vencimiento,
      total: Number(f.total) || 0,
      pagado: Number(f.total_pagado) || 0,
      saldo: Number(f.saldo) || 0,
      condicion: f.condicion_venta,
      plazo: f.plazo,
      diasVencida: dias !== null && dias > 0 ? dias : 0,
      vencida: dias !== null && dias > 0
    };
  });

  return {
    facturas,
    total: Math.round(facturas.reduce((s, f) => s + f.saldo, 0) * 100) / 100,
    vencido: Math.round(facturas.filter(f => f.vencida).reduce((s, f) => s + f.saldo, 0) * 100) / 100,
    cantidad: facturas.length
  };
}

module.exports = { facturasPendientes };
