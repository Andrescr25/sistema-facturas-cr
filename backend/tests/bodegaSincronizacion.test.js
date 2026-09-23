const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * La sincronización de Facturas en Bodega.
 *
 * El "timeout al sincronizar" del teléfono salía de acá: cada factura
 * despachada invalidaba la caché, la siguiente apertura sincronizaba TODO con
 * Alegra, y con Alegra lenta (60 s por página × 4 intentos) el navegador
 * cortaba a los 3 minutos. Varios teléfonos abriendo a la vez eran varias
 * sincronizaciones en paralelo.
 *
 * Lo que se cuida:
 *  - la caché guarda solo lo de Alegra; el estado de bodega se lee de la base
 *    en cada pedido (despachar no obliga a volver a Alegra);
 *  - dos pedidos a la vez = UNA sincronización;
 *  - con la caché vencida se contesta al toque y se actualiza por detrás;
 *  - si Alegra falla y hay algo guardado, se devuelve eso con un aviso;
 *  - el historial va en orden de despacho: la última despachada primero.
 */

const rutaDb = require.resolve('../config/database');
const rutaAlegra = require.resolve('../src/integrations/alegra');
const rutaServicio = require.resolve('../src/modules/warehouse/warehouse.service');

const factura = (id, fecha) => ({ id, alegra_id: id, numero_factura: `F${id}`, date: fecha, fecha_emision: fecha, cliente_nombre: `Cliente ${id}`, total: 1000, items: [], status: 'open' });

function montar({ paginas = [[factura(1, '2026-09-20'), factura(2, '2026-09-21')]], estados = [], fallaAlegra = false } = {}) {
  const contador = { alegra: 0 };
  let pagina = 0;
  const cliente = {
    requestWithRetry: (fn) => fn(),
    api: {
      get: async () => {
        contador.alegra++;
        await new Promise((r) => setTimeout(r, 5));
        if (fallaAlegra) { const e = new Error('timeout'); e.code = 'ECONNABORTED'; throw e; }
        const data = paginas[pagina] || [];
        pagina = (pagina + 1) % Math.max(paginas.length, 1);
        return { data: { data: data } };
      }
    }
  };
  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getClient: () => cliente,
      getInvoiceService: () => ({ transformInvoiceForFrontend: (inv) => ({ ...inv, alegra_id: inv.id }) })
    }
  };
  const ejecutar = async (sql) => {
    const texto = String(sql).replace(/\s+/g, ' ');
    if (/FROM facturas WHERE alegra_id = ANY/.test(texto)) return { rows: estados };
    if (/FROM faltantes f JOIN facturas fa/.test(texto)) return { rows: [] };
    return { rows: [{}] };
  };
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query: ejecutar, pool: { query: ejecutar } } };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), contador, fallar: (v) => { fallaAlegra = v; } };
}

const ahoraReal = Date.now;
beforeEach(() => { for (const r of [rutaDb, rutaAlegra, rutaServicio]) delete require.cache[r]; });
afterEach(() => { Date.now = ahoraReal; });

