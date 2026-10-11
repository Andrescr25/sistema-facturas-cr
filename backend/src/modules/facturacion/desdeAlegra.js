/**
 * Traducción de una factura de venta de Alegra a la factura propia.
 *
 * Funciones puras. Nada se inventa ni se "arregla" en silencio: lo que no
 * calza se carga como está y se cuenta como aviso.
 *
 * LO QUE HAY QUE SABER DEL FORMATO DE ALEGRA
 *
 * - `status` mezcla dos cosas: si el documento existe (draft/void) y si ya se
 *   pagó (open/closed). Acá se separan: `estado` dice qué es el documento y el
 *   saldo dice cuánto debe. Medido sobre las 5.398: 5.161 closed, 71 open,
 *   24 draft, 132 void.
 * - `term` viene como TEXTO ("De contado"), no como el objeto con id que
 *   mandan los contactos. Se calza por nombre y, si no calza, se guarda el
 *   texto igual: es lo que decía el documento.
 * - El impuesto de cada línea arrastra el árbol contable completo de Alegra.
 *   De ahí solo sirven id, porcentaje y monto.
 * - `productKey` es el CABYS.
 * - Hay 12 documentos `saleTicket`: son tiquetes, no facturas, y Hacienda los
 *   trata distinto.
 */

const ESTADOS = { draft: 'borrador', open: 'emitida', closed: 'emitida', void: 'anulada' };
const TIPOS = { invoice: 'factura', saleTicket: 'tiquete' };
const CONDICIONES = { CASH: 'contado', CREDIT: 'credito' };
const { desdeAlegra: estadoFiscal, numeracionDesdeAlegra } = require('../../integrations/hacienda/historico');

const texto = (v, max) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

const numero = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Redondeo a dos decimales, para no arrastrar la basura del punto flotante. */
const dinero = (v) => Math.round(numero(v) * 100) / 100;

const soloFecha = (v) => (v ? String(v).slice(0, 10) : null);

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * La línea de la factura. Guarda copia fija de lo que se vendió: el nombre y
 * el precio de ese día, no los de hoy.
 */
function lineaDesdeAlegra(item, indice, { productos, impuestos }, avisos) {
  const impuestoAlegra = (item.tax || [])[0];
  const impuestoId = impuestoAlegra ? (impuestos.get(String(impuestoAlegra.id)) ?? null) : null;
  if (impuestoAlegra && impuestoId === null) avisos.add('impuesto_desconocido');

  const productoId = item.id === undefined || item.id === null
    ? null
    : (productos.get(String(item.id)) ?? null);
  if (productoId === null) avisos.add('producto_no_encontrado');

  const cantidad = numero(item.quantity);
  const precio = numero(item.price);
  const porcentajeDescuento = numero(item.discount);
  // Alegra manda el descuento como porcentaje; el monto se calcula para poder
  // sumar la factura sin volver a hacer la regla de tres en cada pantalla.
  const montoDescuento = dinero((cantidad * precio * porcentajeDescuento) / 100);

  return {
    numero_linea: indice + 1,
    producto_id: productoId,
    nombre: texto(item.name, 250) || '(sin nombre)',
    referencia: texto(item.reference, 100),
    descripcion: texto(item.description, 2000),
    cabys: texto(item.productKey, 13),
    unidad: texto(item.unit, 20),
    cantidad,
    precio_unitario: precio,
    descuento_porcentaje: porcentajeDescuento,
    descuento_monto: montoDescuento,
    impuesto_id: impuestoId,
    tarifa: impuestoAlegra ? numero(impuestoAlegra.percentage) : 0,
    impuesto_monto: dinero(impuestoAlegra?.amount),
    total: dinero(item.total),
    alegra_item_id: item.id === undefined || item.id === null ? null : String(item.id)
  };
}

/**
 * @param {object} factura  GET /invoices/:id
 * @param {object} contexto
 *   clientes   Map alegra_id → cliente.id
 *   productos  Map alegra_id → producto.id
 *   impuestos  Map alegra_id → impuesto.id
 *   plazos     Map nombre normalizado → plazo_credito.id
 *   metodos    Map código de Alegra → metodo_pago.id
 */
