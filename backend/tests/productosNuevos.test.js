/**
 * "Productos nuevos" del catálogo del agente: una lista MANUAL que se
 * administra desde Auditoría de Inventario (decisión del usuario, 2026-09-27).
 *
 * LO QUE SE CUIDA
 *  - Solo entra un producto que el catálogo muestra (activo y no oculto): si
 *    no, agregarlo "no haría nada" y parecería un error.
 *  - Un doble toque no es un error ni cambia la fecha en que se agregó.
 *  - Un producto que después se desactiva sigue en la lista, marcado: no se
 *    pierde si lo vuelven a activar, y nadie cree que el sistema falla.
 *  - La tablet solo baja ids, lo más reciente primero.
 *  - La ruta vive antes de '/:id', que si no se la traga.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaModulo = require.resolve('../src/modules/inventario-auditorias/productosNuevos');

const CACHE = {
  688: { nombre: 'TOMA CTE DOBLE PLACA', activo: true, oculto: false, precio_sin_iva: 100 },
  12: { nombre: 'CODO PVC 1/2', activo: false, oculto: false, precio_sin_iva: 100 },
  13: { nombre: 'SIERRA', activo: true, oculto: true, precio_sin_iva: 100 },
  700: { nombre: 'Nuevo sin Alegra', activo: true, oculto: false, precio_sin_iva: 100 }
};

let lista; // la tabla, en memoria
let sentencias;

function cargar() {
  delete require.cache[rutaDb];
  delete require.cache[rutaModulo];
  lista = new Map();
  sentencias = [];
  // Esta base local ES producción: nada de este archivo llega a la real.
  const query = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    sentencias.push(texto);
    if (/FROM producto p WHERE p.id = \$1/.test(texto)) {
      return { rows: CACHE[params[0]] ? [CACHE[params[0]]] : [] };
    }
    if (/^INSERT INTO producto_nuevo_catalogo/.test(texto)) {
      if (lista.has(params[0])) return { rows: [] };
      lista.set(params[0], { agregado_en: new Date(2026, 8, lista.size + 1), agregado_por: params[1] });
      return { rows: [{ id: params[0]+10000 }] };
    }
    if (/^DELETE FROM producto_nuevo_catalogo/.test(texto)) {
      const producto = params[0]-10000;
      const estaba = lista.delete(producto);
      return { rows: estaba ? [{ id: params[0] }] : [] };
    }
    if (/FROM producto_nuevo_catalogo n LEFT JOIN producto p/.test(texto)) {
      return { rows: [...lista].reverse().map(([id, f]) => ({ id: id+10000, producto_id: CACHE[id] ? id : null,
        alegra_item_id: String(id), ...f, ...(CACHE[id] || { nombre: null }) })) };
    }
    if (/SELECT n.producto_id, n.agregado_en FROM producto_nuevo_catalogo/.test(texto)) {
      return { rows: [...lista].reverse().filter(([id]) => CACHE[id]?.activo && !CACHE[id].oculto)
        .map(([id, f]) => ({ producto_id: id, agregado_en: f.agregado_en })) };
    }
    throw new Error(`consulta inesperada: ${texto}`);
  };
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query } };
  return require(rutaModulo);
}

let m;
beforeEach(() => { m = cargar(); });

describe('agregar', () => {
  test('un producto visible entra, con quién lo agregó', async () => {
    const r = await m.agregar('688', 'José');
    assert.deepEqual(r, { productoId: 688, nombre: 'TOMA CTE DOBLE PLACA', yaEstaba: false });
    assert.equal(lista.get(688).agregado_por, 'José');
  });

  test('uno inactivo u oculto no entra: no saldría en el catálogo', async () => {
    await assert.rejects(() => m.agregar('12'), (e) => e.status === 409 && /no está disponible/.test(e.message));
    await assert.rejects(() => m.agregar('13'), (e) => e.status === 409);
    assert.equal(lista.size, 0);
  });

  test('uno que no existe da 404, y sin producto da 400', async () => {
    await assert.rejects(() => m.agregar('999'), (e) => e.status === 404);
    await assert.rejects(() => m.agregar(''), (e) => e.status === 400);
  });

  test('el doble toque no es error ni cambia la fecha', async () => {
    await m.agregar('688');
    const fecha = lista.get(688).agregado_en;
    const r = await m.agregar('688');
    assert.equal(r.yaEstaba, true);
    assert.equal(lista.get(688).agregado_en, fecha);
  });
});

describe('quitar', () => {
  test('sale de la lista; uno que no estaba da 404', async () => {
    await m.agregar('688');
    assert.deepEqual(await m.quitar(10688), { registroId: 10688, quitado: true });
    assert.equal(lista.size, 0);
    await assert.rejects(() => m.quitar(10688), (e) => e.status === 404);
  });
});

describe('listar', () => {
  test('lo que se desactivó después sigue en la lista, marcado', async () => {
    await m.agregar('688');
    lista.set(12, { agregado_en: new Date(2026, 8, 20), agregado_por: null }); // se desactivó después
    const [codo, toma] = await m.listar();
    assert.equal(toma.visibleEnCatalogo, true);
    assert.equal(toma.motivoNoVisible, null);
    assert.equal(codo.visibleEnCatalogo, false);
    assert.equal(codo.motivoNoVisible, 'Está inactivo');
  });

  test('uno que ya no está en el catálogo no revienta la pantalla', async () => {
    lista.set(555, { agregado_en: new Date(), agregado_por: null });
    const [p] = await m.listar();
    assert.equal(p.nombre, 'Producto histórico 555');
    assert.equal(p.motivoNoVisible, 'Falta conciliar la ficha del producto');
  });
});

describe('lo que baja la tablet', () => {
  test('solo ids, lo más reciente primero', async () => {
    lista.set(688, { agregado_en: new Date(2026, 8, 1) });
    lista.set(700, { agregado_en: new Date(2026, 8, 2) });
    const ids = await m.idsParaCatalogo();
    assert.deepEqual(ids.map((p) => p.productoId), [700, 688]);
    assert.deepEqual(Object.keys(ids[0]).sort(), ['agregadoEn', 'productoId']);
  });
});

describe('las rutas', () => {
  test('"/productos-nuevos" va antes de "/:id" en Auditoría de Inventario', () => {
    const rutas = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'inventario-auditorias', 'inventario-auditorias.routes.js'), 'utf8');
    const iNuevos = rutas.indexOf("router.get('/productos-nuevos'");
    const iId = rutas.indexOf("router.get('/:id'");
    assert.ok(iNuevos >= 0 && iId > iNuevos, 'GET /:id declarado antes se traga /productos-nuevos');
  });

  test('la tabla propia se crea por migración, sin DDL de arranque', () => {
    const servicio = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'inventario-auditorias', 'inventario-auditorias.service.js'), 'utf8');
    assert.doesNotMatch(servicio, /CREATE TABLE|inicializarTablas\(\)/);
    const migracion = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'independencia', '036_catalogo_agente_con_ids_propios.sql'), 'utf8');
    assert.match(migracion, /producto_nuevo_catalogo/);
    assert.match(m.SQL_TABLA, /CREATE TABLE IF NOT EXISTS producto_nuevo_catalogo/);
  });
});
