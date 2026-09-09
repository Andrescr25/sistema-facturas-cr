/**
 * Barrera para que el diseño no se vuelva a desordenar.
 *
 * POR QUÉ EXISTE
 * El sistema llegó a tener tres colores compitiendo por el mismo papel
 * —blue 516, emerald 344, green 168— repartidos según CUÁNDO se escribió
 * cada módulo. Unificarlo costó 3.901 reemplazos en 166 archivos. Sin algo
 * que lo vigile, en unos meses estamos igual: nadie escribe `bg-blue-600`
 * por maldad, lo copia del archivo que tenía al lado.
 *
 * Esta prueba es lo que convierte el orden en algo que se mantiene solo.
 *
 * QUÉ VIGILA
 *   1. Que no vuelvan los colores crudos de Tailwind (hay que usar los roles).
 *   2. Que no se usen pasos que Tailwind NO tiene (border-neutro-150), que no
 *      generan CSS y dejan el borde del color por omisión sin que nadie note.
 *   3. Que no se invoquen clases propias inexistentes (btn-danger,
 *      badge-success), que renderizan un elemento sin estilo.
 *
 * Vive en el backend porque es donde está `npm test`. Lee los archivos del
 * frontend como texto: no necesita navegador ni compilar nada.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const CSS = path.join(FRONT, 'index.css');

const PREFIJOS = '(?:bg|text|border|ring|ring-offset|from|to|via|divide|placeholder|shadow|outline|accent|decoration|fill|stroke|caret)';

// Escalas de Tailwind que ya NO se usan directamente: cada una tiene su rol.
const CRUDOS = ['blue', 'emerald', 'green', 'slate', 'gray', 'zinc', 'stone',
                'red', 'rose', 'amber', 'yellow', 'orange', 'indigo', 'sky',
                'purple', 'violet'];

const ROLES = ['neutro', 'primario', 'acento', 'peligro', 'alerta', 'exito',
               'cliente', 'nota', 'azul', 'naranja'];

const PASOS_VALIDOS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

function archivosJsx(dir) {
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosJsx(completo));
    else if (entrada.name.endsWith('.jsx')) salida.push(completo);
  }
  return salida;
}

/**
 * Se quitan los comentarios antes de revisar.
 *
 * Los componentes compartidos EXPLICAN en su encabezado qué desorden vinieron
 * a resolver, y para eso nombran los colores viejos ("había bg-emerald-600,
 * bg-blue-600, bg-slate-900..."). Sin esto, la prueba señalaba justamente a
 * los archivos que arreglaron el problema.
 */
function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, '')   // bloque
    .replace(/(^|[^:])\/\/.*$/gm, '$1'); // línea (sin comerse el // de una URL)
}

const ARCHIVOS = archivosJsx(FRONT).map(f => ({
  ruta: path.relative(FRONT, f),
  texto: sinComentarios(fs.readFileSync(f, 'utf8')),
}));

