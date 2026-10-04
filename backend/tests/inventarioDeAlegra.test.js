const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Lo que TODAVÍA depende de Alegra en el código de la aplicación, como lista
 * cerrada (sección 16 del checklist).
 *
 * Es un trinquete: cada lista es exactamente lo que hay hoy.
 *  · Si un archivo que NO está en la lista empieza a depender de Alegra, la
 *    prueba falla: nadie agrega una dependencia nueva sin darse cuenta.
 *  · Si un archivo de la lista DEJA de depender, también falla, hasta que se
 *    lo saque de acá: la lista solo puede achicarse, y siempre dice la verdad
 *    de lo que falta.
 *
 * El día que las tres queden vacías, se puede borrar `integrations/alegra`.
 *
 * Fuera de la cuenta, a propósito: `backend/scripts` (los cargadores y las
 * conciliaciones le leen a Alegra hasta el corte, que es para lo que están) y
 * la integración misma.
 */

const RAIZ = path.join(__dirname, '..', '..');

/** Código de la aplicación que importa `integrations/alegra`. */
const IMPORTAN_LA_INTEGRACION = [
  'backend/routes/alegra.js',                                             // el router adaptador de /api/alegra
  'backend/server.js',                                                    // la sincronización de productos cada 6 horas
  'backend/src/modules/catalogo/catalogo.service.js',                     // Gestión de Catálogo vieja (22 rutas sin pantalla)
  'backend/src/modules/catalogo/categorias.service.js',
  'backend/src/modules/envios-whatsapp/envios.controller.js',
  'backend/src/modules/facturacion/facturacion.controller.js',
  'backend/src/modules/facturacion/facturacion.service.js',
  'backend/src/modules/inventario-auditorias/inventario-auditorias.service.js',
  'backend/src/modules/invoices/invoice.service.js',
  'backend/src/modules/products/product.service.js',
  'backend/src/modules/revision-precios/revision-precios.service.js',     // solo `enviarFacturaAlegra`, sin pantalla
  'backend/utils/impuestosAlegra.js'
];

/** Código de la aplicación que lee o escribe `alegra_products_cache`. */
const USAN_LA_CACHE = [
  'backend/src/modules/catalogo/catalogo.service.js',
  'backend/src/modules/catalogo/categorias.service.js',
  'backend/src/modules/catalogo/subcategorias.service.js',
  'backend/src/modules/facturacion/facturacion.service.js',
  'backend/src/modules/inventario-auditorias/inventario-auditorias.service.js',
  'backend/src/modules/revision-precios/revision-precios.service.js'      // solo `enviarFacturaAlegra`, sin pantalla
];

/**
 * Pantallas que llaman a `/alegra/...`. Casi todas esas rutas ya responden
 * con datos propios: el prefijo es el del router adaptador, y se va con él.
 */
const PANTALLAS_QUE_LLAMAN_A_ALEGRA = [
  'frontend/src/hooks/useFichaProducto.js',          // buscar fotos sugeridas
  'frontend/src/hooks/useRelacionarProductos.js',    // buscar fotos sugeridas
  'frontend/src/hooks/useReporteProveedores.js',     // órdenes de compra (prefijo adaptador)
  'frontend/src/services/alegraService.js',          // faltantes, reportes, órdenes: 28 llamadas, casi todas ya propias
  'frontend/src/services/bodegaPropiaService.js',    // Facturas en Bodega (prefijo adaptador)
  'frontend/src/services/facturacionService.js'
];

function archivos(carpeta, extensiones) {
  const base = path.join(RAIZ, carpeta);
  if (!fs.existsSync(base)) return [];
  const salida = [];
  const recorrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === 'node_modules' || entrada.name === 'tests' || entrada.name === 'dist') continue;
      const ruta = path.join(dir, entrada.name);
      if (entrada.isDirectory() || (entrada.isSymbolicLink() && fs.statSync(ruta).isDirectory())) { if (!entrada.isSymbolicLink()) recorrer(ruta); continue; }
      if (extensiones.some(e => entrada.name.endsWith(e))) salida.push(path.relative(RAIZ, ruta).split(path.sep).join('/'));
    }
  };
  recorrer(base);
  return salida;
}

/** El archivo sin comentarios: mencionar a Alegra en un comentario no es depender de ella. */
function codigo(relativa) {
  return fs.readFileSync(path.join(RAIZ, relativa), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const BACKEND = ['backend/src', 'backend/services', 'backend/routes', 'backend/controllers', 'backend/utils']
  .flatMap(c => archivos(c, ['.js']))
  .concat(['backend/server.js'])
  .filter(a => !a.startsWith('backend/src/integrations/alegra/'));
const FRONTEND = archivos('frontend/src', ['.js', '.jsx']);

function comparar(encontrados, lista, queEs) {
  const nuevos = encontrados.filter(a => !lista.includes(a)).sort();
  const yaNo = lista.filter(a => !encontrados.includes(a)).sort();
  assert.deepEqual(nuevos, [], `dependencia NUEVA de Alegra (${queEs}): ${nuevos.join(', ')}`);
  assert.deepEqual(yaNo, [], `ya no depende (${queEs}): sacarlo de la lista de esta prueba → ${yaNo.join(', ')}`);
}

describe('lo que queda dependiendo de Alegra', () => {
  test('quién importa la integración', () => {
    const encontrados = BACKEND.filter(a => /require\([^)]*integrations\/alegra/.test(codigo(a)));
    comparar(encontrados, IMPORTAN_LA_INTEGRACION, 'importa integrations/alegra');
  });

  test('quién lee o escribe la caché de productos de Alegra', () => {
    const encontrados = BACKEND.filter(a => /alegra_products_cache|\.alegraProduct\b/.test(codigo(a)));
    comparar(encontrados, USAN_LA_CACHE, 'usa alegra_products_cache');
  });

  test('qué pantallas llaman a /alegra/...', () => {
    const encontrados = FRONTEND.filter(a => /['"`]\/alegra\//.test(codigo(a)));
    comparar(encontrados, PANTALLAS_QUE_LLAMAN_A_ALEGRA, 'llama a /alegra/');
  });

  test('las listas no tienen archivos que ya no existen', () => {
    for (const a of [...IMPORTAN_LA_INTEGRACION, ...USAN_LA_CACHE, ...PANTALLAS_QUE_LLAMAN_A_ALEGRA]) {
      assert.ok(fs.existsSync(path.join(RAIZ, a)), `${a} ya no existe: sacarlo de la lista`);
    }
  });
});
