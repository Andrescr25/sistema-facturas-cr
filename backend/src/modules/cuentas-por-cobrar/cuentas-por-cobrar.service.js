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
const { enviarYRegistrar } = require('../envios-whatsapp/envios.service');
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

/**
 * El texto del recordatorio de saldo de un cliente.
 *
 * LO ARMA EL SERVIDOR, NO LA PANTALLA. Si el navegador mandara el texto, el
 * monto del mensaje podría no coincidir con el de la pantalla que lo originó
 * —basta con que el usuario tuviera la lista abierta desde antes de un
 * abono— y el cliente recibiría una cifra que ya no debe.
 *
 * Solo entran facturas con saldo mayor a cero: cobrarle a alguien una factura
 * ya pagada es peor que no escribirle.
 */
function textoRecordatorio(cliente, facturas) {
  const colones = (n) =>
    `₡${Math.round(Number(n) || 0).toLocaleString('es-CR').replace(/\u00A0/g, '.')}`;

  const pendientes = facturas
    .filter(f => f.saldo > 0)
    .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0));

  const lineas = pendientes.map(f => {
    const vencida = f.diasRestantes !== null && f.diasRestantes < 0;
    const cuando = vencida
      ? `vencida hace ${Math.abs(f.diasRestantes)} día(s)`
      : f.diasRestantes === null ? 'sin fecha de vencimiento'
      : f.diasRestantes === 0 ? 'vence hoy'
      : `vence en ${f.diasRestantes} día(s)`;
    return `• ${f.numeroFactura} — ${colones(f.saldo)} (${cuando})`;
  });

  const total = pendientes.reduce((s, f) => s + f.saldo, 0);

  return `Buenas ${cliente} 👋\n\n` +
    `Le recordamos su saldo pendiente con Distribuidora Tachi:\n\n` +
    `${lineas.join('\n')}\n\n` +
    `Total: ${colones(total)}\n\n` +
    `Cualquier consulta quedamos atentos. ¡Gracias!`;
}

/**
 * Le manda al cliente el recordatorio de lo que debe.
 *
 * El mensaje se puede editar en la pantalla antes de salir, pero el que se
 * propone sale de acá con los saldos de este momento.
 */
async function enviarRecordatorio(clienteId, { telefono, mensaje, usuarioId }) {
  const { data } = await listarCuentasPorCobrar({ cliente: String(clienteId) });
  const grupo = data.find(c => String(c.clienteId) === String(clienteId));

  if (!grupo || grupo.facturas.every(f => f.saldo <= 0)) {
    const e = new Error('Ese cliente no tiene saldo pendiente.');
    e.status = 400;
    throw e;
  }

  return enviarYRegistrar({
    tipo: 'saldo',
    referencia: String(clienteId),
    alegraContactId: String(clienteId),
    telefono,
    mensaje: mensaje || textoRecordatorio(grupo.clienteNombre, grupo.facturas),
    usuarioId
  });
}

/** El texto que se propone en la pantalla, sin mandar nada. */
async function propuestaRecordatorio(clienteId) {
  const { data } = await listarCuentasPorCobrar({ cliente: String(clienteId) });
  const grupo = data.find(c => String(c.clienteId) === String(clienteId));
  if (!grupo) {
    const e = new Error('Ese cliente no tiene saldo pendiente.');
    e.status = 404;
    throw e;
  }
  return {
    cliente: grupo.clienteNombre,
    totalSaldo: grupo.totalSaldo,
    mensaje: textoRecordatorio(grupo.clienteNombre, grupo.facturas)
  };
}

async function getAbonosPorFactura(alegraInvoiceId) {
  return prisma.abonoCobro.findMany({
    where: { alegraInvoiceId: String(alegraInvoiceId) },
    orderBy: { fecha: 'desc' }
  });
}

