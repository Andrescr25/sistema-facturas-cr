/**
 * Traducción de una nota de crédito de Alegra a la nota propia.
 *
 * Las líneas son iguales a las de una factura —lo que se devuelve es lo que se
 * vendió—, así que se reutiliza `lineaDesdeAlegra` en vez de escribir una
 * segunda versión de la misma regla.
 *
 * LO QUE HAY QUE SABER DEL FORMATO DE ALEGRA
 *
 * - `cause` es TEXTO LIBRE. En esta cuenta hay uno guardado como "error " con
 *   un espacio de más. Se normaliza para poder contar, y se guarda también tal
 *   como vino.
 * - `invoices` dice a qué facturas se aplicó y con cuánto a cada una.
 * - La nota electrónica lleva SU PROPIA SERIE (0010000103), distinta de la de
 *   facturas: ante Hacienda son documentos distintos.
 */

const { lineaDesdeAlegra } = require('./desdeAlegra');

const ESTADOS = { draft: 'borrador', open: 'emitida', closed: 'emitida', void: 'anulada' };

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

function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** El motivo, reducido a algo contable. Lo que no se reconoce queda como 'otro'. */
function motivoDe(causa) {
  const c = normalizar(causa);
  if (!c) return null;
  if (c.includes('error')) return 'error';
  if (c.includes('devol')) return 'devolucion';
  if (c.includes('anul')) return 'anulacion';
  if (c.includes('descuento') || c.includes('rebaja')) return 'descuento';
  return 'otro';
}

/**
 * @param {object} nota  GET /credit-notes
 * @param {object} contexto  mismos mapas que la factura, más `facturas`
 */
function notaDesdeAlegra(nota, { clientes, productos, impuestos, facturas }) {
  if (!nota || nota.id === undefined || nota.id === null) {
    throw new Error('nota de crédito de Alegra sin id');
  }
  const avisos = new Set();

  const estado = ESTADOS[String(nota.status)] ?? null;
  if (!estado) avisos.add('estado_desconocido');

  const clienteAlegra = nota.client || {};
  const clienteId = clienteAlegra.id === undefined || clienteAlegra.id === null
    ? null
    : (clientes.get(String(clienteAlegra.id)) ?? null);
  if (clienteId === null) avisos.add('cliente_no_encontrado');

  const motivo = motivoDe(nota.cause);
  if (!motivo) avisos.add('sin_motivo');
  else if (motivo === 'otro') avisos.add('motivo_no_reconocido');

  const items = Array.isArray(nota.items) ? nota.items : [];
  if (items.length === 0) avisos.add('sin_lineas');
  const lineas = items.map((item, i) => lineaDesdeAlegra(item, i, { productos, impuestos }, avisos));

  const aplicaciones = (Array.isArray(nota.invoices) ? nota.invoices : []).map(f => {
    const facturaId = f.id === undefined || f.id === null ? null : (facturas.get(String(f.id)) ?? null);
    if (facturaId === null) avisos.add('factura_no_encontrada');
    return {
      factura_id: facturaId,
      factura_numero: texto(f.fullNumber || f.number, 40),
      monto: dinero(f.amount)
    };
  });
  // La ficha individual puede acreditar un débito de ingreso en vez de una
  // factura. Sus enlaces viven aparte; el cargador no mezcla ambos ids.
  const debitos = Array.isArray(nota.incomeDebitNotes) ? nota.incomeDebitNotes : [];
  if (aplicaciones.length === 0 && debitos.length === 0) avisos.add('no_acredita_ninguna_factura');

  const total = dinero(nota.total);
  const aplicado = dinero(aplicaciones.reduce((s, a) => s + a.monto, 0) + debitos.reduce((s,d) => s + dinero(d.amount), 0));
  if (aplicaciones.length + debitos.length > 0 && Math.abs(aplicado - dinero(nota.totalApplied)) > 1) {
    avisos.add('lo_aplicado_no_calza_con_alegra');
  }

  const fila = {
    serie: texto(nota.numberTemplate?.prefix, 20),
    consecutivo: nota.numberTemplate?.number === undefined || nota.numberTemplate?.number === null
      ? null
      : Number(String(nota.numberTemplate.number).replace(/\D/g, '')) || null,
    numero: texto(nota.numberTemplate?.fullNumber || nota.numberTemplate?.formattedNumber, 40),
    electronica: Boolean(nota.numberTemplate?.isElectronic),
    clave_hacienda: texto(nota.stamp?.uuid, 60),
    estado: estado || 'emitida',
    fecha: nota.date ? String(nota.date).slice(0, 10) : null,

    cliente_id: clienteId,
    cliente_nombre: texto(clienteAlegra.name, 200) || '(sin nombre)',
    cliente_identificacion: texto(
      String(clienteAlegra.identificationObject?.number ?? clienteAlegra.identification ?? '').replace(/[\s-]/g, ''),
      20
    ),

    motivo,
    motivo_texto: texto(nota.cause, 120),

    subtotal: dinero(nota.subtotal),
    descuento: dinero(nota.discount),
    impuesto: dinero(nota.tax),
    total,
    total_aplicado: dinero(nota.totalApplied),
    saldo: dinero(nota.balance),

    observaciones: [texto(nota.observations, 2000), texto(nota.anotation, 2000)].filter(Boolean).join(' · ') || null,
    alegra_id: String(nota.id)
  };

  return { fila, lineas, aplicaciones, avisos: [...avisos] };
}

module.exports = { notaDesdeAlegra, motivoDe, ESTADOS };
