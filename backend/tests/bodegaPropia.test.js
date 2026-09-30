/**
 * Facturas en Bodega sobre la factura PROPIA (sección 11 del checklist,
 * paso 1; 2026-09-29).
 *
 * LO QUE SE CUIDA
 *  - Bodega lista las facturas EMITIDAS de `factura` (ni proformas ni
 *    anuladas), con `factura_id` como identidad y sin `alegra_id` suelto.
 *  - Las líneas llevan el id propio del producto con su nombre, y el de
 *    Alegra aparte; nunca un `id` que el borrador confunda con el de Alegra.
 *  - El puente con la tabla vieja `facturas` (de la que todavía leen
 *    Faltantes, la cola de impresión y el portal): se enlaza por el id de
 *    Alegra si la factura vino de allá, por número si es la misma, y si no se
 *    crea — SIN alegra_id. Un número de OTRA factura de Alegra no se pisa.
 *  - Despachar escribe en las dos tablas en una transacción, con la misma
 *    hora, y sin faltantes va a la cola de impresión.
 *  - La copia de una factura propia entra con alegra_id NULL: con 0 (y la
 *    columna única) la SEGUNDA factura propia chocaba con la primera.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaGuardar = require.resolve('../src/utils/guardarFaltantes');
const rutaWarehouse = require.resolve('../src/modules/warehouse/warehouse.service');
const rutaModulo = require.resolve('../src/modules/warehouse/bodegaPropia');

let consultas; let respuestas; let encoladas; let guardadas; let transacciones;

/** `respuestas`: lista de [regex, filas | función(params)] que se prueban en orden. */
function montar() {
  for (const r of [rutaDb, rutaGuardar, rutaWarehouse, rutaModulo]) delete require.cache[r];
  consultas = []; encoladas = []; guardadas = []; transacciones = [];
  const query = async (sql, params = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    consultas.push({ t, params });
    for (const [patron, filas] of respuestas) {
      if (patron.test(t)) return { rows: typeof filas === 'function' ? filas(params) : filas };
    }
    return { rows: [] };
  };
  const pool = {
    query,
    connect: async () => ({
      query: async (sql, params) => {
        const t = String(sql).trim();
        if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(t)) { transacciones.push(t); return { rows: [] }; }
        return query(sql, params);
      },
      release() {}
    })
  };
  const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
  doble(rutaDb, { query, pool });
  doble(rutaGuardar, { guardarFaltantes: async (fila, faltantes, quien) => { guardadas.push({ fila, faltantes, quien }); return faltantes.length; } });
  doble(rutaWarehouse, {
    encolarImpresion: async (fila, etiqueta) => { encoladas.push({ fila, etiqueta }); },
    ordenarHistorial: (l) => [...l].sort((a, b) => String(b.despachada_en).localeCompare(String(a.despachada_en)))
  });
  return require(rutaModulo);
}

let b;
beforeEach(() => { respuestas = []; b = montar(); });

const FACTURA = { id: 7, numero: '001000014900', fecha: '2026-09-20', cliente_nombre: 'SUPER X', cliente_correo: null, total: '15899.00', observaciones: null, estado_bodega: 'pendiente', bodega_procesado_en: null, bodega_observaciones: null };
const LINEA = { factura_id: 7, numero_linea: 1, producto_id: 1709, nombre: 'ROLLO DE BOLSA 9X14', referencia: 'R9X14', descripcion: null, cantidad: '2', alegra_item_id: '898' };

describe('la lista', () => {
  test('solo emitidas, con la ventana acotada, y el id propio como identidad', async () => {
    respuestas = [[/FROM factura f WHERE/, [FACTURA, { ...FACTURA, id: 8, estado_bodega: 'procesado', bodega_procesado_en: '2026-09-21T10:00:00Z' }]], [/FROM factura_linea l/, [LINEA]]];
    const r = await b.listar({ dias: '9999', limit: 'x' });
    const q = consultas[0];
    assert.match(q.t, /WHERE f\.estado = 'emitida'/);
    assert.deepEqual(q.params, [365, 40], 'días acotados a un año; límite por omisión');
    assert.equal(r.data.pendientes.length, 1);
    assert.equal(r.data.listas.length, 1);
    const f = r.data.pendientes[0];
    assert.equal(f.factura_id, 7);
    assert.equal('alegra_id' in f, false, 'la factura no viaja con un id de Alegra');
    assert.equal(f.numero_factura, '001000014900');
    assert.equal(f.total, 15899);
  });

  test('cada línea: el id propio del producto con su nombre, el de Alegra aparte, sin `id` suelto', async () => {
    respuestas = [[/FROM factura f WHERE/, [FACTURA]], [/FROM factura_linea l/, [LINEA]]];
    const [linea] = (await b.listar()).data.pendientes[0].items;
    assert.equal(linea.producto_id, 1709);
    assert.equal(linea.alegra_id, '898');
    assert.equal(linea.referencia, 'R9X14');
    assert.equal(linea.cantidad, 2);
    assert.equal('id' in linea, false);
  });
});

