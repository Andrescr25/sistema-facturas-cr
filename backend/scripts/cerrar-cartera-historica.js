/**
 * Fase 0, paso 3 — Cierre único de la cartera histórica de Alegra.
 *
 * Agrupa las facturas abiertas por cliente y crea UN pago por cliente que
 * cubre todas sus facturas pendientes, dejándolas en balance:0. Es el punto
 * de partida "limpio" acordado con el usuario: a partir de la fecha de
 * corte, todo lo nuevo se cobra usando el módulo de Cuentas por Cobrar.
 *
 * ⚠️ ESCRIBE en la contabilidad de producción. No es fácil de revertir.
 *
 * Requisitos antes de correr esto:
 *   1. node scripts/exportar-cartera-abierta.js  (respaldo obligatorio)
 *
 * Uso:
 *   node scripts/cerrar-cartera-historica.js --dry-run              (no escribe nada, solo muestra el plan)
 *   node scripts/cerrar-cartera-historica.js --solo-cliente=38      (probar con un solo cliente)
 *   node scripts/cerrar-cartera-historica.js --limit=20             (procesar solo 20 clientes en esta corrida)
 *   node scripts/cerrar-cartera-historica.js                        (procesar todo lo que falte)
 *   node scripts/cerrar-cartera-historica.js --fecha=2026-08-10      (fecha del pago, default hoy)
 *
 * Reanudable: guarda progreso en scripts/salida/cierre-progreso.json y salta
 * los clientes ya procesados si se corta a mitad de camino.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getClient } = require('../src/integrations/alegra');

const client = getClient();
const SALIDA_DIR = path.join(__dirname, 'salida');
const PROGRESO_PATH = path.join(SALIDA_DIR, 'cierre-progreso.json');
const MAX_INVOICES_POR_PAGO = 25; // margen defensivo, sin evidencia de tope real de Alegra
const PAUSA_MS = 400;
const CUENTA_CAJA_ID = '2'; // "Caja general" (ver bank-accounts)

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const soloClienteArg = args.find(a => a.startsWith('--solo-cliente='));
const SOLO_CLIENTE = soloClienteArg ? soloClienteArg.split('=')[1] : null;
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT_CLIENTES = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
// Fija (no "hoy") a propósito: esta operación viene corriendo en varias
// corridas a lo largo de más de un día. Si usara la fecha del sistema, cada
// corrida generaría pagos con fecha distinta y buscarPagoYaCreado dejaría de
// encontrar los pagos de corridas anteriores (pasó exactamente eso al cruzar
// la medianoche: el pago de ayer no matcheaba contra "hoy"). Todos los pagos
// de este cierre deben compartir una sola fecha de corte, como corresponde
// a una única decisión contable de "arrancar limpio desde acá".
const fechaArg = args.find(a => a.startsWith('--fecha='));
const FECHA_CORTE = fechaArg ? fechaArg.split('=')[1] : '2026-08-09';

function cargarProgreso() {
  if (!fs.existsSync(PROGRESO_PATH)) return { procesados: {}, omitidos: {} };
  const progreso = JSON.parse(fs.readFileSync(PROGRESO_PATH, 'utf8'));
  if (!progreso.omitidos) progreso.omitidos = {};
  return progreso;
}

function guardarProgreso(progreso) {
  fs.writeFileSync(PROGRESO_PATH, JSON.stringify(progreso, null, 2));
}

// Volver a traer las ~4.000 facturas abiertas completas en cada corrida
// costaba ~12 minutos SOLO en la lectura, antes de tocar un cliente — puro
// desperdicio, porque ya existe el respaldo (exportar-cartera-abierta.js) con
// exactamente esos mismos datos. Se usa el respaldo como fuente y se
// arranca directo en los clientes pendientes. Si algún monto quedó
// desactualizado (el cliente pagó algo por fuera mientras tanto), Alegra
// rechaza esa factura puntual con un error claro en vez de aplicarla mal —
// mismo camino seguro que ya maneja buscarPagoYaCreado ante cualquier error.
function cargarFacturasDesdeRespaldo() {
  const archivos = fs.readdirSync(SALIDA_DIR).filter(f => f.startsWith('cartera-abierta-') && f.endsWith('.json'));
  if (archivos.length === 0) {
    throw new Error('No hay respaldo en scripts/salida/. Corré primero: node scripts/exportar-cartera-abierta.js');
  }
  const masReciente = archivos.sort().pop();
  const filas = JSON.parse(fs.readFileSync(path.join(SALIDA_DIR, masReciente), 'utf8'));
  return filas
    .filter(f => !f.isVoidedByCreditNote && Number(f.balance) > 0 && f.cliente_id)
    .map(f => ({
      id: f.alegra_id,
      balance: f.balance,
      client: { id: f.cliente_id, name: f.cliente_nombre }
    }));
}

function agruparPorCliente(facturas) {
  const grupos = new Map();
  for (const f of facturas) {
    const clienteId = f.client?.id;
    if (!clienteId) continue; // sin cliente asociado, no se puede cerrar por este medio
    if (!grupos.has(clienteId)) {
      grupos.set(clienteId, { clienteId, clienteNombre: f.client?.name || '', facturas: [] });
    }
    grupos.get(clienteId).facturas.push(f);
  }
  return [...grupos.values()];
}

function partirEnLotes(facturas, tam) {
  const lotes = [];
  for (let i = 0; i < facturas.length; i += tam) {
    lotes.push(facturas.slice(i, i + tam));
  }
  return lotes;
}

const OBSERVACION_CIERRE = 'Cierre de cartera histórica — ajuste inicial al adoptar Cuentas por Cobrar';

// Ante un error creando el pago (típicamente timeout de 30s bajo la carga
// sostenida de este cierre), NO hay forma de saber por la excepción sola si
// Alegra procesó la petición o no. En vez de reintentar a ciegas (eso fue lo
// que duplicó el pago de EL LLANO) se revisa solo-lectura si ya existe un
// pago de este cierre con el mismo monto para este cliente en la fecha de
// corte. Si existe, se asume que esta petición sí llegó a procesarse.
//
// La propia consulta de verificación puede dar un falso negativo si corre
// demasiado pronto (visto en vivo: SUPER EL CARMEN PUERTO — el pago #939 no
// aparecía en la primera consulta, pero sí un momento después). Por eso
// reintenta varias veces con pausa antes de concluir que no se creó.
async function buscarPagoYaCreado(clienteId, montoTotal, intentos = 4) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const res = await client.api.get('/payments', {
        params: { client_id: clienteId, limit: 5, order_field: 'date', order_direction: 'DESC' }
      });
      const encontrado = res.data.find(p =>
        p.date === FECHA_CORTE &&
        p.observations === OBSERVACION_CIERRE &&
        Math.abs(Number(p.amount) - montoTotal) < 1
      );
      if (encontrado) return encontrado;
    } catch (error) {
      console.log(`   ⚠️ Verificación intento ${intento}/${intentos} falló (${error.response?.status || error.code})`);
    }
    if (intento < intentos) await new Promise(r => setTimeout(r, 4000 * intento));
  }
  return null;
}

async function cerrarCliente(grupo, progreso) {
  const lotes = partirEnLotes(grupo.facturas, MAX_INVOICES_POR_PAGO);
  const pagosCreados = [];

  for (const lote of lotes) {
    const montoTotal = lote.reduce((sum, f) => sum + Number(f.balance), 0);
    const payload = {
      date: FECHA_CORTE,
      type: 'in',
      client: { id: grupo.clienteId },
      paymentMethod: 'cash',
      bankAccount: { id: CUENTA_CAJA_ID },
      observations: OBSERVACION_CIERRE,
      invoices: lote.map(f => ({ id: f.id, amount: Number(f.balance) }))
    };

    if (DRY_RUN) {
      console.log(`   [dry-run] Pago de ₡${montoTotal.toLocaleString('es-CR')} sobre ${lote.length} factura(s)`);
      continue;
    }

    // ⚠️ SIN reintento automático de la escritura en sí: POST /payments no es
    // idempotente. Ante error se verifica solo-lectura (buscarPagoYaCreado)
    // en vez de repetir la escritura a ciegas.
    let pagoId;
    try {
      const res = await client.api.post('/payments', payload);
      pagoId = res.data.id;
    } catch (error) {
      console.log(`   ⚠️ Error creando pago (${error.response?.status || error.code}), verificando en Alegra si ya se creó...`);
      const yaExiste = await buscarPagoYaCreado(grupo.clienteId, montoTotal);
      if (yaExiste) {
        pagoId = yaExiste.id;
        console.log(`   ✅ Verificado: el pago #${pagoId} sí se había creado a pesar del error de red.`);
      } else if (error.response?.data?.message?.includes('deshabilitado')) {
        // Rechazo real y definitivo de Alegra (contacto inactivo), no un
        // problema de timing — reintentar no lo va a arreglar. Se omite este
        // cliente y se sigue con el resto en vez de frenar todo el cierre.
        throw Object.assign(error, {
          _omitir: `Contacto deshabilitado en Alegra — no se pudo crear el pago. Requiere reactivar el contacto o resolver manualmente.`
        });
      } else {
        throw Object.assign(error, {
          _cierreContext: `Fallo creando pago para cliente ${grupo.clienteId} (${grupo.clienteNombre}) — lote de ${lote.length} factura(s) por ₡${montoTotal.toLocaleString('es-CR')}. Verificado en Alegra: NO se creó. Corregí el problema antes de volver a correr el script.`
        });
      }
    }
    console.log(`   ✅ Pago #${pagoId} — ₡${montoTotal.toLocaleString('es-CR')} sobre ${lote.length} factura(s)`);
    pagosCreados.push(pagoId);
    await new Promise(r => setTimeout(r, PAUSA_MS));
  }

  if (!DRY_RUN) {
    progreso.procesados[grupo.clienteId] = {
      clienteNombre: grupo.clienteNombre,
      facturas: grupo.facturas.length,
      pagos: pagosCreados,
      fecha: new Date().toISOString()
    };
    guardarProgreso(progreso);
  }
}

async function main() {
  console.log('🔒 Cierre de cartera histórica\n');
  console.log(`   Modo: ${DRY_RUN ? 'DRY-RUN (no escribe nada)' : '⚠️ REAL — va a crear pagos en Alegra'}`);
  console.log(`   Fecha de corte: ${FECHA_CORTE}`);
  if (SOLO_CLIENTE) console.log(`   Filtrado a un solo cliente: ${SOLO_CLIENTE}`);
  if (LIMIT_CLIENTES !== Infinity) console.log(`   Límite de esta corrida: ${LIMIT_CLIENTES} cliente(s)`);
  console.log('');

  console.log('📥 Cargando facturas desde el respaldo local (sin re-consultar Alegra)...');
  const facturas = cargarFacturasDesdeRespaldo();
  console.log(`   ${facturas.length} facturas con saldo > 0 en el respaldo\n`);

  let grupos = agruparPorCliente(facturas);
  if (SOLO_CLIENTE) {
    grupos = grupos.filter(g => g.clienteId === SOLO_CLIENTE);
  }

  const progreso = cargarProgreso();
  const pendientes = grupos.filter(g => !progreso.procesados[g.clienteId] && !progreso.omitidos[g.clienteId]);
  const yaHechos = grupos.length - pendientes.length;
  if (yaHechos > 0) {
    console.log(`⏭️  ${yaHechos} cliente(s) ya procesados u omitidos en una corrida anterior, se saltan.\n`);
  }

  const aProcesar = pendientes.slice(0, LIMIT_CLIENTES);
  console.log(`👥 ${aProcesar.length} cliente(s) a procesar en esta corrida (de ${pendientes.length} pendientes).\n`);

  let clientesOk = 0;
  for (const grupo of aProcesar) {
    const saldoCliente = grupo.facturas.reduce((s, f) => s + Number(f.balance), 0);
    console.log(`👤 ${grupo.clienteNombre} (id ${grupo.clienteId}) — ${grupo.facturas.length} factura(s), ₡${saldoCliente.toLocaleString('es-CR')}`);
    try {
      await cerrarCliente(grupo, progreso);
      clientesOk++;
    } catch (err) {
      if (err._omitir) {
        console.error(`   ⏭️ Omitiendo cliente ${grupo.clienteId} (${grupo.clienteNombre}): ${err._omitir}`);
        progreso.omitidos[grupo.clienteId] = { clienteNombre: grupo.clienteNombre, motivo: err._omitir, fecha: new Date().toISOString() };
        guardarProgreso(progreso);
        continue;
      }
      console.error(`   ❌ Error en cliente ${grupo.clienteId}:`, err.response?.data || err.message);
      if (err._cierreContext) console.error(`   ⚠️ ${err._cierreContext}`);
      console.error('   Deteniendo. Verificá en Alegra antes de volver a correr el script.');
      process.exit(1);
    }
  }

  console.log(`\n✅ ${clientesOk} cliente(s) procesados en esta corrida.`);
  const omitidosCount = Object.keys(progreso.omitidos).length;
  if (omitidosCount > 0) {
    console.log(`⏭️ ${omitidosCount} cliente(s) omitidos en total (ver scripts/salida/cierre-progreso.json → omitidos).`);
  }
  if (!DRY_RUN && pendientes.length > aProcesar.length) {
    console.log(`   Quedan ${pendientes.length - aProcesar.length} cliente(s) pendientes — volvé a correr el script para continuar.`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error en el cierre:', err.response?.data || err.message);
  process.exit(1);
});
