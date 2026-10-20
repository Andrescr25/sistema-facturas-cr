/**
 * El modal de nota de crédito y la tarjeta que deja en la factura.
 *
 * 2026-10-20, el usuario: «haz el modal de nota crédito más acorde al
 * sistema, y cuando la nota de crédito se haga haz que se acomode mejor ahí;
 * actualmente se ve muy desordenado». El modal tenía el contenido pegado a
 * los bordes, un campo de número suelto por línea y botones genéricos en un
 * azul ajeno a la paleta; la tarjeta apilaba monto, insignia y «Ver PDF» a la
 * derecha (en el teléfono, sueltos a la izquierda), y en la barra de
 * acciones «Anular» bajaba sola a un segundo renglón.
 * Pidió también, el día anterior, «recuerda reciclar código»: el contador
 * «− 1 +» estaba escrito dos veces y la nota iba a ser la tercera.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.resolve(__dirname, '../../frontend/src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));
const modal = leer('components', 'facturacion', 'ModalNotaCredito.jsx');
const tarjeta = leer('components', 'facturacion', 'NotasCreditoFactura.jsx');
const vista = leer('components', 'facturacion', 'VistaFactura.jsx');

let u;
before(async () => { u = await import('../../frontend/src/utils/facturaVista.js'); });

/** Todos los .jsx del frontend, para buscar copias. */
function componentes(dir = FRONT) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return componentes(ruta);
    return e.name.endsWith('.jsx') ? [ruta] : [];
  });
}

test('el contador «− 1 +» existe una sola vez y lo usan la factura, el modal de cantidad y la nota', () => {
  const conContador = componentes().filter((r) => /aria-label="Quitar uno"/.test(fs.readFileSync(r, 'utf8')));
  assert.deepEqual(conContador.map((r) => path.relative(FRONT, r)), [path.join('components', 'ui', 'Contador.jsx')]);
  for (const archivo of ['LineaFactura.jsx', 'ModalCantidad.jsx', 'ModalNotaCredito.jsx'])
    assert.match(leer('components', 'facturacion', archivo), /import Contador from '\.\.\/ui\/Contador'/, archivo);
  // El modal de cantidad sigue confirmando con Enter y enfocando su campo.
  assert.match(leer('components', 'facturacion', 'ModalCantidad.jsx'), /onEnter=\{onConfirmar\}\s+inputRef=\{cantidadInputRef\}/);
});

test('el modal usa el del sistema: pasos con aire, los motivos de utils, y abajo el total y ui/Boton', () => {
  assert.match(modal, /<Modal onCerrar=\{onCerrar\} titulo="Nota de crédito" ancho="xl" pie=\{pie\}>/);
  assert.match(modal, /<div className="flex flex-col gap-6 p-5">/, 'el contenido pegado a los bordes');
  assert.doesNotMatch(modal, /className="btn|btn-primary|btn-outline/, 'botones genéricos');
  assert.match(modal, /<Boton variante="secundario" tamano="lg" onClick=\{onCerrar\}/);
  assert.match(modal, /<Boton tamano="lg" icono=\{Undo2\} cargando=\{guardando\}/);
  // Una sola lista de motivos: la que también traduce el motivo en la tarjeta.
  assert.match(modal, /import \{ MOTIVOS_NOTA \} from '\.\.\/\.\.\/utils\/notaCreditoTexto'/);
  assert.doesNotMatch(modal, /'Descuento posterior'/);
  // El total y el error, en el pie: a la vista sin bajar.
  const pie = modal.slice(modal.indexOf('const pie = ('), modal.indexOf('return (\n    <Modal'));
  assert.match(pie, /error && <p role="alert"/);
  assert.match(pie, /colones\(totalNota\)/);
});

test('cada línea se devuelve con el contador, entre cero y lo facturado, y dice cuánto acredita', () => {
  assert.match(modal, /<Contador\s+valor=\{cantidades\[l\.numeroLinea\] \?\? 0\}\s+min=\{0\}\s+max=\{num\(l\.cantidad\)\}/);
  assert.match(modal, /Math\.min\(num\(l\.cantidad\), Math\.max\(0, num\(valor\)\)\)/);
  assert.match(modal, /Acredita \{colones\(acreditadoDe\(l, devolver\)\)\}/);
  assert.doesNotMatch(modal, /type="number"/, 'el campo suelto volvió');
});

test('lo que acredita una línea sale con su precio, su descuento y su tarifa', () => {
  const linea = { cantidad: 3, precioUnitario: 2000, descuentoPorcentaje: 5, tarifa: 13 };
  // 1 × 2.000 − 5 % = 1.900; con 13 %: 2.147.
  assert.equal(Math.round(u.acreditadoDe(linea, 1)), 2147);
  assert.equal(u.acreditadoDe({ ...linea, tarifa: 0, descuentoPorcentaje: 0 }, 2), 4000);
  assert.equal(u.acreditadoDe({ ...linea, tarifa: '1' }, 0), 0);
});

test('la tarjeta: una franja con número, estado y monto; el motivo en su renglón; «Ver PDF» al pie', () => {
  assert.match(tarjeta, /className="card !p-0 overflow-hidden rounded-2xl"/);
  const franja = tarjeta.slice(tarjeta.indexOf('<header'), tarjeta.indexOf('</header>'));
  assert.match(franja, /\{n\.numero\}/);
  assert.match(franja, /<Insignia tono="nota">Aplicada<\/Insignia>/);
  assert.match(franja, /\{colones\(n\.monto\)\}/);
  assert.doesNotMatch(franja, /motivoTexto|data-pdf-nota/);
  assert.match(tarjeta, /«\{n\.motivoTexto\}»/);
  const pie = tarjeta.slice(tarjeta.indexOf('<footer'));
  assert.match(pie, /<Boton variante="acento" icono=\{FileText\} data-pdf-nota=\{n\.id\}/);
});

test('las acciones de la factura van en dos grupos que bajan enteros, y la tarjeta del documento no suma relleno', () => {
  assert.equal((vista.match(/<div className=\{GRUPO_ACCIONES\}>/g) || []).length, 2);
  assert.match(vista, /const GRUPO_ACCIONES = 'contents sm:flex sm:gap-2'/);
  const segundo = vista.slice(vista.lastIndexOf('<div className={GRUPO_ACCIONES}>'));
  assert.ok(segundo.indexOf('Editar factura') < segundo.indexOf('onAnular(f)'), 'Editar, Emitir, Nota de crédito y Anular van juntos');
  assert.match(vista, /className=\{`card !p-0 overflow-hidden rounded-2xl \$\{editando/);
});
