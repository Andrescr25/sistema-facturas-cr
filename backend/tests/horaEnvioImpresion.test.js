/**
 * La nota "🖨️ En impresión — <hora>" del Reporte de Clientes dice CUÁNDO se
 * mandó cada factura a Impresión (pedido del usuario, 2026-10-01: "sale la
 * misma hora en todos los pedidos").
 *
 * LO QUE PASABA
 *  1. La pantalla le ponía a cada factura en cola la hora de CARGAR el
 *     reporte (`new Date()`), así que todas decían la misma.
 *  2. La hora real (`facturas_reimpresion.fecha_creacion`) se guardaba con
 *     CURRENT_TIMESTAMP en una columna sin zona horaria. El pooler de Supabase
 *     (modo transacción) no conserva el `SET TIME ZONE` de cada conexión:
 *     1 de cada 5 consultas corría en UTC y la hora quedaba 6 horas adelantada.
 *
 * EN ESTA RAMA la cola es propia (reprinting/colaImpresion.js y
 * procesarImpresion.js) y Bodega despacha en `factura` (bodegaPropia.js): el
 * arreglo se aplica ahí. Hoy la rama corre contra una base local, sin pooler,
 * pero en el corte va a correr sobre el mismo de producción.
 *
 * Contra la base solo se lee: PREPARE y un SET LOCAL dentro de una
 * transacción que siempre hace ROLLBACK.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const RAIZ = path.join(__dirname, '..');
const leer = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const { AHORA_CR_SQL } = require('../src/utils/fechaCR');

describe('la hora de la nota sale de la base', () => {
  test('la pantalla usa la hora de envío y la de procesado, nunca la de cargar', () => {
    const hook = leer('..', 'frontend', 'src', 'hooks', 'useReporteClientes.js');
    const carga = hook.slice(hook.indexOf('const loadReporte'), hook.indexOf('useEffect('));
    assert.match(carga, /timestamp: factura\.enviada_a_impresion_en \|\| null/);
    assert.match(carga, /timestamp: factura\.fecha_procesamiento \|\| null/);
    assert.doesNotMatch(carga, /new Date\(\)/, 'al cargar no se inventa ninguna hora');
  });

  test('el reporte devuelve la hora de envío de la fila más reciente de la cola', () => {
    const servicio = leer('src', 'modules', 'reports', 'report.service.js');
    assert.match(servicio, /fr\.fecha_creacion as enviada_a_impresion_en/);
    assert.match(servicio, /LEFT JOIN LATERAL \(\s*SELECT r\.id, r\.estado, r\.fecha_creacion, r\.fecha_procesamiento/);
    assert.match(servicio, /enviada_a_impresion_en: row\.enviada_a_impresion_en \|\| null/);
  });
});

describe('las horas se guardan en hora de Costa Rica', () => {
  test('la cola, el procesado, el despacho de Bodega y los faltantes usan AHORA_CR_SQL', () => {
    for (const archivo of [
      ['src', 'modules', 'reprinting', 'colaImpresion.js'],
      ['src', 'modules', 'reprinting', 'procesarImpresion.js'],
      ['src', 'modules', 'warehouse', 'bodegaPropia.js'],
      ['src', 'utils', 'guardarFaltantes.js']
    ]) {
      const fuente = leer(...archivo);
      const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.doesNotMatch(codigo, /CURRENT_TIMESTAMP|\bNOW\(\)/, `${archivo.at(-1)} escribe o compara con la hora de la sesión`);
      assert.match(fuente, /\$\{AHORA_CR_SQL\}/, archivo.at(-1));
    }
    assert.equal(AHORA_CR_SQL, "(now() AT TIME ZONE 'America/Costa_Rica')");
  });
});

const hayBase = Boolean(process.env.DATABASE_URL);

describe('contra la base, sin escribir', { skip: hayBase ? false : 'sin DATABASE_URL' }, () => {
  let pool;
  before(() => { ({ pool } = require('../config/database')); });
  after(async () => { await pool?.end().catch(() => {}); });

  test('AHORA_CR_SQL da la hora de Costa Rica aunque la sesión esté en UTC', async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query("SET LOCAL TIME ZONE 'UTC'");
      const { rows: [r] } = await c.query(`SELECT to_char(${AHORA_CR_SQL}, 'YYYY-MM-DD HH24:MI') AS cr, to_char(CURRENT_TIMESTAMP::timestamp, 'YYYY-MM-DD HH24:MI') AS sesion`);
      const esperado = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
      assert.ok(Math.abs(new Date(r.cr) - new Date(esperado)) <= 60000, `${r.cr} no es la hora de Costa Rica (${esperado})`);
      assert.notEqual(r.sesion, r.cr, 'la prueba sirve: CURRENT_TIMESTAMP en una sesión UTC da otra hora');
    } finally {
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });

  test('la consulta del reporte es SQL válido para Postgres', async () => {
    const servicio = leer('src', 'modules', 'reports', 'report.service.js');
    const i = servicio.indexOf('fr.fecha_creacion as enviada_a_impresion_en');
    const sql = servicio.slice(servicio.lastIndexOf('`', i) + 1, servicio.indexOf('`', i));
    const c = await pool.connect();
    const nombre = `verificar_reporte_clientes_${process.pid}`;
    try {
      await c.query('BEGIN');
      await c.query(`PREPARE ${nombre} AS ${sql}`);
    } finally {
      await c.query(`DEALLOCATE ${nombre}`).catch(() => {});
      await c.query('ROLLBACK').catch(() => {});
      c.release();
    }
  });
});
