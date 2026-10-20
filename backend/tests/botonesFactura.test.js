/**
 * Los botones de la factura abierta (Facturación → Facturas).
 *
 * 2026-10-19, el usuario: «en editar facturas dentro de facturas haz que
 * estos btns salgan al final de la factura y NO al principio: Cancelar,
 * Guardar cambios. Haz que todo el diseño de btns sea más acorde al sistema y
 * no tan genéricos, recuerda reciclar código». Se reutiliza ui/Boton, el
 * botón del sistema, con la variante según lo que hace cada uno.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sinComentarios } = require('./dobles/sinComentarios');

const leer = (...p) => sinComentarios(fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/facturacion', ...p), 'utf8'));
const vista = leer('VistaFactura.jsx');

test('editando, Cancelar y Guardar cambios van al final de la factura, con el error al lado', () => {
  const final = vista.lastIndexOf('{editando && (');
  assert.ok(final > vista.indexOf('Términos y condiciones'), 'los botones quedaron antes del final del documento');
  const pie = vista.slice(final);
  assert.match(pie, /<Boton variante="secundario" tamano="lg" icono=\{X\} onClick=\{onCancelarEdicion\}/);
  assert.match(pie, /<Boton tamano="lg" icono=\{Save\} cargando=\{edicion\.guardando\} onClick=\{edicion\.guardar\}/);
  assert.match(pie, /edicion\.error && <p role="alert"/);
  // Arriba, editando, solo queda qué se edita.
  const arriba = vista.slice(vista.lastIndexOf('return ('), vista.indexOf('<PanelEmisionFactura'));
  assert.doesNotMatch(arriba, /Guardar cambios|onCancelarEdicion/);
});

test('los botones de la factura son el botón del sistema, no la clase genérica', () => {
  for (const archivo of ['VistaFactura.jsx', 'BotonEmitirFactura.jsx', 'PanelEmisionFactura.jsx', 'NotasCreditoFactura.jsx', 'CobrosFactura.jsx']) {
    const fuente = leer(archivo);
    assert.doesNotMatch(fuente, /className="btn[ "]|className=\{`btn /, `${archivo} volvió a usar la clase genérica btn`);
    assert.match(fuente, /import Boton from '\.\.\/ui\/Boton'/, `${archivo} no usa ui/Boton`);
  }
  // La variante dice lo que hace: anular es peligro; volver, fantasma.
  assert.match(vista, /<Boton variante="peligro" icono=\{Ban\} onClick=\{\(\) => onAnular\(f\)\}>Anular<\/Boton>/);
  assert.match(vista, /<Boton variante="fantasma" icono=\{ArrowLeft\} onClick=\{onVolver\}>Volver<\/Boton>/);
  // Las marcas que usan las pruebas de navegador siguen en su botón.
  assert.match(leer('BotonEmitirFactura.jsx'), /<Boton variante="secundario" icono=\{ShieldCheck\} data-emitir-electronica/);
  assert.match(leer('PanelEmisionFactura.jsx'), /data-enviar-cliente/);
  assert.match(leer('NotasCreditoFactura.jsx'), /data-pdf-nota=\{n\.id\}/);
});