function facturaDesdeAlegra(factura, { clientes, productos, impuestos, plazos, metodos }) {
  if (!factura || factura.id === undefined || factura.id === null) {
    throw new Error('factura de Alegra sin id');
  }
  const avisos = new Set();

  const estado = ESTADOS[String(factura.status)] ?? null;
  if (!estado) avisos.add('estado_desconocido');

  const tipo = TIPOS[String(factura.numberTemplate?.documentType)] ?? 'factura';
  if (factura.numberTemplate?.documentType && !TIPOS[String(factura.numberTemplate.documentType)]) {
    avisos.add('tipo_documento_desconocido');
  }

  const clienteAlegra = factura.client || {};
  const clienteId = clienteAlegra.id === undefined || clienteAlegra.id === null
    ? null
    : (clientes.get(String(clienteAlegra.id)) ?? null);
  if (clienteId === null) avisos.add('cliente_no_encontrado');

  const condicion = CONDICIONES[String(factura.saleCondition)] ?? null;
  if (!condicion) avisos.add('sin_condicion_de_venta');

  const plazoTexto = texto(factura.term, 60);
  const plazoId = plazoTexto ? (plazos.get(normalizar(plazoTexto)) ?? null) : null;
  if (plazoTexto && plazoId === null) avisos.add('plazo_no_calza');

  const metodoTexto = texto(factura.paymentMethod, 40);
  const metodoId = metodoTexto ? (metodos.get(String(factura.paymentMethod)) ?? null) : null;
  if (metodoTexto && metodoId === null) avisos.add('metodo_pago_desconocido');

  const items = Array.isArray(factura.items) ? factura.items : [];
  if (items.length === 0 && estado !== 'anulada') avisos.add('sin_lineas');
  const lineas = items.map((item, i) => lineaDesdeAlegra(item, i, { productos, impuestos }, avisos));

  const total = dinero(factura.total);
  const subtotal = dinero(factura.subtotal);
  const descuento = dinero(factura.discount);
  const impuesto = dinero(factura.tax);
  // Si la suma no da el total, algo se está perdiendo al copiar. Se avisa en
  // vez de guardar una factura que no cuadra y descubrirlo en un reporte.
  if (Math.abs(subtotal - descuento + impuesto - total) > 1) avisos.add('los_totales_no_cuadran');

  const actividad = factura.economicActivity;
  const actividadCodigo = actividad && typeof actividad === 'object' ? (actividad.code ?? actividad.id) : actividad;

  const fila = {
    tipo_documento: tipo,
    ...numeracionDesdeAlegra(factura, tipo === 'tiquete' ? '04' : '01'),
    numero: texto(factura.numberTemplate?.fullNumber || factura.numberTemplate?.formattedNumber, 40),
    ...estadoFiscal(factura),
    clave_hacienda: texto(factura.stamp?.uuid, 60),
    estado: estado || 'emitida',
    fecha: soloFecha(factura.date),
    fecha_vencimiento: soloFecha(factura.dueDate),
    emitida_en: factura.datetime || null,

    cliente_id: clienteId,
    cliente_nombre: texto(clienteAlegra.name, 200) || '(sin nombre)',
    cliente_tipo_identificacion: texto(clienteAlegra.identificationObject?.type, 20),
    cliente_identificacion: texto(
      String(clienteAlegra.identificationObject?.number ?? clienteAlegra.identification ?? '').replace(/[\s-]/g, ''),
      20
    ),
    cliente_correo: texto(clienteAlegra.email, 160),

    condicion_venta: condicion,
    plazo_credito_id: plazoId,
    plazo_texto: plazoTexto,
    metodo_pago_id: metodoId,
    metodo_pago_texto: metodoTexto,

    moneda: texto(factura.currency?.code, 3) || 'CRC',
    subtotal,
    descuento,
    impuesto,
    total,
    total_pagado: dinero(factura.totalPaid),
    saldo: dinero(factura.balance),

    observaciones: texto(factura.observations, 4000),
    anotaciones: texto(factura.anotation, 4000),
    vendedor: texto(factura.seller?.name, 120),
    actividad_economica: actividadCodigo ? texto(String(actividadCodigo).replace(/\D/g, ''), 10) : null,
    anulada_por_nota: Boolean(factura.isVoidedByCreditNote),
    motivo_anulacion: null,

    alegra_id: String(factura.id)
  };

  return { fila, lineas, avisos: [...avisos] };
}

module.exports = { facturaDesdeAlegra, lineaDesdeAlegra, ESTADOS, TIPOS, CONDICIONES };
