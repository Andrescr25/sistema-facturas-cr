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
  assert.match(vista, /<Boton variante="peligro" className=\{ANCHO_MOVIL\} icono=\{Ban\} onClick=\{\(\) => onAnular\(f\)\}>Anular<\/Boton>/);
  assert.match(vista, /<Boton variante="fantasma" icono=\{ArrowLeft\} onClick=\{onVolver\}>Volver<\/Boton>/);
  // Las marcas que usan las pruebas de navegador siguen en su botón.
  assert.match(leer('BotonEmitirFactura.jsx'), /<Boton variante="primario" icono=\{ShieldCheck\} data-emitir-electronica className=\{className\}/);
  assert.match(leer('PanelEmisionFactura.jsx'), /data-enviar-cliente/);
  assert.match(leer('NotasCreditoFactura.jsx'), /data-pdf-nota=\{n\.id\}/);
});

// «Ponle color a estos btn: Ver PDF, WhatsApp, Correo, Editar factura, Emitir
// electrónicamente, Nota de crédito» (2026-10-19): cada uno con el tono de lo
// que hace, de las variantes de ui/Boton (no colores sueltos).
test('cada acción de la factura tiene su color, por significado', () => {
  for (const [variante, icono] of [['acento', 'FileText'], ['exito', 'MessageCircle'], ['activo', 'Mail'], ['alerta', 'PencilLine'], ['nota', 'Undo2']]) {
    assert.match(vista, new RegExp(`<Boton variante="${variante}" className=\\{ANCHO_MOVIL\\} icono=\\{${icono}\\}`), `${icono} sin su color`);
  }
  const boton = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/ui/Boton.jsx'), 'utf8');
  for (const tono of ['activo', 'exito', 'alerta', 'nota', 'acento']) assert.match(boton, new RegExp(`  ${tono}: \`bg-[a-z]+-50 text-[a-z]+-[78]00 ring-[a-z]+-200`));
});

// «Este módulo hazlo completamente responsive» (2026-10-19).
test('en el teléfono las líneas son tarjetas y las acciones van en dos columnas', () => {
  const lineas = leer('LineasFactura.jsx');
  assert.match(lineas, /<ul className="divide-y divide-neutro-100 md:hidden">/, 'sin tarjetas para el teléfono');
  assert.match(lineas, /<div className="hidden overflow-x-auto md:block">/, 'la tabla tiene que quedar solo para pantalla ancha');
  // Un solo componente por campo, usado por la tabla y por la tarjeta.
  for (const campo of ['Cantidad', 'Precio', 'Descuento']) assert.equal((lineas.match(new RegExp(`<${campo} l=\\{l\\}`, 'g')) || []).length, 2, campo);
  assert.match(vista, /grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex/);
  // El ícono del calendario, dentro de su campo de fecha (antes se iba al borde de la tarjeta).
  const css = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/index.css'), 'utf8');
  const fecha = css.match(/input\[type="date"\]\s*\{([^}]+)\}/)?.[1] || '';
  // La propiedad puede convivir con las reglas que ajustan la caja en iOS;
  // no depende de ser la primera declaración ni de su sangría.
  assert.match(fecha, /\bposition:\s*relative\s*;/);
  // Los campos de edición, con letra de 16 px en el teléfono (sin zoom).
  assert.match(fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/facturacion/estilosFactura.js'), 'utf8'), /py-2 text-base md:px-1\.5 md:py-1 md:text-sm/);
});