describe('vocabulario de diseño', () => {
  test('ningún archivo usa un color crudo de Tailwind', () => {
    const patron = new RegExp(`\\b${PREFIJOS}-(${CRUDOS.join('|')})-\\d{2,3}\\b`, 'g');
    const culpables = [];
    for (const { ruta, texto } of ARCHIVOS) {
      const hallazgos = texto.match(patron);
      if (hallazgos) culpables.push(`${ruta}: ${[...new Set(hallazgos)].slice(0, 3).join(', ')}`);
    }
    assert.deepEqual(culpables, [],
      `Hay que usar los roles (primario, peligro, alerta, exito, neutro, cliente, nota),\n` +
      `no el color directo. Encontrado en:\n  ${culpables.join('\n  ')}`);
  });

  test('no se usan pasos de color que Tailwind no tiene', () => {
    const patron = new RegExp(`\\b${PREFIJOS}-(?:${ROLES.join('|')})-(\\d{2,3})\\b`, 'g');
    const culpables = [];
    for (const { ruta, texto } of ARCHIVOS) {
      for (const hallazgo of texto.matchAll(patron)) {
        if (!PASOS_VALIDOS.includes(hallazgo[1])) culpables.push(`${ruta}: ${hallazgo[0]}`);
      }
    }
    assert.deepEqual(culpables, [],
      `Estos pasos no existen, así que la clase no genera CSS y el elemento se\n` +
      `queda con el estilo por omisión sin que nadie lo note:\n  ${culpables.join('\n  ')}`);
  });

  test('no se invocan clases propias que no están definidas en index.css', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    // Clases del proyecto (no de Tailwind) que aparecen en className="...".
    const PROPIAS = ['btn', 'btn-sm', 'btn-primary', 'btn-secondary', 'btn-outline',
                     'btn-danger', 'btn-success', 'btn-warning', 'card', 'input',
                     'label', 'badge', 'badge-success', 'spinner'];
    const usadas = new Set();
    for (const { texto } of ARCHIVOS) {
      for (const m of texto.matchAll(/className="([^"{}]+)"/g)) {
        for (const cls of m[1].split(/\s+/)) if (PROPIAS.includes(cls)) usadas.add(cls);
      }
    }
    const sinDefinir = [...usadas].filter(c => !new RegExp(`^\\s*\\.${c}\\s*[,{]`, 'm').test(css));
    assert.deepEqual(sinDefinir, [],
      `Se usan pero no existen en index.css, así que el elemento sale sin estilo: ${sinDefinir.join(', ')}`);
  });

  test('la prueba sirve: detectaría un color crudo si volviera', () => {
    // Sin esto, los tests de arriba pasarían igual si el patrón estuviera mal
    // escrito y no encontrara nunca nada.
    const patron = new RegExp(`\\b${PREFIJOS}-(${CRUDOS.join('|')})-\\d{2,3}\\b`);
    assert.ok(patron.test('<div className="bg-blue-600 p-4">'), 'el patrón no detecta bg-blue-600');
    assert.ok(!patron.test('<div className="bg-primario-800 p-4">'), 'el patrón marca un rol válido');
  });
});

/**
 * Un modal que se monta SIEMPRE y decide adentro si dibujarse
 * (`if (!abierto) return null`) no puede llamar a useModal sin decirle si
 * está visible: los hooks no pueden ir después de un return, así que el hook
 * corre igual con el modal cerrado y bloquea el scroll de una página que no
 * tiene ningún modal abierto.
 *
 * Pasó de verdad: Reporte Contador quedó sin poder desplazarse y no se
 * podían ver las facturas.
 */
describe('modales y el bloqueo de scroll', () => {
  const conHook = ARCHIVOS.filter(a => /useModal\s*\(/.test(a.texto));

  test('hay modales usando el hook', () => {
    assert.ok(conHook.length > 10, `solo ${conHook.length} archivos usan useModal; ¿se renombró el hook?`);
  });

  test('todo modal que pueda devolver null le pasa su visibilidad al hook', () => {
    const culpables = [];
    for (const { ruta, texto } of conHook) {
      const devuelveNull = /^\s*if\s*\([^)]*\)\s*return null/m.test(texto);
      const llamada = texto.match(/useModal\s*\(([^)]*)\)/);
      const pasaVisibilidad = llamada && llamada[1].includes(',');
      if (devuelveNull && !pasaVisibilidad) culpables.push(`${ruta}: useModal(${llamada?.[1] || '?'})`);
    }
    assert.deepEqual(culpables, [],
      `Estos modales se auto-ocultan pero no le dicen al hook si están visibles,\n` +
      `así que bloquean el scroll de la página estando cerrados:\n  ${culpables.join('\n  ')}`);
  });

  test('el hook acepta el segundo argumento', () => {
    const hook = fs.readFileSync(path.join(FRONT, 'hooks', 'useModal.js'), 'utf8');
    assert.match(hook, /export function useModal\(\s*onCerrar\s*,\s*activo/,
      'useModal debe recibir `activo`; sin eso, los modales que se auto-ocultan no tienen cómo avisar');
  });
});

/**
 * La barra lateral tiene que desplazarse, y su pie tiene que quedar puesto.
 *
 * LO QUE PASÓ
 * El contenedor del menú ya tenía `overflow-y-auto` y aun así no se
 * desplazaba: el navegador le da `min-height: auto` a un elemento flexible,
 * o sea que no se encoge por debajo de su contenido. Con los cinco grupos de
 * módulos abiertos el menú medía 952px, y en una pantalla de 900 el pie de
 * sesión terminaba en y=1016 — fuera de la vista. No había forma de cerrar
 * sesión sin borrar el almacenamiento del navegador, que es justo el
 * problema que ese pie vino a resolver.
 *
 * `min-h-0` es lo que lo destraba, y no se ve en ninguna revisión visual:
 * la pantalla se ve bien mientras el menú quepa. Por eso se vigila acá.
 */
