/**
 * La presentación de cada categoría del catálogo del agente pasa CON el
 * scroll: nunca se fija en pantalla ni lo detiene.
 *
 * 2026-10-19, el usuario, después de probar en la tablet la versión con
 * pantalla oscura y escena fija entre categorías: «en la tablet sigue igual,
 * muy pegado. No quiero que la animación se detenga para mostrar la
 * categoría, quiero que siga el deslizamiento». La escena fija ocupaba un
 * tramo del recorrido en el que el dedo bajaba y nada se movía: eso se
 * sentía como scroll trabado. Se retiró entera (velo, escena, tramo y su
 * control por cuadro); queda la cabecera de la categoría en su lugar, con su
 * foto y su entrada breve, como un elemento más del recorrido.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.resolve(__dirname, '../../frontend/src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));
const existe = (...p) => fs.existsSync(path.join(FRONT, ...p));

test('ya no hay escena fija, velo ni tramo de recorrido entre categorías', () => {
  for (const archivo of ['components/catalogo-agente/TransicionCategoria.jsx', 'components/catalogo-agente/RecorridoCategorias.jsx',
    'components/catalogo-agente/transicionCategoria.css', 'utils/focoCategoria.js'])
    assert.equal(existe(archivo), false, `${archivo} volvió: la categoría no se fija en pantalla`);
  for (const hoja of fs.readdirSync(path.join(FRONT, 'components', 'catalogo-agente')).filter((f) => f.endsWith('.css'))) {
    const css = leer('components', 'catalogo-agente', hoja);
    assert.doesNotMatch(css, /position:\s*fixed/, `${hoja}: nada del recorrido se fija en pantalla`);
    assert.doesNotMatch(css, /min-height:[^;]*s?vh/, `${hoja}: ningún tramo vacío del alto de la pantalla`);
  }
});

test('la página pone la cabecera de cada categoría en el recorrido, junto a sus productos', () => {
  const pagina = leer('pages', 'CatalogoAgente.jsx');
  assert.match(pagina, /import IntroduccionCategoria from '\.\.\/components\/catalogo-agente\/IntroduccionCategoria'/);
  assert.equal((pagina.match(/<IntroduccionCategoria nombre=/g) || []).length, 2, 'en las categorías y en los bloques de ofertas/nuevos');
  assert.doesNotMatch(pagina, /flushSync|scrollIntoView/);
  // Elegir una categoría muestra su cabecera y sus primeros productos arriba.
  assert.match(pagina, /setCategoria\(clave\)\n\s+window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/);
});

test('la cabecera es un título de verdad y su foto no traba el cuadro en que aparece', () => {
  const intro = leer('components', 'catalogo-agente', 'IntroduccionCategoria.jsx');
  assert.match(intro, /const Titulo = `h\$\{nivel\}`/);
  assert.match(intro, /loading="lazy" decoding="async" fetchpriority="low"/, 'cada foto se baja al acercarse, no las diecinueve juntas');
  assert.match(intro, /onLoad=\{mostrarCuandoEsteLista\}/);
  assert.match(intro, /foto\.decode\(\)\.then\(lista, lista\)/);
  assert.match(leer('components', 'catalogo-agente', 'introduccionCategoria.css'), /img:not\(\[data-lista\]\) \{ opacity: 0; \}/);
  // La entrada es breve y no retiene: una animación de CSS al aparecer.
  assert.match(intro, /observarEntradaCategoria\(elemento\.current\)/);
});

test('las barras fijas no desenfocan lo que pasa por debajo', () => {
  for (const barra of ['BarraSuperior.jsx', 'BarraCategorias.jsx'])
    assert.doesNotMatch(leer('components', 'catalogo-agente', barra), /backdrop-blur/,
      `${barra}: un desenfoque detrás de una barra fija se recalcula en cada cuadro del scroll`);
});
