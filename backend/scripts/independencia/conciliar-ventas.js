#!/usr/bin/env node
/**
 * node scripts/independencia/conciliar-ventas.js --desde=2026-09-01 --hasta=2026-09-30 --salida=/ruta/privada/ventas.json
 * Solo GET a Alegra y SELECT en PostgreSQL. No ejecuta cargas ni corrige datos.
 * Salida 0: sin diferencias dentro del alcance; 2: diferencias; 1: incompleto.
 * El JSON contiene documentos de negocio: guardarlo fuera del repositorio.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { ErrorConciliacion, periodo, fechaValida, normalizarAlegra, leerPaginas, leerBase, conciliar } = require('./lib/conciliacion-ventas');

function argumentos(args) {
  const valores = {};
  for (const a of args) {
    const m = /^--(desde|hasta|salida)=(.+)$/.exec(a);
    if (!m || valores[m[1]]) throw new ErrorConciliacion('Usar --desde=YYYY-MM-DD --hasta=YYYY-MM-DD --salida=/ruta/privada/nuevo.json');
    valores[m[1]] = m[2];
  }
  const p = periodo(valores.desde, valores.hasta);
  if (!valores.salida) throw new ErrorConciliacion('Falta --salida=/ruta/privada/nuevo.json');
  const salida = path.resolve(valores.salida), repo = path.resolve(__dirname, '../../..');
  if (salida === repo || salida.startsWith(repo + path.sep)) throw new ErrorConciliacion('Guardar el informe fuera del repositorio: contiene datos de negocio.');
  return { p, salida };
}

async function ejecutar({ client, pool, p, avisar = () => {} }) {
  const inicio = new Date().toISOString(); // Un instante del informe, no fecha de negocio.
  const facturas = await leerPaginas(client, '/invoices', { date_afterOrNow: p.desde, date_beforeOrNow: p.hasta, order_field: 'id', order_direction: 'ASC' }, avisar);
  // /credit-notes solo documenta filtro por fecha exacta. Su historial es
  // pequeño: leerlo completo evita inventar filtros que Alegra podría ignorar.
  const notas = await leerPaginas(client, '/credit-notes', {}, avisar);
  for (const d of facturas) if (!fechaValida(d.date) || d.date < p.desde || d.date > p.hasta) throw new ErrorConciliacion('Alegra ignoró el filtro de fechas de facturas. Informe incompleto.');
  const base = await leerBase(pool, p, { factura: facturas.map(d => String(d.id)), nota_credito: notas.map(d => String(d.id)) });
  const leidas = new Set(facturas.map(d => String(d.id)));
  const faltantes = base.filter(d => d.clase === 'factura' && d.alegra_id != null && !leidas.has(d.alegra_id)).map(d => d.alegra_id);
  // Un documento importado puede haberse movido de fecha en Alegra. Consultar
  // esos ids con el filtro documentado antes de llamarlos "solo en la base".
  for (let i = 0; i < faltantes.length; i += 30) {
    const lote = faltantes.slice(i, i + 30), r = await client.get('/invoices', { id: lote.join(',') });
    if (!r?.success || !Array.isArray(r.data)) throw new ErrorConciliacion('No se pudieron verificar los ids que solo aparecen en la base.');
    for (const d of r.data) {
      if (d?.id == null || !lote.includes(String(d.id)) || leidas.has(String(d.id))) throw new ErrorConciliacion('Respuesta inválida al verificar ids de facturas.');
      leidas.add(String(d.id)); facturas.push(d);
    }
  }
  const alegra = [...facturas.map(d => normalizarAlegra(d, 'factura')), ...notas.map(d => normalizarAlegra(d, 'nota_credito'))];
  const informe = conciliar(alegra, base, p);
  informe.lectura = { iniciada_en: inicio, terminada_en: new Date().toISOString() };
  return informe;
}

async function main() {
  const { p, salida } = argumentos(process.argv.slice(2));
  // Validar argumentos antes de cargar configuración o conectarse. No importar
  // server.js: arrancaría cron y servicios ajenos a esta lectura puntual.
  require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
  require('../../config/aislado').asegurarBaseLocal();
  const { pool } = require('../../config/database');
  const client = require('../../src/integrations/alegra/alegra.client').getInstance();
  let archivo;
  try {
    // 'wx' impide pisar un informe previo; 0600 mantiene los datos privados.
    archivo = await fs.open(salida, 'wx', 0o600);
    const informe = await ejecutar({ client, pool, p, avisar: console.log });
    await archivo.writeFile(JSON.stringify(informe, null, 2) + '\n');
    console.log(JSON.stringify({ periodo: p, sin_diferencias: informe.sin_diferencias, resumen: informe.resumen, salida }));
    process.exitCode = informe.sin_diferencias ? 0 : 2;
  } catch (e) {
    if (archivo) { await archivo.close(); archivo = null; await fs.unlink(salida); }
    throw e;
  } finally {
    if (archivo) await archivo.close();
    await pool.end();
  }
}

function mensajeSeguro(e) {
  if (e instanceof ErrorConciliacion) return e.message;
  if (e.code === 'EEXIST') return 'El archivo de salida ya existe; elegir un nombre nuevo.';
  if (['ENOENT', 'EACCES', 'EPERM'].includes(e.code)) return 'La carpeta de salida debe existir y permitir escritura.';
  return 'Revisar conexión y última página leída; no se imprimen errores internos de red/base.';
}

if (require.main === module) main().catch(e => {
  // No volcar Axios ni URLs autenticadas. El progreso indica la página; un
  // error impide emitir un archivo que alguien confunda con una conciliación.
  console.error(`Conciliación incompleta: ${mensajeSeguro(e)} No se certificaron datos.`);
  process.exitCode = 1;
});

module.exports = { argumentos, ejecutar, mensajeSeguro };
