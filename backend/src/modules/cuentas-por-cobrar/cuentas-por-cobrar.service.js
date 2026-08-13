/**
 * Cuentas por Cobrar - Service
 *
 * Alegra es la fuente de verdad del saldo de cada factura de venta
 * (invoice.balance/totalPaid). Este módulo mantiene un espejo local
 * (CuentaPorCobrar) porque /invoices es lenta de recorrer en vivo (máx 30
 * registros por página en la API de Alegra) — la UI lee del espejo, y los
 * abonos se escriben primero en Alegra y solo si eso tiene éxito se guarda
 * la bitácora local (AbonoCobro).
 */

const prisma = require('../../../lib/prisma');
const { getClient, getInvoiceService } = require('../../integrations/alegra');

const client = getClient();

const LIMIT_INVOICES = 30; // máximo que acepta /invoices en Alegra
const CUENTA_CAJA_ID = '2'; // "Caja general" — misma cuenta usada en el cierre histórico

// Clientes ocultos permanentemente del módulo: casos sin solución técnica vía
// API. El saldo real en Alegra no cambia, solo se excluyen del espejo local
// para que no aparezcan en la vista.
const CLIENTES_OCULTOS = new Set([
  '176' // ADITA OROZCO CAMPOS — sus facturas son electrónicas (inmutables, código
        // 3070 de Alegra), no se pueden re-vincular a un contacto nuevo ni pagar
        // cruzado (código 4030). El usuario decidió no emitir NC porque
        // notificaría al cliente vía Hacienda, así que queda como excepción
        // permanente oculta en vez de deuda visible sin acción posible.
]);

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ==================== SINCRONIZACIÓN DESDE ALEGRA ====================