describe('la barra lateral se desplaza', () => {
  const layout = fs.readFileSync(path.join(FRONT, 'components', 'Layout.jsx'), 'utf8');
  // Los dos contenedores que envuelven el <SidebarNav>: el del cajón de
  // móvil y el de escritorio.
  const contenedores = layout.match(/className="[^"]*overflow-y-auto[^"]*"/g) || [];

  test('hay dos contenedores desplazables, uno por barra', () => {
    assert.equal(contenedores.length, 2,
      `se esperaban 2 (móvil y escritorio) y hay ${contenedores.length}`);
  });

  test('los dos llevan min-h-0, o el overflow no sirve de nada', () => {
    const sinMinH = contenedores.filter(c => !/\bmin-h-0\b/.test(c));
    assert.deepEqual(sinMinH, [],
      'Sin min-h-0 el contenedor crece con su contenido y nunca aparece la barra:\n  ' +
      sinMinH.join('\n  '));
  });

  test('el pie de sesión no cede lugar', () => {
    const pie = fs.readFileSync(path.join(FRONT, 'components', 'PieSesion.jsx'), 'utf8');
    assert.match(pie, /shrink-0/,
      'PieSesion tiene que llevar shrink-0: es lo último de la barra y sin eso lo aplasta el menú');
  });

  test('la clase de la barra fina existe en index.css', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    assert.match(css, /\.barra-fina\b/);
  });
});

/**
 * Facturación decide su diseño con CSS, no con JavaScript.
 *
 * LO QUE PASÓ
 * El módulo exponía `isMobile` desde el hook y se lo pasaba a los doce
 * componentes; cada uno devolvía un árbol distinto según esa bandera. Tres
 * consecuencias, y las tres se veían en el teléfono:
 *
 *   · `isMobile` arranca en `false`, así que el teléfono pintaba primero la
 *     variante de escritorio y saltaba a la otra al montar.
 *   · No había comportamiento intermedio: una tableta caía de un lado o del
 *     otro de un salto.
 *   · Cada componente tenía dos caminos que mantener, y se habían separado
 *     solos — un arreglo aplicado en una rama y no en la otra.
 *
 * El hook puede seguir usando `isMobile` para COMPORTAMIENTO (a dónde mandar
 * el foco, cuándo hacer scroll). Lo que no puede volver es que un componente
 * de presentación lo reciba para decidir cómo se ve.
 */
describe('Facturación no ramifica el diseño en JavaScript', () => {
  const DIR = path.join(FRONT, 'components', 'facturacion');
  const archivos = fs.readdirSync(DIR)
    .filter(n => n.endsWith('.jsx'))
    .map(n => ({ ruta: `components/facturacion/${n}`, texto: sinComentarios(fs.readFileSync(path.join(DIR, n), 'utf8')) }));

  archivos.push({
    ruta: 'pages/Facturacion.jsx',
    texto: sinComentarios(fs.readFileSync(path.join(FRONT, 'pages', 'Facturacion.jsx'), 'utf8'))
  });

  test('hay componentes de facturación que revisar', () => {
    assert.ok(archivos.length > 8, `solo ${archivos.length} archivos; ¿se movió el módulo?`);
  });

  test('ningún componente recibe ni usa isMobile', () => {
    const culpables = archivos.filter(a => /\bisMobile\b/.test(a.texto)).map(a => a.ruta);
    assert.deepEqual(culpables, [],
      'El diseño se decide con puntos de quiebre de CSS, no con una bandera de JavaScript.\n' +
      'Volvió a aparecer isMobile en:\n  ' + culpables.join('\n  '));
  });

  test('el cobro está fuera de la lista de productos', () => {
    // El botón de facturar vivía al final de la lista: con quince líneas en
    // un teléfono había que recorrer la factura entera para cerrarla.
    const cobro = fs.readFileSync(path.join(DIR, 'PanelCobro.jsx'), 'utf8');
    assert.match(cobro, /fixed inset-x-0 bottom-0/,
      'PanelCobro debe tener la barra fija abajo para pantalla angosta');
    assert.match(cobro, /sticky/,
      'PanelCobro debe quedar pegado en la columna de escritorio');
  });
});
