/**
 * Rentabilidad, rehecha el 2026-09-25: margen por producto, rotación real y
 * cuándo se vende, en una sola pantalla.
 *
 * LO QUE SE CUIDA
 *  - El margen de hoy sale de `clasificarProducto`, con la tarifa real de
 *    cada producto (un exento no se divide entre 1,13).
 *  - La ganancia de lo vendido solo se calcula con un costo confiable: sin
 *    costo, o con uno sospechoso, queda vacía en vez de inventarla.
 *  - El margen ponderado del negocio es sobre lo vendido CON costo.
 *  - "Menor margen" pone arriba a los que pierden plata, no a los sin costo.
 *  - Un producto oculto o inactivo da 404, no un detalle vacío.
 *  - Ya no existen la pestaña ni las rutas de Competencia.
 *  - EN ESTA RAMA lo vendido sale de las facturas propias (`venta_linea`) y
 *    se cruza por `producto.id`. Los productos de prueba tienen un id propio
 *    DISTINTO de su id de Alegra a propósito: si el código cruzara por el id
 *    equivocado, estas pruebas lo verían (los dos son números).
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rutaDb = require.resolve('../config/database');
const rutaCostos = require.resolve('../src/modules/precios/costoDerivado');
const rutaRotacion = require.resolve('../src/modules/ventas/rotacion');
const rutaEstadisticas = require.resolve('../src/modules/ventas/estadisticas');
const rutaServicio = require.resolve('../src/modules/rentabilidad/rentabilidad.service');

const PRODUCTOS = [
  // 13 %: costo ₡678 con IVA = ₡600 sin IVA → margen 40 %.
  { producto_id: 101, alegra_id: 1, name: 'Tubo PVC 1/2', reference: 'T12', category: 'PVC', price: '1000', cost: '678', tax_percentage: '13', image_url: null, subcategoria: 'PVC 1/2' },
  // Sin costo en ningún lado.
  { producto_id: 102, alegra_id: 2, name: 'Codo PVC', reference: '', category: 'PVC', price: '1000', cost: '0', tax_percentage: '13', image_url: null, subcategoria: null },
  // Bajo el costo: ₡600 sin IVA contra ₡500 de precio → −20 %.
  { producto_id: 103, alegra_id: 3, name: 'Llave angular', reference: 'LA', category: 'Ferretería', price: '500', cost: '678', tax_percentage: '13', image_url: null, subcategoria: null },
  // Exento: el costo ₡100 ya ES sin IVA → margen 50 %, no 55,8 %.
  { producto_id: 104, alegra_id: 4, name: 'Arroz 1 kg', reference: 'AR', category: 'Abarrotes', price: '200', cost: '100', tax_percentage: '0', image_url: null, subcategoria: null }
];

// Por `producto.id`, como lo devuelve ventas/rotacion.js.
const ROTACION = new Map([
  [101, { clase: 'A', unidades: 100, ventas: 100000, unidadesMes: 33.33, unidadesSemana: 7.69, facturas: 12, clientesDistintos: 5, ultimaVenta: '2026-09-24' }],
  [102, { clase: 'B', unidades: 50, ventas: 50000, unidadesMes: 16.67, unidadesSemana: 3.85, facturas: 6, clientesDistintos: 2, ultimaVenta: '2026-09-20' }],
  [104, { clase: 'C', unidades: 10, ventas: 2000, unidadesMes: 3.33, unidadesSemana: 0.77, facturas: 2, clientesDistintos: 1, ultimaVenta: '2026-08-01' }]
]);

let pedidasSeries;
let opcionesRotacion;

function cargar() {
  for (const r of [rutaDb, rutaCostos, rutaRotacion, rutaEstadisticas, rutaServicio]) delete require.cache[r];
  pedidasSeries = [];
  opcionesRotacion = null;
  // Esta base local ES producción: nada de este archivo llega a la real.
  const query = async (sql) => {
    // En esta rama los productos salen del maestro propio (`producto`).
    if (/FROM producto p/.test(sql)) return { rows: PRODUCTOS };
    if (/FROM venta_linea/.test(sql)) return { rows: [{ ventas: '160000', facturas: 18, clientes: 7 }] };
    throw new Error(`consulta inesperada: ${sql}`);
  };
  const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
  doble(rutaDb, { query });
  doble(rutaCostos, { obtenerCostosDerivados: async () => COSTOS_DERIVADOS });
  doble(rutaRotacion, { HOY_CR: 'HOY', VENTANA_MESES: 3, rotacionPorProducto: async (opciones) => { opcionesRotacion = opciones; return ROTACION; } });
  doble(rutaEstadisticas, { series: async (id) => { pedidasSeries.push(id ?? null); return { semanas: [] }; } });
  return require(rutaServicio);
}

// El costo derivado de las compras, por `producto.id`. Vacío salvo en la
// prueba que lo llena.
let COSTOS_DERIVADOS = new Map();

let s;
beforeEach(() => { COSTOS_DERIVADOS = new Map(); s = cargar(); });

// La identidad es el id PROPIO (101–104). Los ids de Alegra de los dobles
// (1–4) son otros números a propósito: buscar con uno no encuentra nada.
const porId = (lista) => Object.fromEntries(lista.map((p) => [p.productoId, p]));

describe('el margen y la ganancia de cada producto', () => {
  test('Rentabilidad pide los últimos 30 días y muestra la cifra de la rotación', async () => {
    const p = porId((await s.listarProductos()).data);
    assert.deepEqual(opcionesRotacion, { ultimos30Dias: true });
    assert.equal(p[101].unidadesMes, 33.33);
    assert.equal(p[101].unidades, 100);
  });
  test('el margen usa la tarifa real: el exento no se divide entre 1,13', async () => {
    const p = porId((await s.listarProductos()).data);
    assert.equal(p[101].margen, 40);
    assert.equal(p[101].costoSinIva, 600);
    assert.equal(p[104].margen, 50);
    assert.equal(p[104].precioConIva, 200);
    assert.equal(p[101].precioConIva, 1130);
  });

  test('la ganancia es lo cobrado menos lo que esas unidades cuestan hoy', async () => {
    const p = porId((await s.listarProductos()).data);
    assert.equal(p[101].ganancia, 100000 - 100 * 600);
    assert.equal(p[104].ganancia, 2000 - 10 * 100);
  });

  test('sin costo confiable la ganancia queda vacía, no en cero', async () => {
    const p = porId((await s.listarProductos()).data);
    assert.equal(p[102].calidadCosto, 'SIN_COSTO');
    assert.equal(p[102].margen, null);
    assert.equal(p[102].ganancia, null);
  });

  test('el costo de las compras se busca por el id propio, no por el de Alegra', async () => {
    // "Codo PVC" no tiene costo en su ficha: producto 102, 2 en Alegra. Un
    // costo puesto bajo el 2 es de OTRO producto (el propio 2) y no le toca.
    COSTOS_DERIVADOS = new Map([[2, { costo: 999, historialInestable: false }]]);
    s = cargar();
    assert.equal(porId((await s.listarProductos()).data)[102].calidadCosto, 'SIN_COSTO');

    COSTOS_DERIVADOS = new Map([[102, { costo: 565, historialInestable: false }]]);
    s = cargar();
    const codo = porId((await s.listarProductos()).data)[102];
    assert.equal(codo.costoSinIva, 500);          // 565 con IVA al 13 %
    assert.equal(codo.margen, 50);
    assert.equal(codo.origenCosto, 'facturas');   // salió de las compras, no de la ficha
  });

  test('lo que no se vendió en la ventana es C con cero unidades, y sin ganancia', async () => {
    const p = porId((await s.listarProductos()).data);
    assert.equal(p[103].clase, 'C');
    assert.equal(p[103].unidades, 0);
    assert.equal(p[103].ganancia, null);
    assert.equal(p[103].margen, -20);
  });
});

describe('la lista', () => {
  test('por omisión, los más vendidos primero', async () => {
    const { data } = await s.listarProductos();
    assert.deepEqual(data.map((p) => p.productoId), [101, 102, 104, 103]);
  });

  test('"Menor margen" pone arriba al que pierde plata y al final a los sin costo', async () => {
    const { data } = await s.listarProductos({ orden: 'margen-bajo' });
    assert.deepEqual(data.map((p) => p.productoId), [103, 101, 104, 102]);
  });

  test('los filtros de las tarjetas: clase, bajo el costo y sin costo', async () => {
    assert.deepEqual((await s.listarProductos({ clase: 'A' })).data.map((p) => p.productoId), [101]);
    assert.deepEqual((await s.listarProductos({ costo: 'negativo' })).data.map((p) => p.productoId), [103]);
    assert.deepEqual((await s.listarProductos({ costo: 'sin-costo' })).data.map((p) => p.productoId), [102]);
  });

  test('la búsqueda ignora tildes y mayúsculas, y busca también la referencia', async () => {
    assert.deepEqual((await s.listarProductos({ buscar: 'FERRETERIA' })).total, 0, 'la categoría no es texto de búsqueda');
    assert.deepEqual((await s.listarProductos({ buscar: 'pvc tubo' })).data.map((p) => p.productoId), [101]);
    assert.deepEqual((await s.listarProductos({ buscar: 'la' })).data.map((p) => p.productoId), [103]);
  });

  test('una página fuera de rango no revienta', async () => {
    const r = await s.listarProductos({ pagina: 'x' });
    assert.equal(r.pagina, 1);
    assert.equal(r.paginas, 1);
  });

  test('el Excel toma todos los resultados filtrados, en el mismo orden que las páginas', async () => {
    const inicio = PRODUCTOS.length;
    try {
      PRODUCTOS.push(...Array.from({ length: 35 }, (_, i) => ({ ...PRODUCTOS[0], producto_id: 1000 + i,
        name: `zz-Paginado ${String(i).padStart(2, '0')}`, reference: `zz-${i}` })));
      s._limpiarMemoria();
      const filtros = { buscar: 'zz-paginado', orden: 'nombre' };
      const pagina1 = await s.listarProductos(filtros);
      const pagina2 = await s.listarProductos({ ...filtros, pagina: 2 });
      assert.equal(pagina1.data.length, 30);
      assert.equal(pagina2.data.length, 5);
      assert.deepEqual(await s.obtenerProductosFiltrados(filtros), [...pagina1.data, ...pagina2.data]);
    } finally { PRODUCTOS.splice(inicio); }
  });
});

describe('el resumen del negocio', () => {
  test('el margen ponderado es sobre lo vendido CON costo', async () => {
    const r = await s.obtenerResumen();
    const ganancia = 40000 + 1000;
    const vendidoConCosto = 100000 + 2000;
    assert.equal(r.ganancia, ganancia);
    assert.equal(r.margenPonderado, 40.2, '41 000 de 102 000, no de los 160 000 vendidos');
    assert.ok(Math.abs(r.coberturaCosto - 63.75) <= 0.05, `cobertura ${r.coberturaCosto}`);
    assert.deepEqual(r.porClase, { A: 1, B: 1, C: 2 });
    assert.equal(r.sinCosto, 1);
    assert.equal(r.margenNegativo, 1);
    assert.deepEqual(r.categorias, ['Abarrotes', 'Ferretería', 'PVC']);
    assert.deepEqual(pedidasSeries, [null], 'las series del negocio entero');
  });
});

describe('el detalle', () => {
  test('trae el producto y SUS series, por el id propio', async () => {
    const r = await s.obtenerProducto('101');
    assert.equal(r.producto.nombre, 'Tubo PVC 1/2');
    assert.equal(r.producto.productoId, 101);
    assert.equal('alegraItemId' in r.producto, false, 'la ficha ya no lleva el id de Alegra');
    assert.deepEqual(pedidasSeries, [101]);
  });

  test('el id de Alegra de un producto NO lo abre', async () => {
    // "Tubo PVC 1/2" es 101 acá y 1 en Alegra. Si el detalle aceptara los dos,
    // el día que exista el producto propio 1 se abriría ese en silencio.
    await assert.rejects(() => s.obtenerProducto('1'), (e) => e.status === 404);
  });

  test('un producto oculto o inactivo da 404, y un id que no es un número también', async () => {
    await assert.rejects(() => s.obtenerProducto('999'), (e) => e.status === 404);
    for (const raro of ['', 'abc', '101abc', '10.5', '-101', null, undefined]) {
      await assert.rejects(() => s.obtenerProducto(raro), (e) => e.status === 404, `aceptó ${JSON.stringify(raro)}`);
    }
  });
});

describe('sin pestañas ni Competencia', () => {
  const raiz = path.join(__dirname, '..', '..');

  test('las rutas son lecturas del reporte y sus exportaciones', () => {
    const rutas = fs.readFileSync(path.join(raiz, 'backend', 'src', 'modules', 'rentabilidad', 'rentabilidad.routes.js'), 'utf8');
    const declaradas = [...rutas.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(declaradas.sort(), ['get /exportar', 'get /productos', 'get /productos/:productoId', 'get /productos/:productoId/exportar', 'get /resumen']);
  });

  test('el código de Competencia ya no existe', () => {
    for (const r of [
      'backend/src/modules/rentabilidad/competencia',
      'backend/src/modules/rentabilidad/competencia.service.js',
      'frontend/src/components/rentabilidad/competencia',
      'frontend/src/hooks/useCompetencia.js'
    ]) assert.equal(fs.existsSync(path.join(raiz, r)), false, `${r} debería estar borrado`);
  });
});