// Alegra devuelve de vez en cuando un 500 genérico ("Ha ocurrido un error")
// bajo paginación intensiva y sostenida — una llamada aislada funciona, así
// que se reintenta la página completa acá (el requestWithRetry del cliente
// no reintenta 500) con una pausa fija entre páginas.
async function obtenerPaginaConReintento(start, intentos = 5) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await client.api.get('/invoices', {
        params: { status: 'open', limit: LIMIT_INVOICES, start, order_field: 'date', order_direction: 'DESC' }
      });
    } catch (error) {
      if (intento === intentos) throw error;
      const delay = 1500 * intento;
      console.log(`   ⚠️ [CxC] Error en página start=${start} (${error.response?.status || error.code}), reintentando en ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function obtenerFacturasAbiertasDeAlegra() {
  const todas = [];
  let start = 0;
  while (true) {
    const res = await obtenerPaginaConReintento(start);
    todas.push(...res.data);
    if (res.data.length < LIMIT_INVOICES) break;
    start += LIMIT_INVOICES;
    await new Promise(r => setTimeout(r, 250)); // pausa entre páginas
  }
  return todas.filter(f => !f.isVoidedByCreditNote && Number(f.balance) > 0 && f.client?.id && !CLIENTES_OCULTOS.has(String(f.client.id)));
}

/**
 * Trae las facturas abiertas de Alegra y refresca la tabla local: upsert de
 * las que siguen con saldo, borra las que ya no vienen (se pagaron/cerraron
 * por fuera de este sistema).
 */
async function sincronizarDesdeAlegra() {
  console.log('🔄 [CxC] Sincronizando cuentas por cobrar desde Alegra...');
  const facturas = await obtenerFacturasAbiertasDeAlegra();

  const idsVigentes = facturas.map(f => String(f.id));

  for (const f of facturas) {
    await prisma.cuentaPorCobrar.upsert({
      where: { alegraInvoiceId: String(f.id) },
      create: {
        alegraInvoiceId: String(f.id),
        numeroFactura: f.numberTemplate?.fullNumber || f.numberTemplate?.number || String(f.id),
        clienteId: String(f.client.id),
        clienteNombre: f.client?.name || 'Cliente sin nombre',
        fechaEmision: new Date(f.date),
        fechaVencimiento: new Date(f.dueDate || f.date),
        total: Number(f.total) || 0,
        totalPagado: Number(f.totalPaid) || 0,
        saldo: Number(f.balance) || 0,
        condicionVenta: f.saleCondition || null,
        plazo: f.term || null,
        estadoAlegra: f.status || 'open'
      },
      update: {
        numeroFactura: f.numberTemplate?.fullNumber || f.numberTemplate?.number || String(f.id),
        clienteNombre: f.client?.name || 'Cliente sin nombre',
        fechaVencimiento: new Date(f.dueDate || f.date),
        total: Number(f.total) || 0,
        totalPagado: Number(f.totalPaid) || 0,
        saldo: Number(f.balance) || 0,
        condicionVenta: f.saleCondition || null,
        plazo: f.term || null,
        estadoAlegra: f.status || 'open',
        syncedAt: new Date()
      }
    });
  }

  const eliminadas = await prisma.cuentaPorCobrar.deleteMany({
    where: { alegraInvoiceId: { notIn: idsVigentes } }
  });

  console.log(`✅ [CxC] Sync completo: ${facturas.length} facturas vigentes, ${eliminadas.count} removidas (pagadas/cerradas).`);
  return { vigentes: facturas.length, removidas: eliminadas.count };
}

// ==================== LECTURA / AGRUPACIÓN ====================

function calcularDiasRestantes(fechaVencimiento) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento);
  venc.setHours(0, 0, 0, 0);
  return Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function derivarEstado(cuenta, diasRestantes) {
  if (Number(cuenta.totalPagado) > 0) return 'PARCIAL';
  if (diasRestantes < 0) return 'VENCIDA';
  return 'PENDIENTE';
}

function aplicarFiltroDias(facturas, filtros) {
  let min = filtros.diasMin !== undefined ? Number(filtros.diasMin) : null;
  let max = filtros.diasMax !== undefined ? Number(filtros.diasMax) : null;
  const preset = filtros.dias;

  if (preset && preset !== 'todos') {
    switch (preset) {
      case 'vence7': min = 0; max = 7; break;
      case 'vence15': min = 0; max = 15; break;
      case 'vence30': min = 0; max = 30; break;
      case 'vencidas': max = -1; break;
      default: break;
    }
  }

  return facturas.filter(f => {
    if (min !== null && f.diasRestantes < min) return false;
    if (max !== null && f.diasRestantes > max) return false;
    if (filtros.soloVencidas && f.diasRestantes >= 0) return false;
    return true;
  });
}

function prepararFactura(cuenta) {
  const diasRestantes = calcularDiasRestantes(cuenta.fechaVencimiento);
  return {
    alegraInvoiceId: cuenta.alegraInvoiceId,
    numeroFactura: cuenta.numeroFactura,
    fechaEmision: cuenta.fechaEmision,
    fechaVencimiento: cuenta.fechaVencimiento,
    total: Number(cuenta.total) || 0,
    totalPagado: Number(cuenta.totalPagado) || 0,
    saldo: Number(cuenta.saldo) || 0,
    condicionVenta: cuenta.condicionVenta,
    plazo: cuenta.plazo,
    diasRestantes,
    estado: derivarEstado(cuenta, diasRestantes)
  };
}

async function listarCuentasPorCobrar(filtros = {}) {
  const where = {};
  if (filtros.search) {
    where.OR = [
      { clienteNombre: { contains: filtros.search, mode: 'insensitive' } },
      { numeroFactura: { contains: filtros.search, mode: 'insensitive' } }
    ];
  }
  if (filtros.cliente && filtros.cliente !== 'todos') {
    where.clienteId = filtros.cliente;
  }

  const cuentas = await prisma.cuentaPorCobrar.findMany({
    where,
    orderBy: { fechaVencimiento: 'asc' }
  });

  const facturasPreparadas = cuentas.map(prepararFactura);
  const facturasFiltradas = aplicarFiltroDias(facturasPreparadas, filtros)
    .filter(f => !filtros.estado || filtros.estado === 'todos' || f.estado === filtros.estado.toUpperCase());

  const cuentasPorId = new Map(cuentas.map(c => [c.alegraInvoiceId, c]));

  const clientesMap = new Map();
  for (const factura of facturasFiltradas) {
    const cuenta = cuentasPorId.get(factura.alegraInvoiceId);
    if (!clientesMap.has(cuenta.clienteId)) {
      clientesMap.set(cuenta.clienteId, {
        clienteId: cuenta.clienteId,
        clienteNombre: cuenta.clienteNombre,
        facturas: [],
        totalSaldo: 0
      });
    }
    const grupo = clientesMap.get(cuenta.clienteId);
    grupo.facturas.push(factura);
    grupo.totalSaldo += factura.saldo;
  }

  const clientes = [...clientesMap.values()].sort((a, b) => b.totalSaldo - a.totalSaldo);

  const resumen = {
    totalClientes: clientes.length,
    totalFacturas: facturasFiltradas.length,
    totalPorCobrar: facturasFiltradas.reduce((s, f) => s + f.saldo, 0),
    totalVencido: facturasFiltradas.filter(f => f.estado === 'VENCIDA').reduce((s, f) => s + f.saldo, 0),
    proximasAVencer: {
      cantidad: facturasFiltradas.filter(f => f.diasRestantes >= 0 && f.diasRestantes <= 7).length,
      monto: facturasFiltradas.filter(f => f.diasRestantes >= 0 && f.diasRestantes <= 7).reduce((s, f) => s + f.saldo, 0)
    }
  };

  return { data: clientes, resumen };
}

async function getAbonosPorFactura(alegraInvoiceId) {
  return prisma.abonoCobro.findMany({
    where: { alegraInvoiceId: String(alegraInvoiceId) },
    orderBy: { fecha: 'desc' }
  });
}

// ==================== REGISTRAR ABONO ====================

/**
 * @param {object} datos
 * @param {boolean} [datos.saldarTotal] - salda la factura completa. El monto
 *   NO se toma del cliente sino del saldo que Alegra reporta en este momento:
 *   el espejo local puede tener minutos de atraso y un monto viejo sería
 *   rechazado (si el saldo bajó) o dejaría un resto de céntimos (si subió).
 *   Es la diferencia entre "pagá ₡X" y "dejá esta factura en cero".
 */
async function registrarAbono({ alegraInvoiceId, monto, fecha, metodoPago, saldarTotal = false }) {
  if (!alegraInvoiceId) throw httpError(400, 'alegraInvoiceId es requerido');
  const montoNum = Number(monto);
  if (!saldarTotal && (!montoNum || montoNum <= 0)) throw httpError(400, 'El monto del abono debe ser mayor a 0');
  if (!metodoPago) throw httpError(400, 'El método de pago es requerido');

  // Releer el saldo real de Alegra antes de aplicar el abono — nunca confiar
  // en lo que mandó el cliente ni en el espejo local, que puede estar unos
  // minutos desactualizado.
  const invoiceService = getInvoiceService();
  const facturaResult = await invoiceService.getInvoiceById(alegraInvoiceId);
  if (!facturaResult.success) {
    throw httpError(404, 'No se pudo obtener la factura en Alegra');
  }
  const factura = facturaResult.data;
  const saldoActual = Number(factura.balance) || 0;

  if (saldoActual <= 0) {
    throw httpError(409, 'Esta factura ya no tiene saldo pendiente en Alegra');
  }
  if (!saldarTotal && montoNum > saldoActual) {
    throw httpError(400, `El monto supera el saldo pendiente (₡${saldoActual.toLocaleString('es-CR')})`);
  }

  // Saldar total usa el saldo recién leído de Alegra, no el que mandó el
  // navegador.
  const montoFinal = saldarTotal ? saldoActual : montoNum;

  const fechaAbono = fecha ? new Date(fecha) : new Date();

  // ⚠️ SIN reintento: POST /payments no es idempotente. Un timeout de red no
  // significa que Alegra no haya procesado la petición — reintentarlo puede
  // duplicar el abono (ya pasó durante el cierre masivo de cartera). Ante
  // cualquier error acá es más seguro fallar y que el usuario reintente a
  // mano tras revisar el estado real de la factura en Alegra.
  let pagoAlegra;
  try {
    const res = await client.api.post('/payments', {
      date: fechaAbono.toISOString().slice(0, 10),
      type: 'in',
      client: { id: factura.client?.id },
      paymentMethod: metodoPago,
      bankAccount: { id: CUENTA_CAJA_ID },
      invoices: [{ id: alegraInvoiceId, amount: montoFinal }]
    });
    pagoAlegra = res.data;
  } catch (error) {
    const alegraMsg = error.response?.data?.message;
    console.error('❌ [CxC] Error creando pago en Alegra:', error.response?.data || error.message);
    throw httpError(error.response?.status || 502, alegraMsg || 'No se pudo registrar el pago en Alegra');
  }

  // Alegra aceptó el pago — ahora sí se guarda la bitácora local.
  const abono = await prisma.abonoCobro.create({
    data: {
      alegraInvoiceId: String(alegraInvoiceId),
      alegraPaymentId: String(pagoAlegra.id),
      clienteId: factura.client?.id ? String(factura.client.id) : null,
      clienteNombre: factura.client?.name || '',
      numeroFactura: factura.numberTemplate?.fullNumber || factura.numberTemplate?.number || String(alegraInvoiceId),
      monto: montoFinal,
      fecha: fechaAbono,
      metodoPago
    }
  });

  // Refrescar (o borrar si quedó saldada) el espejo local con el saldo real
  // que Alegra ya recalculó tras aceptar el pago.
  const nuevoSaldo = saldoActual - montoFinal;
  if (nuevoSaldo <= 0) {
    await prisma.cuentaPorCobrar.deleteMany({ where: { alegraInvoiceId: String(alegraInvoiceId) } });
  } else {
    await prisma.cuentaPorCobrar.updateMany({
      where: { alegraInvoiceId: String(alegraInvoiceId) },
      data: {
        totalPagado: (Number(factura.totalPaid) || 0) + montoFinal,
        saldo: nuevoSaldo,
        syncedAt: new Date()
      }
    });
  }

  return { abono, saldoRestante: Math.max(nuevoSaldo, 0) };
}

module.exports = {
  httpError,
  sincronizarDesdeAlegra,
  listarCuentasPorCobrar,
  getAbonosPorFactura,
  registrarAbono
};
