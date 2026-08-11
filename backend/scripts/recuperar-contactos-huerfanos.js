/**
 * Fase 0, paso 4 — Recuperar los clientes cuyo contacto fue BORRADO de
 * Alegra (no solo inactivo), descubiertos al terminar el cierre masivo:
 * sus facturas viejas quedaron huérfanas (client.id apunta a un contacto
 * que ya no existe), así que /payments las rechaza con "Proveedor o
 * contacto deshabilitado".
 *
 * Solución verificada a mano (factura 224 / AB TAMARINDO, confirmada
 * íntegra tras el cambio — mismo total/balance/items, solo cambió el
 * cliente): Alegra SÍ permite re-vincular una factura no-electrónica
 * (isElectronic:false) a un contacto distinto vía PUT /invoices/:id.
 *
 * Por cliente:
 *   1. Crear un contacto nuevo con el mismo nombre (sin cédula — el valor
 *      genérico "100000000" que traían varias de estas facturas ya está
 *      usado por otro contacto real y distinto).
 *   2. Re-vincular cada factura vieja a ese contacto nuevo.
 *   3. Pagar el saldo igual que el cierre masivo (mismo patrón seguro:
 *      sin reintento ciego, verificar por lectura ante cualquier error).
 *
 * ⚠️ ESCRIBE en la contabilidad de producción.
 *
 * Uso:
 *   node scripts/recuperar-contactos-huerfanos.js --dry-run
 *   node scripts/recuperar-contactos-huerfanos.js --solo-cliente="AB TAMARINDO"
 *   node scripts/recuperar-contactos-huerfanos.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getClient } = require('../src/integrations/alegra');

const client = getClient();
const SALIDA_DIR = path.join(__dirname, 'salida');
const PROGRESO_PATH = path.join(SALIDA_DIR, 'huerfanos-progreso.json');
const MAX_INVOICES_POR_PAGO = 25;
const PAUSA_MS = 400;
const CUENTA_CAJA_ID = '2';
const FECHA_CORTE = '2026-08-09'; // misma fecha fija que el cierre masivo
const OBSERVACION_CIERRE = 'Cierre de cartera histórica — ajuste inicial al adoptar Cuentas por Cobrar (contacto recreado)';

// Datos tomados del espejo local ya sincronizado (cuentas_por_cobrar), que
// se pobló ANTES de tocar nada de esto — fuente confiable de qué facturas
// tiene cada cliente huérfano.
const CLIENTES = [
  { nombre: 'AB TAMARINDO', cedulaPlaceholder: '999999900', facturas: ['224', '524', '673', '940', '1331', '1488', '1506', '1642', '1791', '1928', '2242', '2519', '2661', '2964', '3093', '3204', '3640', '3658', '3913'] },
  { nombre: 'RAQUEL', cedulaPlaceholder: '999999901', facturas: ['203', '207', '252', '262', '323', '459', '502', '547', '574', '614', '702', '787', '886', '927', '1016', '1372', '1294', '1728', '1779', '1871', '1918', '1812', '1963', '2121', '2167', '2182', '2228', '2275'] },
  { nombre: 'ADITA OROZCO CAMPOS..power hause gim', cedulaPlaceholder: '999999902', facturas: ['809', '1154', '1707', '1902', '2103'] },
  { nombre: 'AB XION', cedulaPlaceholder: '999999903', facturas: ['266', '706', '862'] },
  { nombre: 'PANADERIA DEL PUEBLO', cedulaPlaceholder: '999999904', facturas: ['286', '1460', '1613', '1841'] },
  { nombre: 'SUPER LA CENTRAL  CONCEPCION SR', cedulaPlaceholder: '999999905', facturas: ['128', '1836', '2206', '2612'] },
  { nombre: 'CHURCHILL MALINCHE', cedulaPlaceholder: '999999906', facturas: ['1737'] },
  { nombre: 'SODA EL BUEN SABOR  DONA KATTIA', cedulaPlaceholder: '999999907', facturas: ['2085'] }
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const soloClienteArg = args.find(a => a.startsWith('--solo-cliente='));
const SOLO_CLIENTE = soloClienteArg ? soloClienteArg.split('=')[1] : null;

function cargarProgreso() {
  if (!fs.existsSync(PROGRESO_PATH)) return { contactos: {}, facturasRevinculadas: {}, pagos: {} };
  return JSON.parse(fs.readFileSync(PROGRESO_PATH, 'utf8'));
}

function guardarProgreso(progreso) {
  fs.writeFileSync(PROGRESO_PATH, JSON.stringify(progreso, null, 2));
}

async function buscarOCrearContacto(nombre, cedulaPlaceholder, progreso) {
  if (progreso.contactos[nombre]) return progreso.contactos[nombre];

  const existente = await client.api.get('/contacts', { params: { name: nombre } });
  const match = existente.data.find(c => c.name === nombre && c.status === 'active');
  if (match) {
    console.log(`   ℹ️ Contacto "${nombre}" ya existe (id ${match.id}), reutilizando.`);
    progreso.contactos[nombre] = match.id;
    guardarProgreso(progreso);
    return match.id;
  }

  if (DRY_RUN) {
    console.log(`   [dry-run] Crearía contacto "${nombre}"`);
    return null;
  }

  // Alegra exige identificationObject.type — probado en vivo: identification/
  // identificationType planos NO funcionan (error 2035 "tipo de identificación
  // obligatorio" incluso enviándolos), la forma real es esta anidada. Cédula
  // placeholder única por cliente (prefijo 999999 no colisiona con reales).
  const creado = await client.api.post('/contacts', {
    name: nombre,
    type: ['client'],
    identificationObject: { type: 'CF', number: cedulaPlaceholder }
  });
  console.log(`   ✅ Contacto creado: "${nombre}" (id ${creado.data.id})`);
  progreso.contactos[nombre] = creado.data.id;
  guardarProgreso(progreso);
  return creado.data.id;
}

async function revincularFactura(facturaId, nuevoContactoId, progreso) {
  const key = `${facturaId}`;
  if (progreso.facturasRevinculadas[key] === nuevoContactoId) {
    console.log(`   ⏭️ Factura ${facturaId} ya revinculada.`);
    return;
  }

  const actual = await client.api.get(`/invoices/${facturaId}`);
  if (String(actual.data.client?.id) === String(nuevoContactoId)) {
    console.log(`   ⏭️ Factura ${facturaId} ya apunta al contacto nuevo.`);
    progreso.facturasRevinculadas[key] = nuevoContactoId;
    guardarProgreso(progreso);
    return;
  }

  if (DRY_RUN) {
    console.log(`   [dry-run] Revincularía factura ${facturaId} (balance ₡${actual.data.balance}) al contacto ${nuevoContactoId}`);
    return;
  }

  await client.api.put(`/invoices/${facturaId}`, { client: { id: nuevoContactoId } });
  console.log(`   ✅ Factura ${facturaId} revinculada (balance ₡${actual.data.balance})`);
  progreso.facturasRevinculadas[key] = nuevoContactoId;
  guardarProgreso(progreso);
  await new Promise(r => setTimeout(r, PAUSA_MS));
}

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

function partirEnLotes(arr, tam) {
  const lotes = [];
  for (let i = 0; i < arr.length; i += tam) lotes.push(arr.slice(i, i + tam));
  return lotes;
}

async function pagarCliente(nombre, nuevoContactoId, facturaIds, progreso) {
  // Releer saldo real de cada factura (ya revinculada) antes de pagar.
  const facturasConSaldo = [];
  for (const id of facturaIds) {
    const f = await client.api.get(`/invoices/${id}`);
    if (Number(f.data.balance) > 0) {
      facturasConSaldo.push({ id, balance: Number(f.data.balance) });
    }
  }

  if (facturasConSaldo.length === 0) {
    console.log('   ℹ️ Sin saldo pendiente, nada que pagar.');
    return;
  }

  const lotes = partirEnLotes(facturasConSaldo, MAX_INVOICES_POR_PAGO);
  for (const lote of lotes) {
    const montoTotal = lote.reduce((s, f) => s + f.balance, 0);
    const payload = {
      date: FECHA_CORTE,
      type: 'in',
      client: { id: nuevoContactoId },
      paymentMethod: 'cash',
      bankAccount: { id: CUENTA_CAJA_ID },
      observations: OBSERVACION_CIERRE,
      invoices: lote.map(f => ({ id: f.id, amount: f.balance }))
    };

    if (DRY_RUN) {
      console.log(`   [dry-run] Pago de ₡${montoTotal.toLocaleString('es-CR')} sobre ${lote.length} factura(s)`);
      continue;
    }

    let pagoId;
    try {
      const res = await client.api.post('/payments', payload);
      pagoId = res.data.id;
    } catch (error) {
      console.log(`   ⚠️ Error creando pago (${error.response?.status || error.code}), verificando...`);
      const yaExiste = await buscarPagoYaCreado(nuevoContactoId, montoTotal);
      if (yaExiste) {
        pagoId = yaExiste.id;
        console.log(`   ✅ Verificado: el pago #${pagoId} sí se había creado.`);
      } else {
        throw new Error(`Fallo pagando ${nombre}: ${JSON.stringify(error.response?.data || error.message)}`);
      }
    }
    console.log(`   ✅ Pago #${pagoId} — ₡${montoTotal.toLocaleString('es-CR')} sobre ${lote.length} factura(s)`);
    progreso.pagos[nombre] = [...(progreso.pagos[nombre] || []), pagoId];
    guardarProgreso(progreso);
    await new Promise(r => setTimeout(r, PAUSA_MS));
  }
}

async function main() {
  console.log('🔧 Recuperando contactos huérfanos\n');
  console.log(`   Modo: ${DRY_RUN ? 'DRY-RUN' : '⚠️ REAL — escribe en Alegra'}\n`);

  const progreso = cargarProgreso();
  const clientes = SOLO_CLIENTE ? CLIENTES.filter(c => c.nombre === SOLO_CLIENTE) : CLIENTES;

  for (const c of clientes) {
    console.log(`👤 ${c.nombre} (${c.facturas.length} facturas)`);
    const nuevoId = await buscarOCrearContacto(c.nombre, c.cedulaPlaceholder, progreso);
    if (!nuevoId && !DRY_RUN) {
      console.log('   ❌ No se pudo crear/encontrar el contacto, saltando cliente.');
      continue;
    }
    if (!DRY_RUN) {
      try {
        for (const facturaId of c.facturas) {
          await revincularFactura(facturaId, nuevoId, progreso);
        }
        await pagarCliente(c.nombre, nuevoId, c.facturas, progreso);
      } catch (err) {
        // code 3070 = factura electrónica (timbrada por Hacienda), legalmente
        // inmutable — no es un error transitorio, no tiene sentido reintentar.
        // Se omite este cliente y se sigue con el resto.
        if (err.response?.data?.code === 3070) {
          console.log(`   ⏭️ Omitiendo "${c.nombre}": tiene facturas electrónicas (no se pueden re-vincular, son inmutables por ley).`);
          progreso.omitidos = progreso.omitidos || {};
          progreso.omitidos[c.nombre] = 'Facturas electrónicas (timbradas), no se pueden editar';
          guardarProgreso(progreso);
        } else {
          throw err;
        }
      }
    }
    console.log('');
  }

  console.log('✅ Terminado.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.response?.data || err.message);
  process.exit(1);
});
