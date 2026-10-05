const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

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
 * Historia: 12 / 6 / 6 archivos al crearla (2026-10-04); 10 / 3 / 4 ese mismo
 * día, al retirar la Gestión de Catálogo vieja (`modules/catalogo`); 8 / 2 / 4
 * al retirar el envío de compras a Alegra (`enviarFacturaAlegra`); y 5 / 1 / 3
 * al retirar la facturación contra Alegra y el módulo viejo de facturas
 * (`facturacion.service`, `modules/invoices`); y 2 / 1 / 3 al retirar el
 * módulo viejo de productos, lo que el router adaptador todavía le pedía a
 * Alegra y el teléfono que WhatsApp buscaba allá; y 2 / 1 / 0 al mudar las
 * pantallas a direcciones propias y borrar el adaptador (`routes/alegra.js`);
 * y 0 / 0 / 0 al iniciar inventario propio desde cero (pedido del usuario).
 *
 * Fuera de la cuenta, a propósito: `backend/scripts` (los cargadores y las
 * conciliaciones le leen a Alegra hasta el corte, que es para lo que están) y
 * la integración misma.
 */

const RAIZ = path.join(__dirname, '..', '..');

/** Código de la aplicación que importa `integrations/alegra`. */
const IMPORTAN_LA_INTEGRACION = [];

/** Código de la aplicación que lee o escribe la caché antigua. */
const USAN_LA_CACHE = [];

/**
 * Pantallas que llaman a `/alegra/...`. Ninguna desde el 2026-10-04: el
 * prefijo era el del router adaptador y se fue con él.
 */
const PANTALLAS_QUE_LLAMAN_A_ALEGRA = [];

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
  return sinComentarios(fs.readFileSync(path.join(RAIZ, relativa), 'utf8'));
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
