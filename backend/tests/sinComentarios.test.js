const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { sinComentarios } = require('./dobles/sinComentarios');

/**
 * El ayudante de las pruebas de ausencia ("nadie llama a esto") no puede
 * esconder código. El anterior —dos expresiones regulares— lo hacía: un `/*`
 * adentro de un comentario de línea o de un texto abría un bloque falso que
 * se tragaba el código siguiente, y la prueba pasaba sin haberlo mirado.
 */
describe('quitar comentarios sin tragarse código', () => {
  test('un `/*` dentro de un comentario de línea no abre un bloque', () => {
    const fuente = [
      "// las rutas viejas: `/alegra/facturas/*`, `/alegra/productos*`",
      "const a = api.get('/reportes/faltantes/cliente')",
      "/** documentación */",
      "const b = 1"
    ].join('\n');

    assert.match(sinComentarios(fuente), /api\.get\('\/reportes\/faltantes\/cliente'\)/);
  });

  test('un `/*` dentro de un texto tampoco', () => {
    const fuente = "const rutas = ['/api/proveedores/*', '/api/faltantes/*'];\nrequire('../integrations/alegra'); /* fin */";

    assert.match(sinComentarios(fuente), /integrations\/alegra/);
    assert.match(sinComentarios(fuente), /\/api\/proveedores\/\*/);
  });

  test('`//` dentro de un texto no es un comentario', () => {
    assert.match(sinComentarios("const url = 'https://ejemplo.cr/x'; uno()"), /ejemplo\.cr\/x'; uno\(\)/);
  });

  test('los comentarios de verdad sí se van', () => {
    assert.equal(sinComentarios("/* require('integrations/alegra') */ dos()").includes('integrations'), false);
    assert.equal(sinComentarios("uno() // require('integrations/alegra')").includes('integrations'), false);
    assert.equal(sinComentarios("/**\n * `/alegra/bodega`\n */\ntres()").includes('alegra'), false);
  });

  test('un apóstrofo suelto no se come el resto del archivo', () => {
    // Texto de JSX o una expresión regular: la "cadena" termina con la línea.
    const fuente = "<p>No hay D'Leon</p>\n// require('integrations/alegra')\ncuatro()";
    const limpio = sinComentarios(fuente);

    assert.equal(limpio.includes('integrations'), false);
    assert.match(limpio, /cuatro\(\)/);
  });
});
