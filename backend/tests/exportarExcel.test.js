const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const fs = require('node:fs');
const path = require('node:path');
const { generarExcel, fechaValida } = require('../src/utils/exportarExcel');

const leer = resultado => XLSX.read(resultado.buffer, { type: 'buffer', cellNF: true });

describe('el archivo Excel conserva el significado de las celdas', () => {
  test('códigos con ceros y nombres que parecen fórmulas siguen siendo texto', () => {
    const libro = leer(generarExcel({ titulo: 'Prueba', prefijo: 'prueba', hojas: [{ nombre: 'Datos',
      columnas: [{ clave: 'codigo', titulo: 'Código' }, { clave: 'nombre', titulo: 'Nombre' }],
      filas: [{ codigo: '00123', nombre: '=HYPERLINK("https://example.invalid")' }, { codigo: '+001', nombre: '@SUM(A1)' }] }] }));
    const hoja = libro.Sheets.Datos;
    assert.equal(hoja.A2.t, 's');
    assert.equal(hoja.A2.v, '00123');
    assert.equal(hoja.B2.t, 's');
    assert.equal(hoja.B2.f, undefined);
    assert.equal(hoja.A3.v, '+001');
    assert.equal(hoja.B3.f, undefined);
  });

  test('plata, cantidades y porcentajes son sumables; desconocido queda vacío y cero sigue siendo cero', () => {
    const libro = leer(generarExcel({ titulo: 'Prueba', prefijo: 'prueba', hojas: [{ nombre: 'Datos',
      columnas: [{ clave: 'monto', titulo: 'Monto', tipo: 'moneda' }, { clave: 'margen', titulo: 'Margen', tipo: 'porcentaje' },
        { clave: 'cantidad', titulo: 'Cantidad', tipo: 'numero' }],
      filas: [{ monto: '1234.56', margen: 42.5, cantidad: 1.5 }, { monto: 0, margen: null, cantidad: 0 }] }] }));
    const h = libro.Sheets.Datos;
    assert.equal(h.A2.t, 'n');
    assert.equal(h.A2.v, 1234.56);
    assert.equal(h.B2.v, 0.425);
    assert.equal(h.B2.z, '0.0%');
    assert.equal(h.C2.v, 1.5);
    assert.equal(h.A3.v, 0);
    assert.equal(h.B3, undefined);
    assert.equal(h.C3.v, 0);
  });

  test('el calendario no se mueve de día, ni siquiera con Node en UTC o Tokio', () => {
    const previa = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Tokyo', 'America/Costa_Rica']) {
        process.env.TZ = tz;
        const h = leer(generarExcel({ titulo: 'Prueba', prefijo: 'prueba', hojas: [{ nombre: 'Datos',
          columnas: [{ clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' }], filas: [{ fecha: '2026-10-01' }] }] })).Sheets.Datos;
        const dia = XLSX.SSF.parse_date_code(h.A2.v);
        assert.deepEqual([dia.y, dia.m, dia.d], [2026, 10, 1]);
        assert.equal(h.A2.z, 'yyyy-mm-dd');
      }
    } finally { if (previa === undefined) delete process.env.TZ; else process.env.TZ = previa; }
    assert.equal(fechaValida('2026-02-30'), false);
    assert.equal(fechaValida('2024-02-29'), true);
  });

  test('sin resultados se conservan encabezados, información y un libro válido', () => {
    const resultado = generarExcel({ titulo: 'Vacío', prefijo: 'vacio', hojas: [{ nombre: 'Datos',
      columnas: [{ clave: 'codigo', titulo: 'Código' }], filas: [] }] });
    const libro = leer(resultado);
    assert.deepEqual(libro.SheetNames, ['Información', 'Datos']);
    assert.equal(libro.Sheets.Datos.A1.v, 'Código');
    assert.equal(libro.Sheets.Datos['!ref'], 'A1');
    assert.match(resultado.nombre, /^vacio-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});

describe('las descargas piden el permiso del reporte también por el adaptador antiguo', () => {
  test('ninguna de las cinco rutas de Excel queda compartida', () => {
    const { moduloDeRuta, esCompartida } = require('../src/modules/usuarios/modulos');
    const rutas = [['/dashboard/exportar', 'dashboard'], ['/rentabilidad/exportar', 'rentabilidad'],
      ['/rentabilidad/productos/42/exportar', 'rentabilidad'], ['/reportes/faltantes/cliente/exportar', 'reporte-clientes'],
      ['/reportes/faltantes/proveedor/exportar', 'reporte-proveedores'], ['/alegra/reportes/faltantes/cliente/exportar', 'reporte-clientes'],
      ['/alegra/reportes/faltantes/proveedor/exportar', 'reporte-proveedores']];
    for (const [ruta, permiso] of rutas) {
      assert.equal(moduloDeRuta(ruta), permiso, ruta);
      assert.equal(esCompartida(ruta), false, ruta);
    }
  });
});

describe('filtros de clientes: Excel y pantalla eligen las mismas tarjetas', () => {
  // El archivo del frontend es puro, sin imports: se ejercita el algoritmo
  // real de la pantalla para evitar que sus tres filtros diverjan del Excel.
  const fuente = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/reporteClientesUtils.js'), 'utf8').replace(/\bexport /g, '');
  const frente = new Function(`${fuente}; return filtrarClientes;`)();
  const rutaDb = require.resolve('../config/database');
  const rutaAsignacion = require.resolve('../services/proveedorAsignacionService');
  require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: { query: async () => { throw new Error('No hay consulta en este test'); } } };
  require.cache[rutaAsignacion] = { id: rutaAsignacion, filename: rutaAsignacion, loaded: true, exports: {} };
  const { filtrarClientes } = require('../src/modules/reports/report.excel');
  const clientes = [
    { nombre: 'José', facturas_con_faltantes: [{ productos_faltantes: [{ cantidad_faltante: 3, nombre: 'Jabón PVC 1/2', codigo: '00123', proveedor: 'A' }] }] },
    { nombre: 'José Dos', facturas_con_faltantes: [{ productos_faltantes: [{ cantidad_faltante: 2, nombre: 'Clavos', codigo: 'C01', proveedor: 'B' }] }] },
    { nombre: 'Ana', facturas_con_faltantes: [{ productos_faltantes: [{ cantidad_faltante: 0, nombre: 'Jabón', codigo: '000', proveedor: 'A' }] }] }
  ];
  test('cliente, palabras del producto, código y proveedores conservan su semántica combinada', () => {
    for (const cambio of [{}, { cliente: 'JOSE' }, { producto: 'pvc JABON' }, { producto: '00123' }, { proveedores: ['B'] },
      { producto: 'jabón', proveedores: ['B'] }, { cliente: 'ana', producto: 'jabón' }]) {
      const filtros = { cliente: '', producto: '', proveedores: [], ...cambio };
      assert.deepEqual(filtrarClientes(clientes, filtros), frente(clientes, filtros));
    }
    assert.deepEqual(filtrarClientes(clientes, { cliente_nombre: 'José' }).map(c => c.nombre), ['José']);
  });

  test('un filtro mal formado da 400 en lugar de exportar todo', () => {
    assert.throws(() => filtrarClientes([], { proveedores: 'A' }), e => e.status === 400);
    assert.throws(() => filtrarClientes([], { producto: {} }), e => e.status === 400);
  });
});
