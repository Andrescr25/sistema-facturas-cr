/**
 * Fase 0, paso 1 — Respaldo de la cartera abierta antes de cerrarla.
 *
 * Solo lectura: pagina GET /invoices?status=open en Alegra y vuelca todo a
 * un CSV + JSON local. Es el único registro de quién debía qué antes del
 * cierre masivo (ver cerrar-cartera-historica.js), así que se corre SIEMPRE
 * primero.
 *
 * Uso: cd backend && node scripts/exportar-cartera-abierta.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { getClient } = require('../src/integrations/alegra');

const client = getClient();
const SALIDA_DIR = path.join(__dirname, 'salida');
const LIMIT = 30; // máximo que acepta /invoices

// Alegra devuelve de vez en cuando un 500 genérico ("Ha ocurrido un error")
// bajo paginación intensiva y sostenida — una llamada aislada funciona, así
// que se reintenta la página completa acá (el requestWithRetry del cliente
// no reintenta 500) con una pausa fija entre páginas.
async function obtenerPagina(start, intentos = 5) {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const res = await client.api.get('/invoices', {
        params: {
          status: 'open',
          limit: LIMIT,
          start,
          order_field: 'date',
          order_direction: 'DESC'
        }
      });
      return res.data;
    } catch (error) {
      if (intento === intentos) throw error;
      const delay = 1500 * intento;
      console.log(`   ⚠️ Error en página start=${start} (${error.response?.status || error.code}), reintentando en ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function csvEscape(valor) {
  if (valor === null || valor === undefined) return '';
  const str = String(valor);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('📋 Exportando cartera abierta de Alegra (solo lectura)...\n');

  if (!fs.existsSync(SALIDA_DIR)) {
    fs.mkdirSync(SALIDA_DIR, { recursive: true });
  }

  const filas = [];
  let start = 0;
  let pagina = 0;

  while (true) {
    pagina++;
    process.stdout.write(`  Página ${pagina} (start=${start})...`);
    const datos = await obtenerPagina(start);
    process.stdout.write(` ${datos.length} facturas\n`);

    for (const f of datos) {
      filas.push({
        alegra_id: f.id,
        numero: f.numberTemplate?.fullNumber || f.numberTemplate?.number || '',
        cliente_id: f.client?.id || '',
        cliente_nombre: f.client?.name || '',
        fecha: f.date || '',
        dueDate: f.dueDate || '',
        total: Number(f.total) || 0,
        totalPaid: Number(f.totalPaid) || 0,
        balance: Number(f.balance) || 0,
        saleCondition: f.saleCondition || '',
        term: f.term || '',
        isVoidedByCreditNote: !!f.isVoidedByCreditNote
      });
    }

    if (datos.length < LIMIT) break;
    start += LIMIT;
    await new Promise(r => setTimeout(r, 250)); // pausa entre páginas
  }

  const fecha = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(SALIDA_DIR, `cartera-abierta-${fecha}.json`);
  const csvPath = path.join(SALIDA_DIR, `cartera-abierta-${fecha}.csv`);

  fs.writeFileSync(jsonPath, JSON.stringify(filas, null, 2));

  const columnas = Object.keys(filas[0] || {});
  const csvLineas = [
    columnas.join(','),
    ...filas.map(fila => columnas.map(c => csvEscape(fila[c])).join(','))
  ];
  fs.writeFileSync(csvPath, csvLineas.join('\n'));

  console.log(`\n✅ ${filas.length} facturas exportadas.`);
  console.log(`   JSON: ${jsonPath}`);
  console.log(`   CSV:  ${csvPath}`);

  // Resumen CASH vs CREDIT para que quede claro qué se va a cerrar.
  const grupos = new Map();
  for (const f of filas) {
    if (f.isVoidedByCreditNote) continue;
    const key = `${f.saleCondition || 'null'} | ${f.term || 'null'}`;
    const acc = grupos.get(key) || { n: 0, monto: 0 };
    acc.n++;
    acc.monto += f.balance;
    grupos.set(key, acc);
  }

  console.log('\n📊 Resumen por condición de venta:');
  const ordenado = [...grupos.entries()].sort((a, b) => b[1].monto - a[1].monto);
  let totalGeneral = 0;
  for (const [key, { n, monto }] of ordenado) {
    console.log(`   ${key.padEnd(30)} n=${String(n).padStart(4)}  saldo=₡${monto.toLocaleString('es-CR')}`);
    totalGeneral += monto;
  }
  console.log(`   ${'TOTAL'.padEnd(30)} n=${String(filas.length).padStart(4)}  saldo=₡${totalGeneral.toLocaleString('es-CR')}`);

  const anuladas = filas.filter(f => f.isVoidedByCreditNote).length;
  if (anuladas > 0) {
    console.log(`\n⚠️ ${anuladas} facturas anuladas por nota de crédito (excluidas del resumen, incluidas en el archivo).`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error exportando cartera:', err.response?.data || err.message);
  process.exit(1);
});
