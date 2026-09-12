const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/**
 * Tipos de factura y edición desde la pantalla.
 *
 * Lo que se cuida acá:
 *  - que "Factura de venta" y "Factura electrónica" sigan siendo dos cosas
 *    distintas del estado (pagada, anulada);
 *  - que el IVA NO vuelva a ser un campo escribible: la tarifa sale del
 *    maestro del producto, y dejarla a mano es el agujero por el que se
 *    facturaron productos al 1 % cobrando 13 %;
 *  - que la edición rápida siga existiendo en el teléfono y no en escritorio,
 *    donde se corrige entrando a la factura.
 */

const ui = (...p) => path.join(__dirname, '..', '..', 'frontend', 'src', ...p);
const leer = (...p) => fs.readFileSync(ui(...p), 'utf8');

describe('las dos etiquetas', () => {
  const etiqueta = leer('components', 'facturacion', 'EtiquetaTipoFactura.jsx');

  test('dicen "Factura de venta" o "Factura electrónica" según la marca', () => {
    assert.match(etiqueta, /electronica\s*\?/);
    assert.match(etiqueta, /'Factura electrónica'/);
    assert.match(etiqueta, /'Factura de venta'/);
  });

  test('un tiquete no se llama factura', () => {
    assert.match(etiqueta, /'Tiquete electrónico'/);
    assert.match(etiqueta, /'Tiquete'/);
  });

  test('salen en la lista y en el documento', () => {
    assert.match(leer('components', 'facturacion', 'PanelFacturasEmitidas.jsx'), /<EtiquetaTipoFactura/);
    assert.match(leer('components', 'facturacion', 'VistaFactura.jsx'), /<EtiquetaTipoFactura/);
  });
});

describe('editar desde la pantalla', () => {
  const vista = leer('components', 'facturacion', 'VistaFactura.jsx');
  const editor = leer('components', 'facturacion', 'EditorFactura.jsx');

  test('una factura electrónica, cobrada o acreditada no se edita, y dice por qué', () => {
    assert.match(vista, /razonNoEditable/);
    assert.match(vista, /electronica \?/);
    assert.match(vista, /cobrado > 0 \?/);
    assert.match(vista, /acreditado > 0 \?/);
    // El botón queda apagado con el motivo a la vista, no muerto sin más.
    assert.match(vista, /disabled=\{Boolean\(razonNoEditable\)\}/);
  });

  test('el IVA no es un campo que se escriba', () => {
    // Los tres que sí se editan por línea.
    for (const campo of ["'quantity'", "'price'", "'discount'"]) {
      assert.ok(editor.includes(`cambiarItem(i, ${campo}`), `falta poder editar ${campo}`);
    }
    assert.equal(/cambiarItem\(i, 'tax'/.test(editor), false, 'el impuesto volvió a ser editable');
    assert.equal(/cambiarItem\(i, 'tarifa'/.test(editor), false, 'el impuesto volvió a ser editable');
  });

  test('la tarifa de una línea nueva sale del producto', () => {
    assert.match(editor, /p\.tax\?\.length \? \[\{ percentage: num\(p\.tax\[0\]\.percentage\) \}\]/);
  });

  test('se puede corregir el cliente, que es el error más caro', () => {
    assert.match(editor, /clienteId: cliente\.id/);
  });

  test('el motivo de la corrección queda en la bitácora', () => {
    assert.match(editor, /motivo: motivo\.trim\(\) \|\| null/);
  });
});

describe('la pestaña de edición rápida', () => {
  const pestanas = leer('components', 'facturacion', 'PestanasFacturacion.jsx');

  test('existe solo en el teléfono', () => {
    assert.match(pestanas, /soloMovil: true/);
    assert.match(pestanas, /soloMovil \? 'md:hidden '/);
  });

  test('"Facturas" está en las dos', () => {
    const facturas = pestanas.slice(pestanas.indexOf("clave: 'facturas'"));
    assert.equal(/soloMovil/.test(facturas.split('\n')[0]), false);
  });
});

test('la emisión electrónica no dice haber emitido nada', () => {
  // Está pospuesta: el botón queda a la vista para que se sepa que el paso
  // existe, pero apagado. Uno que dijera que emitió sin emitir sería peor que
  // no tenerlo.
  const vista = leer('components', 'facturacion', 'VistaFactura.jsx');
  const bloque = vista.slice(vista.indexOf('Emitir electrónicamente') - 700, vista.indexOf('Emitir electrónicamente'));
  assert.match(bloque, /disabled/);
  assert.match(bloque, /todavía no está habilitada/);
});