/**
 * Qué se le vendió en esta factura.
 *
 * NO VIVE EN EL ESPEJO LOCAL, Y ES A PROPÓSITO
 * `cuenta_por_cobrar` guarda solo lo que hace falta para cobrar —número,
 * fechas, total, saldo— porque el espejo se sincroniza entero y cargarlo con
 * las líneas de cada factura lo volvería pesado sin que nadie las mire en la
 * lista. Las líneas se piden a Alegra solo cuando alguien abre una factura,
 * que es la única vez que importan.
 *
 * Se devuelve la forma que espera la tabla compartida de productos, la misma
 * que usa Pagos a Proveedores: así las dos pantallas muestran el detalle
 * igual sin que cada una traduzca por su lado.
 */
async function getProductosDeFactura(alegraInvoiceId) {
  if (!alegraInvoiceId) throw httpError(400, 'alegraInvoiceId es requerido');

  const invoiceService = getInvoiceService();
  // getInvoiceById envuelve la respuesta en { success, data }; la factura
  // viene adentro. Leerla de la raíz devolvía cero líneas siempre.
  const respuesta = await invoiceService.getInvoiceById(String(alegraInvoiceId));
  const factura = respuesta?.data || respuesta;
  const items = Array.isArray(factura?.items) ? factura.items : [];

  return items.map((item, i) => {
    const cantidad = Number(item.quantity) || 0;
    const precioUnitario = Number(item.price) || 0;
    const descuento = Number(item.discount) || 0;
    // Alegra manda `total` por línea, pero no siempre: si falta se calcula,
    // porque una fila sin subtotal se lee como un error de la factura y no
    // como un dato que no vino.
    const total = item.total !== undefined && item.total !== null
      ? Number(item.total)
      : Number((cantidad * precioUnitario * (1 - descuento / 100)).toFixed(2));

    return {
      id: item.id ?? `linea-${i}`,
      // La referencia llega como texto plano en unas facturas y como objeto
      // en otras, según por dónde se creó la línea.
      codigo: item.reference?.reference || item.reference || null,
      descripcion: item.name || item.description || 'Producto sin nombre',
      cantidad,
      precioUnitario,
      descuento,
      total
    };
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

// ==================== CUADRE DE CAJA — COBROS POR DÍA ====================

/**
 * Devuelve los abonos registrados en un día específico, agrupados por método
 * de pago, para el cuadre de caja diario.
 *
 * @param {string} fechaStr - Fecha en formato YYYY-MM-DD
 */
async function obtenerCobrosPorDia(fechaStr) {
  if (!fechaStr) throw httpError(400, 'La fecha es requerida');

  const inicio = new Date(fechaStr + 'T00:00:00.000Z');
  const fin = new Date(fechaStr + 'T23:59:59.999Z');

  if (isNaN(inicio.getTime())) throw httpError(400, 'Fecha inválida');

  const cobros = await prisma.abonoCobro.findMany({
    where: {
      fecha: { gte: inicio, lte: fin }
    },
    orderBy: { fecha: 'desc' }
  });

  // Agrupar por método de pago
  const porMetodo = {};
  let totalDia = 0;

  for (const cobro of cobros) {
    const metodo = cobro.metodoPago || 'otros';
    if (!porMetodo[metodo]) {
      porMetodo[metodo] = { monto: 0, cantidad: 0 };
    }
    porMetodo[metodo].monto += Number(cobro.monto) || 0;
    porMetodo[metodo].cantidad += 1;
    totalDia += Number(cobro.monto) || 0;
  }

  return {
    fecha: fechaStr,
    cobros,
    resumen: {
      total: totalDia,
      cantidadCobros: cobros.length,
      porMetodo
    }
  };
}

module.exports = {
  enviarRecordatorio,
  propuestaRecordatorio,
  textoRecordatorio,
  httpError,
  sincronizarDesdeAlegra,
  listarCuentasPorCobrar,
  getAbonosPorFactura,
  getProductosDeFactura,
  registrarAbono,
  obtenerCobrosPorDia
};
