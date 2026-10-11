/**
 * Traducción de un pago de Alegra al cobro propio.
 *
 * Funciones puras. Nada se inventa: lo que no calza se carga igual y se cuenta
 * como aviso.
 *
 * LO QUE HAY QUE SABER DEL FORMATO DE ALEGRA
 *
 * - `type` separa el cobro del pago a proveedor: 'in' entra, 'out' sale. Acá
 *   solo se copian los de entrada; los otros son cuentas por pagar y viven en
 *   su propia sección.
 * - `paymentMethod` viene en MINÚSCULAS ("cash"), al revés que en las
 *   facturas, donde llega "CASH". Por eso el mapa de métodos acepta las dos
 *   grafías (ver cargar-pagos.js).
 * - `invoices` es la lista de facturas a las que se aplicó, con el monto
 *   aplicado a cada una. Un mismo cobro puede repartirse entre varias: el
 *   cliente llega y abona contra tres facturas.
 * - `bankAccount` es la cuenta de dinero donde entró la plata.
 */

const texto = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dinero = (v) => Math.round(numero(v) * 100) / 100;

/** ¿Es plata que ENTRA? Lo demás es pago a proveedor. */
const esCobro = (pago) => String(pago?.type || 'in') === 'in';

/**
 * @param {object} pago  GET /payments
 * @param {object} contexto
 *   clientes  Map alegra_id → cliente.id
 *   metodos   Map clave de Alegra → metodo_pago.id (las dos grafías)
 *   cuentas   Map alegra_id → cuenta_dinero.id
 *   facturas  Map alegra_id → factura.id
 */
function pagoDesdeAlegra(pago, { clientes, metodos, cuentas, facturas }) {
  if (!pago || pago.id === undefined || pago.id === null) {
    throw new Error('pago de Alegra sin id');
  }
  const avisos = new Set();
  if (!esCobro(pago)) avisos.add('no_es_cobro');

  const clienteAlegra = pago.client || {};
  const clienteId = clienteAlegra.id === undefined || clienteAlegra.id === null
    ? null
    : (clientes.get(String(clienteAlegra.id)) ?? null);
  if (clienteId === null) avisos.add('cliente_no_encontrado');

  const metodoTexto = texto(pago.paymentMethod, 40);
  const metodoId = metodoTexto ? (metodos.get(String(pago.paymentMethod)) ?? null) : null;
  if (metodoTexto && metodoId === null) avisos.add('metodo_pago_desconocido');

  const cuentaAlegra = pago.bankAccount || {};
  const cuentaId = cuentaAlegra.id === undefined || cuentaAlegra.id === null
    ? null
    : (cuentas.get(String(cuentaAlegra.id)) ?? null);
  if (cuentaAlegra.id && cuentaId === null) avisos.add('cuenta_desconocida');

  const aplicaciones = (Array.isArray(pago.invoices) ? pago.invoices : []).map(f => {
    const facturaId = f.id === undefined || f.id === null ? null : (facturas.get(String(f.id)) ?? null);
    if (facturaId === null) avisos.add('factura_no_encontrada');
    return {
      factura_id: facturaId,
      factura_numero: texto(f.number, 40),
      monto: dinero(f.amount)
    };
  });
  if (aplicaciones.length === 0) avisos.add('cobro_sin_factura');

  const monto = dinero(pago.amount);
  const aplicado = dinero(aplicaciones.reduce((s, a) => s + a.monto, 0));
  // Si lo aplicado no suma el cobro, el saldo de alguna factura va a quedar
  // mal. Se avisa en vez de descubrirlo cobrando dos veces.
  if (aplicaciones.length > 0 && Math.abs(aplicado - monto) > 1) avisos.add('lo_aplicado_no_suma_el_cobro');

  const observaciones = [texto(pago.observations, 2000), texto(pago.anotation, 2000)]
    .filter(Boolean)
    .join(' · ') || null;

  return {
    fila: {
      numero: texto(pago.number, 40),
      fecha: pago.date ? String(pago.date).slice(0, 10) : null,
      cliente_id: clienteId,
      cliente_nombre: texto(clienteAlegra.name, 200) || '(sin nombre)',
      metodo_pago_id: metodoId,
      metodo_pago_texto: metodoTexto,
      cuenta_dinero_id: cuentaId,
      cuenta_texto: texto(cuentaAlegra.name, 80),
      // Alegra no guarda el número de SINPE en un campo propio: cuando existe,
      // viene escrito en las observaciones. No se adivina.
      referencia: null,
      monto,
      observaciones,
      anulado: String(pago.status) === 'void',
      motivo_anulacion: null,
      alegra_id: String(pago.id)
    },
    aplicaciones,
    avisos: [...avisos]
  };
}

module.exports = { pagoDesdeAlegra, esCobro };