describe('el puente con la tabla vieja', () => {
  test('ya enlazada: se usa esa', async () => {
    respuestas = [[/SELECT id FROM facturas WHERE factura_propia_id = \$1/, [{ id: 55 }]]];
    assert.equal(await b.filaVieja(7), 55);
  });

  test('vino de Alegra: se enlaza la fila del mismo id de Alegra', async () => {
    respuestas = [
      [/FROM factura WHERE id = \$1/, [{ ...FACTURA, alegra_id: '4936', estado: 'emitida' }]],
      [/^UPDATE facturas SET factura_propia_id = \$1 WHERE alegra_id = \$2::int/, [{ id: 60 }]]
    ];
    assert.equal(await b.filaVieja(7), 60);
  });

  test('propia y nueva: se crea SIN alegra_id y enlazada', async () => {
    respuestas = [
      [/FROM factura WHERE id = \$1/, [{ ...FACTURA, alegra_id: null, estado: 'emitida' }]],
      [/^INSERT INTO facturas/, [{ id: 61 }]]
    ];
    assert.equal(await b.filaVieja(7), 61);
    const ins = consultas.find((c) => /^INSERT INTO facturas/.test(c.t));
    assert.equal(ins.params[1], null, 'alegra_id va vacío, nunca 0');
    assert.equal(ins.params[2], 7, 'factura_propia_id');
  });

  test('un número que ya es de OTRA factura de Alegra no se pisa', async () => {
    respuestas = [
      [/FROM factura WHERE id = \$1/, [{ ...FACTURA, alegra_id: null, estado: 'emitida' }]],
      [/FROM facturas WHERE numero_factura = \$1/, [{ id: 3, alegra_id: 4870, factura_propia_id: null }]]
    ];
    await assert.rejects(() => b.filaVieja(7), (e) => e.status === 409 && /serie/.test(e.message));
  });

  test('una anulada no se alista', async () => {
    respuestas = [[/FROM factura WHERE id = \$1/, [{ ...FACTURA, estado: 'anulada' }]]];
    await assert.rejects(() => b.filaVieja(7), (e) => e.status === 409);
  });
});

describe('despachar', () => {
  test('en una transacción: la factura y su fila vieja con la misma hora; sin faltantes, a imprimir', async () => {
    const hora = '2026-09-29 10:00:00';
    respuestas = [
      [/^UPDATE factura SET estado_bodega/, [{ id: 7, numero: '001000014900', estado_bodega: 'procesado', bodega_procesado_en: hora }]],
      [/SELECT id FROM facturas WHERE factura_propia_id = \$1/, [{ id: 55 }]]
    ];
    const r = await b.actualizarEstado('7', { estado: 'procesado', enviarAImpresion: true });
    assert.deepEqual(transacciones, ['BEGIN', 'COMMIT']);
    const vieja = consultas.find((c) => /^UPDATE facturas SET estado_bodega/.test(c.t));
    assert.deepEqual(vieja.params, ['procesado', 7, null, 55]);
    assert.match(vieja.t, /bodega_procesado_en = \(SELECT bodega_procesado_en FROM factura WHERE id = \$2\)/, 'la misma hora, copiada en SQL');
    assert.deepEqual(encoladas, [{ fila: 55, etiqueta: '001000014900' }]);
    assert.equal(r.enviada_a_impresion, true);
  });

  test('una factura que no está emitida: 404 y nada escrito', async () => {
    respuestas = [[/^UPDATE factura SET estado_bodega/, []]];
    await assert.rejects(() => b.actualizarEstado(7, { estado: 'procesado' }), (e) => e.status === 404);
    assert.deepEqual(transacciones, ['BEGIN', 'ROLLBACK']);
  });

  test('estado o id inválidos: 400', async () => {
    await assert.rejects(() => b.actualizarEstado(7, { estado: 'listo' }), (e) => e.status === 400);
    await assert.rejects(() => b.actualizarEstado('abc', { estado: 'procesado' }), (e) => e.status === 400);
  });

  test('los faltantes se guardan con la función de siempre, sobre la fila vieja', async () => {
    respuestas = [[/SELECT id FROM facturas WHERE factura_propia_id = \$1/, [{ id: 55 }]]];
    const r = await b.registrarFaltantes(7, [{ referencia: 'R9X14', alegra_item_id: '898', cantidad_faltante: 1, tipo_faltante: 'parcial' }]);
    assert.equal(guardadas[0].fila, 55);
    assert.equal(r.faltantes_registrados, 1);
  });
});

describe('lo que no se puede romper', () => {
  test('la copia de la factura propia entra con alegra_id NULL y enlazada (antes 0: la segunda chocaba)', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaPropia.service.js'), 'utf8');
    const insert = fuente.slice(fuente.indexOf('INSERT INTO facturas ('), fuente.indexOf('ON CONFLICT (numero_factura)'));
    assert.match(insert, /VALUES \(\$1, NULL, \$2,/);
    assert.match(fuente, /factura\.numero, factura\.id,/);
  });

  test('la migración 031 suelta el NOT NULL, enlaza y pasa lo despachado', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'independencia', '031_bodega_en_factura.sql'), 'utf8');
    assert.match(sql, /ALTER TABLE facturas ALTER COLUMN alegra_id DROP NOT NULL/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS factura_propia_id INTEGER REFERENCES factura\(id\)/);
    assert.match(sql, /SET estado_bodega = 'procesado'/);
  });

  test('la pantalla de la rama usa el id propio y claves nuevas en el teléfono', () => {
    const hook = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useFacturasBodega.js'), 'utf8');
    assert.doesNotMatch(hook, /factura\.alegra_id|f\.alegra_id|facturaSeleccionada\.alegra_id/);
    assert.match(hook, /draft: \(facturaId\) => `facturasBodegaPropia:draft:\$\{facturaId\}`/);
    assert.match(hook, /bodegaPropiaService\.actualizarEstado\(factura\.factura_id/);
  });
});
