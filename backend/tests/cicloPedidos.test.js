/**
 * "Pedido enviado" se va con el borrado semanal (decisión del usuario,
 * 2026-09-29): la limpieza del domingo 23:59 y el botón "Limpiar BD
 * Faltantes" de Configuración reinician el ciclo de pedidos, y cada semana
 * todos los proveedores arrancan en "Sin enviar".
 *
 * LO QUE SE CUIDA
 *  - No se borra nada de envio_whatsapp (guarda también facturas,
 *    cotizaciones y saldos): se anota cuándo se reinició el ciclo.
 *  - La marca cuenta desde el último reinicio, o desde el lunes 00:00 (hora
 *    de Costa Rica) si todavía no hubo ninguno.
 *  - El reinicio pasa aunque no haya faltantes que limpiar: las dos
 *    limpiezas salen antes en ese caso.
 *
 * TODO CON UNA BASE SIMULADA. Esta base local ES producción y la limpieza
 * borra los faltantes de la semana: nada de este archivo la toca.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaCiclo = require.resolve('../src/modules/orders-whatsapp/cicloPedidos');
const rutaOrdenes = require.resolve('../src/modules/orders-whatsapp/orders-whatsapp.service');
const rutaReportes = require.resolve('../src/modules/reports/report.service');

let consultas;

function montar({ faltantes = [] } = {}) {
  for (const r of [rutaDb, rutaCiclo, rutaOrdenes, rutaReportes]) delete require.cache[r];
  consultas = [];
  const query = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    consultas.push({ texto, params });
    if (/^INSERT INTO ciclo_pedidos/.test(texto)) return { rows: [{ reiniciado_en: '2026-10-04 23:59:00' }] };
    if (/FROM faltantes f/.test(texto)) return { rows: faltantes };
    if (/^DELETE/.test(texto)) throw new Error(`una prueba intentó borrar: ${texto}`);
    return { rows: [] };
  };
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query, pool: { query } } };
  return { ciclo: require(rutaCiclo) };
}

beforeEach(() => montar());

describe('desde cuándo cuenta "Pedido enviado"', () => {
  test('desde el último reinicio, o desde el lunes 00:00 en Costa Rica si no hubo', () => {
    const { ciclo } = montar();
    assert.match(ciclo.SQL_INICIO_CICLO, /SELECT reiniciado_en FROM ciclo_pedidos WHERE id = 1/);
    assert.match(ciclo.SQL_INICIO_CICLO, /date_trunc\('week', now\(\) AT TIME ZONE 'America\/Costa_Rica'\)/);
  });

  test('la consulta de la marca usa el inicio del ciclo, y la fecha del reporte si es más nueva', async () => {
    montar();
    const Ordenes = require(rutaOrdenes);
    await new Ordenes().getOrdenesEnviadas(null);
    const marca = consultas.find((c) => /FROM envio_whatsapp/.test(c.texto));
    assert.match(marca.texto, /creado_en >= GREATEST\(\$1::timestamp, COALESCE\( ?\(SELECT reiniciado_en FROM ciclo_pedidos/);
    assert.deepEqual(marca.params, [null]);
    assert.ok(consultas.some((c) => /CREATE TABLE IF NOT EXISTS ciclo_pedidos/.test(c.texto)), 'la tabla existe antes de leerla');
  });

  test('reiniciar anota la hora, sin borrar ningún envío', async () => {
    const { ciclo } = montar();
    await ciclo.reiniciar();
    const escritura = consultas.find((c) => /^INSERT INTO ciclo_pedidos/.test(c.texto));
    assert.match(escritura.texto, /VALUES \(1, CURRENT_TIMESTAMP\) ON CONFLICT \(id\) DO UPDATE SET reiniciado_en = EXCLUDED.reiniciado_en/);
    assert.equal(consultas.some((c) => /envio_whatsapp/.test(c.texto)), false);
  });
});

describe('las dos limpiezas reinician el ciclo', () => {
  test('el botón de Configuración, aunque no haya faltantes', async () => {
    montar({ faltantes: [] });
    const Reportes = require(rutaReportes);
    const servicio = typeof Reportes === 'function' ? new Reportes() : Reportes;
    const r = await servicio.clearProcessedSupplierMissingItems();
    assert.equal(r.success, true);
    assert.ok(consultas.some((c) => /^INSERT INTO ciclo_pedidos/.test(c.texto)), 'sin faltantes igual se reinicia');
  });

  test('el botón de Configuración, cuando sí limpia, reinicia al final', () => {
    const fuente = fs.readFileSync(rutaReportes, 'utf8');
    const metodo = fuente.slice(fuente.indexOf('async clearProcessedSupplierMissingItems'), fuente.indexOf('async getEncargosEspeciales'));
    const iUltimoBorrado = metodo.lastIndexOf('DELETE FROM');
    const iReinicio = metodo.lastIndexOf('cicloPedidos.reiniciar()');
    assert.ok(iReinicio > iUltimoBorrado, 'el ciclo se reinicia después de borrar, no antes');
  });

  test('la limpieza del domingo, aunque no haya faltantes (esa función sale antes)', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'services', 'scheduledCleanup.js'), 'utf8');
    const tarea = fuente.slice(fuente.indexOf("cron.schedule('59 23 * * 0'"), fuente.indexOf("timezone: 'America/Costa_Rica'"));
    assert.ok(tarea.indexOf('cicloPedidos.reiniciar()') > tarea.indexOf('await ejecutarLimpiezaFaltantes()'),
      'el reinicio va en la tarea programada, después de la limpieza y fuera de ella');
    assert.match(tarea, /cicloPedidos\.reiniciar\(\)\.catch/, 'un fallo al reiniciar no frena el resto de la limpieza');
  });
});
