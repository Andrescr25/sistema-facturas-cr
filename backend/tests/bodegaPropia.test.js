/**
 * Facturas en Bodega sobre la factura PROPIA (sección 11 del checklist,
 * paso 1; 2026-09-29).
 *
 * LO QUE SE CUIDA
 *  - Bodega lista las facturas EMITIDAS de `factura` (ni proformas ni
 *    anuladas), con `factura_id` como identidad y sin `alegra_id` suelto.
 *  - Las líneas llevan el id propio del producto con su nombre, y el de
 *    Alegra aparte; nunca un `id` que el borrador confunda con el de Alegra.
 *  - Despachar escribe SOLO en `factura` (el puente con la tabla vieja
 *    `facturas` se retiró el 2026-09-30), y sin faltantes va a la cola de
 *    impresión POR EL ID PROPIO, en la misma transacción (migración 032).
 *  - Los faltantes se guardan sobre `factura.id`.
 *  - El historial va en orden de despacho.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaGuardar = require.resolve('../src/utils/guardarFaltantes');
const rutaCola = require.resolve('../src/modules/reprinting/colaImpresion');
const rutaModulo = require.resolve('../src/modules/warehouse/bodegaPropia');

let consultas; let respuestas; let encoladas; let guardadas; let transacciones;

/** `respuestas`: lista de [regex, filas | función(params)] que se prueban en orden. */
function montar() {
  for (const r of [rutaDb, rutaGuardar, rutaCola, rutaModulo]) delete require.cache[r];
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
  doble(rutaCola, {
    encolarSinPendientes: async (facturaId, db) => { encoladas.push({ facturaId, enTransaccion: db !== undefined }); }
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

describe('despachar', () => {
  test('en una transacción, solo en `factura`; sin faltantes, a imprimir por el id propio', async () => {
    const hora = '2026-09-29 10:00:00';
    respuestas = [[/^UPDATE factura SET estado_bodega/, [{ id: 7, numero: '001000014900', estado_bodega: 'procesado', bodega_procesado_en: hora }]]];
    const r = await b.actualizarEstado('7', { estado: 'procesado', enviarAImpresion: true });
    assert.deepEqual(transacciones, ['BEGIN', 'COMMIT']);
    assert.ok(!consultas.some((c) => /\bfacturas\b/.test(c.t)), 'el puente con la tabla vieja se retiró');
    assert.deepEqual(encoladas, [{ facturaId: 7, enTransaccion: true }], 'la cola cuelga de factura.id');
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

  test('los faltantes se guardan sobre factura.id', async () => {
    respuestas = [[/SELECT numero, estado FROM factura WHERE id = \$1/, [{ numero: '001000014900', estado: 'emitida' }]]];
    const r = await b.registrarFaltantes(7, [{ producto_id: 1709, cantidad_faltante: 1, tipo_faltante: 'parcial' }]);
    assert.equal(guardadas[0].fila, 7);
    assert.equal(r.faltantes_registrados, 1);
    assert.ok(!consultas.some((c) => /FROM facturas WHERE|INTO facturas/.test(c.t)), 'no toca la tabla vieja');
  });

  test('una factura anulada no recibe faltantes', async () => {
    respuestas = [[/SELECT numero, estado FROM factura WHERE id = \$1/, [{ numero: '001000014900', estado: 'anulada' }]]];
    await assert.rejects(() => b.registrarFaltantes(7, []), (e) => e.status === 409);
    assert.equal(guardadas.length, 0);
  });

  test('lo registrado vuelve con el id propio del producto', async () => {
    respuestas = [[/FROM faltantes f JOIN producto p ON p\.id = f\.producto_propio_id WHERE f\.factura_propia_id = \$1/,
      [{ tipo_faltante: 'parcial', cantidad_faltante: 2, observaciones: '', producto_id: 1709, referencia: 'R9X14 ', alegra_item_id: '898' }]]];
    const [e] = await b.estados(7);
    assert.equal(e.productoId, 1709);
    assert.equal(e.referencia, 'R9X14');
    assert.equal(e.cantidadFaltante, 2);
  });
});

describe('el historial va en orden de despacho', () => {
  test('la última despachada primero, la anterior segunda', () => {
    const orden = b.ordenarHistorial([
      { factura_id: 'a', despachada_en: '2026-09-23T14:00:00Z', fecha_emision: '2026-09-23' },
      { factura_id: 'b', despachada_en: '2026-09-23T16:30:00Z', fecha_emision: '2026-09-20' },
      { factura_id: 'c', despachada_en: '2026-09-23T15:10:00Z', fecha_emision: '2026-09-22' }
    ]).map((f) => f.factura_id);
    assert.deepEqual(orden, ['b', 'c', 'a']);
  });

  test('las despachadas sin hora (antes de que existiera) van al final, por fecha', () => {
    const orden = b.ordenarHistorial([
      { factura_id: 'vieja1', despachada_en: null, fecha_emision: '2026-08-01' },
      { factura_id: 'nueva', despachada_en: '2026-09-23T10:00:00Z', fecha_emision: '2026-09-01' },
      { factura_id: 'vieja2', despachada_en: null, fecha_emision: '2026-08-10' }
    ]).map((f) => f.factura_id);
    assert.deepEqual(orden, ['nueva', 'vieja2', 'vieja1']);
  });
});

describe('lo que no se puede romper', () => {
  test('una factura propia ya no se copia a la tabla vieja `facturas`', () => {
    for (const archivo of [
      ['src', 'modules', 'facturacion', 'facturaPropia.service.js'],
      ['src', 'modules', 'warehouse', 'bodegaPropia.js']
    ]) {
      const fuente = fs.readFileSync(path.join(__dirname, '..', ...archivo), 'utf8');
      assert.doesNotMatch(fuente, /(INSERT INTO|UPDATE|FROM) facturas\b/, archivo.at(-1));
    }
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