describe('sincronización de bodega', () => {
  test('dos pedidos a la vez sin nada guardado: UNA sola sincronización con Alegra', async () => {
    const { servicio, contador } = montar();
    await Promise.all([servicio.getFacturasBodega({}), servicio.getFacturasBodega({})]);
    assert.equal(contador.alegra, 1);
  });

  test('con lo guardado fresco no se vuelve a preguntarle a Alegra', async () => {
    const { servicio, contador } = montar();
    await servicio.getFacturasBodega({});
    await servicio.getFacturasBodega({});
    assert.equal(contador.alegra, 1);
  });

  test('el estado de bodega se lee FRESCO de la base en cada pedido, sin volver a Alegra', async () => {
    const estados = [];
    const { servicio, contador } = montar({ estados });
    const antes = await servicio.getFacturasBodega({});
    assert.equal(antes.data.pendientes.length, 2);
    // Se despacha la 1 (lo escribe actualizarEstadoFactura en la base).
    estados.push({ alegra_id: 1, estado_bodega: 'procesado', bodega_procesado_en: '2026-09-23T15:00:00Z' });
    const despues = await servicio.getFacturasBodega({});
    assert.deepEqual(despues.data.listas.map((f) => f.alegra_id), [1]);
    assert.equal(despues.data.listas[0].despachada_en, '2026-09-23T15:00:00Z');
    assert.equal(contador.alegra, 1, 'despachar no obliga a sincronizar con Alegra');
  });

  test('vencida: contesta al toque con lo guardado y actualiza por detrás', async () => {
    const { servicio, contador } = montar();
    await servicio.getFacturasBodega({});
    const base = ahoraReal();
    Date.now = () => base + 3 * 60 * 1000;
    const r = await servicio.getFacturasBodega({});
    assert.equal(r.metadata.actualizando, true);
    assert.equal(r.data.pendientes.length, 2, 'devuelve lo guardado');
    await new Promise((res) => setTimeout(res, 30));
    assert.equal(contador.alegra, 2, 'la actualización corrió por detrás');
  });

  test('forzada y Alegra falla, con algo guardado: devuelve eso con un aviso', async () => {
    const { servicio, fallar } = montar();
    await servicio.getFacturasBodega({});
    fallar(true);
    const r = await servicio.getFacturasBodega({ forceRefresh: true });
    assert.equal(r.success, true);
    assert.match(r.metadata.aviso, /Alegra no respondió/);
  });

  test('sin nada guardado y Alegra falla: el error sube (no se inventa una lista vacía)', async () => {
    const { servicio } = montar({ fallaAlegra: true });
    await assert.rejects(servicio.getFacturasBodega({}), /timeout/);
  });

  test('cada ventana de días tiene su propia caché', async () => {
    const { servicio, contador } = montar();
    await servicio.getFacturasBodega({ dias: 30, limit: 40 });
    await servicio.getFacturasBodega({ dias: 90, limit: 120 });
    assert.equal(contador.alegra, 2, 'la de 90 días no se contesta con la de 30');
  });
});

describe('el conteo de faltantes', () => {
  test("no cuenta los productos que salieron completos (tipo 'completo' ni cantidad 0)", async () => {
    const fs = require('fs');
    const fuente = fs.readFileSync(rutaServicio, 'utf8');
    const consulta = fuente.slice(fuente.indexOf('AS faltantes_pendientes') - 300, fuente.indexOf('AS faltantes_pendientes'));
    assert.match(consulta, /tipo_faltante <> 'completo'/);
    assert.match(consulta, /cantidad_faltante, 0\) > 0/);
  });
});

describe('el historial va en orden de despacho', () => {
  test('la última despachada primero, la anterior segunda', () => {
    const { servicio } = montar();
    const orden = servicio.ordenarHistorial([
      { alegra_id: 'a', despachada_en: '2026-09-23T14:00:00Z', fecha_emision: '2026-09-23' },
      { alegra_id: 'b', despachada_en: '2026-09-23T16:30:00Z', fecha_emision: '2026-09-20' },
      { alegra_id: 'c', despachada_en: '2026-09-23T15:10:00Z', fecha_emision: '2026-09-22' }
    ]).map((f) => f.alegra_id);
    assert.deepEqual(orden, ['b', 'c', 'a']);
  });

  test('las despachadas sin hora (antes de que existiera) van al final, por fecha', () => {
    const { servicio } = montar();
    const orden = servicio.ordenarHistorial([
      { alegra_id: 'vieja1', despachada_en: null, fecha_emision: '2026-08-01' },
      { alegra_id: 'nueva', despachada_en: '2026-09-23T10:00:00Z', fecha_emision: '2026-09-01' },
      { alegra_id: 'vieja2', despachada_en: null, fecha_emision: '2026-08-10' }
    ]).map((f) => f.alegra_id);
    assert.deepEqual(orden, ['nueva', 'vieja2', 'vieja1']);
  });
});
