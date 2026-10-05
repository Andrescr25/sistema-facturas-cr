#!/usr/bin/env node
/**
 * node scripts/independencia/conciliar-notas-credito.js --desde=2024-07-01 --hasta=2026-10-03 --salida=/ruta/privada/notas.json
 * Solo GET y PostgreSQL READ ONLY; no carga, no aplica notas ni cambia saldos.
 * 0: sin diferencias dentro del alcance; 2: diferencias/incidencias; 1: incompleto.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { argumentos, mensajeSeguro } = require('./conciliar-ventas');
const { ejecutar } = require('./lib/conciliacion-notas-credito');

async function main() {
  const { p, salida } = argumentos(process.argv.slice(2));
  require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });
  require('../../config/aislado').asegurarBaseLocal();
  const { pool } = require('../../config/database');
  const client = require('./lib/lectura-alegra').getInstance();
  let archivo;
  try {
    archivo = await fs.open(salida, 'wx', 0o600);
    const informe = await ejecutar({ client, pool, p, avisar: console.log });
    await archivo.writeFile(JSON.stringify(informe, null, 2) + '\n');
    console.log(JSON.stringify({ periodo: p, sin_diferencias: informe.sin_diferencias, notas: informe.notas.resumen,
      incidencias: informe.notas.incidencias.length, observaciones: informe.notas.observaciones.length, destinos: informe.destinos, salida }));
    process.exitCode = informe.sin_diferencias ? 0 : 2;
  } catch (e) {
    // Un informe parcial no puede confundirse con una conciliación completa.
    if (archivo) { await archivo.close(); archivo = null; await fs.unlink(salida); }
    throw e;
  } finally { if (archivo) await archivo.close(); await pool.end(); }
}

if (require.main === module) main().catch(e => {
  console.error(`Conciliación de notas incompleta: ${mensajeSeguro(e)} No se certificaron datos.`);
  process.exitCode = 1;
});
