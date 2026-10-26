/**
 * La foto de una categoría se muestra completa, con su proporción (2026-10-25).
 *
 * El usuario: «ahora está recortando mucho la imagen que pongo». La foto de
 * Línea Eléctrica (1870 × 841, con el bombillo a la derecha) llegaba al
 * teléfono como una columna de 960 px sacada del centro —el bombillo partido a
 * la mitad— y en pantallas anchas se veía por una franja fija de 216 px.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.resolve(__dirname, '../../frontend/src');
const cargar = () => import(pathToFileURL(path.join(FRONT, 'utils/proporcionImagenCategoria.js')));
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

// Lo que hay guardado en producción para Línea Eléctrica.
const ELECTRICA = { url: '/archivos/categorias/9-grande.webp', urlMovil: '/archivos/categorias/9-movil.webp', ancho: 1870, alto: 841, anchoMovil: 960, altoMovil: 841 };

describe('proporción de la foto de una categoría', () => {
  test('la relación sale de las medidas guardadas; sin ellas no se inventa', async () => {
    const { relacionDeImagen } = await cargar();
    assert.equal(relacionDeImagen(ELECTRICA), 1870 / 841);
    assert.equal(relacionDeImagen({ ancho: 1920, alto: 1080 }), 16 / 9);
    for (const sin of [null, undefined, {}, { ancho: 0, alto: 100 }, { ancho: 100 }, { ancho: '1920', alto: '1080' }, { ancho: Infinity, alto: 5 }]) {
      assert.equal(relacionDeImagen(sin), null, JSON.stringify(sin));
    }
  });

  test('la copia del teléfono recortada antes de este cambio se ignora: se usa la grande, entera', async () => {
    const { urlMovilUsable } = await cargar();
    assert.equal(urlMovilUsable(ELECTRICA), null, 'la de Línea Eléctrica quedó partida: 960 de 1870 px de ancho');
  });

  test('la copia del teléfono de la misma foto sí sirve, con el redondeo de los dos tamaños', async () => {
    const { urlMovilUsable } = await cargar();
    const nueva = { url: '/g.webp', urlMovil: '/m.webp', ancho: 1870, alto: 841, anchoMovil: 960, altoMovil: 432 };
    assert.equal(urlMovilUsable(nueva), '/m.webp');
    assert.equal(urlMovilUsable({ ...nueva, altoMovil: 431 }), '/m.webp');
    assert.equal(urlMovilUsable({ ...nueva, altoMovil: 480 }), null, 'una proporción distinta no es la misma foto');
  });

  test('sin medidas para comparar se asume que sirve; sin copia móvil no hay ninguna', async () => {
    const { urlMovilUsable } = await cargar();
    assert.equal(urlMovilUsable({ url: '/g.webp', urlMovil: '/m.webp' }), '/m.webp');
    assert.equal(urlMovilUsable({ url: '/g.webp', urlMovil: '/m.webp', ancho: 1920, alto: 1080 }), '/m.webp');
    assert.equal(urlMovilUsable({ url: '/g.webp', ancho: 1920, alto: 1080 }), null);
    assert.equal(urlMovilUsable(null), null);
  });
});

describe('la cabecera usa esa proporción', () => {
  const css = leer('components', 'catalogo-agente', 'introduccionCategoria.css');
  const jsx = leer('components', 'catalogo-agente', 'IntroduccionCategoria.jsx');

  test('una foto con medidas pone el banner en su proporción; la de respaldo conserva la franja', () => {
    assert.match(jsx, /const relacion = foto && !foto\.esProducto \? relacionDeImagen\(foto\) : null/);
    assert.match(jsx, /relacion \? 'introduccion-categoria--foto' : ''/);
    assert.match(jsx, /'--relacion': `\$\{foto\.ancho\} \/ \$\{foto\.alto\}`/);
    assert.match(jsx, /\{movil && <source media="\(max-width: 767px\)" srcSet=\{urlArchivo\(movil\)\} \/>\}/);
    assert.doesNotMatch(jsx, /foto\.urlMovil/, 'la copia móvil pasa siempre por urlMovilUsable');
  });

  test('el CSS toma la proporción, la limita por tramo y deja crecer al texto', () => {
    const bloque = css.slice(css.indexOf('.introduccion-categoria--foto {'));
    assert.match(bloque, /aspect-ratio: var\(--relacion\)/);
    assert.match(bloque, /width: 100%/, 'sin el ancho fijo, el tope de alto angosta el banner');
    assert.match(bloque, /overflow: clip/);
    assert.match(bloque, /min-height: auto/, 'sin un mínimo fijo: el alto nunca baja de lo que ocupa el texto');
    const topes = [...bloque.matchAll(/max-height: (\d+)px/g)].map((m) => Number(m[1]));
    assert.deepEqual(topes, [260, 340, 420], 'teléfono, tablet y pantalla ancha');
    assert.doesNotMatch(bloque, /min-height:\s*\d/, 'un mínimo en px volvería a recortar o a tapar el texto');
  });

  test('la vista previa de Gestión mide la foto elegida para mostrar la misma forma', () => {
    assert.match(leer('hooks', 'useImagenCategoria.js'), /naturalWidth/);
    assert.match(leer('components', 'gestion-catalogo', 'ImagenCategoria.jsx'), /imagen=\{preview \? \{ url:preview, \.\.\.medidas \} : categoria\.imagen\}/);
  });
});
