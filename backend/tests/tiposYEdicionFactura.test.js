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

describe('editar sobre el mismo documento', () => {
  const vista = leer('components', 'facturacion', 'VistaFactura.jsx');

  test('no hay una pantalla de edición aparte', () => {
    // Editar en otro formulario obliga a comparar de memoria: uno cambia un
    // precio en una lista de campos y tiene que imaginarse cómo va a quedar el
    // documento. Los inputs van EN EL LUGAR del dato.
    assert.equal(fs.existsSync(ui('components', 'facturacion', 'EditorFactura.jsx')), false,
      'volvió a existir una pantalla de edición separada');
    assert.match(vista, /editando \?/);
  });

  // Desde el 2026-10-11 la pantalla está partida como el resto del proyecto:
  // las reglas en utils/facturaVista.js (probadas de verdad en
  // facturaVista.test.js), la copia que se edita en hooks/useEdicionFactura.js
  // y cada sección en su componente. Acá se cuida que sigan enchufadas.
  const reglas = leer('utils', 'facturaVista.js');
  const edicion = leer('hooks', 'useEdicionFactura.js');
  const lineas = leer('components', 'facturacion', 'LineasFactura.jsx');

  test('una factura electrónica, cobrada o acreditada no se edita, y dice por qué', () => {
    assert.match(vista, /const razonNoEditable = porQueNoSeEdita\(f, \{ reservaFiscal, emitiendo: Boolean\(emision\.fase\) \}\)/);
    assert.match(reglas, /\(f\.electronica \|\| reservaFiscal\?\.estado === 'aceptada'\) \?/);
    // Reservada ante Hacienda: lo dice la factura o, antes de releerla, el
    // panel de emisión (2026-10-11: al emitir de un clic quedaba un momento
    // con Editar ofrecido sobre un documento que la base ya no deja tocar).
    assert.match(reglas, /\|\| reservaFiscal\) \? 'Está reservada ante Hacienda/);
    assert.match(reglas, /emitiendo \? 'Se está emitiendo electrónicamente\.'/);
    assert.match(reglas, /cobrado > 0 \?/);
    assert.match(reglas, /acreditado > 0 \?/);
    // El botón queda apagado con el motivo a la vista, no muerto sin más.
    assert.match(vista, /disabled=\{Boolean\(razonNoEditable\)\}/);
  });

  test('el IVA no es un campo que se escriba', () => {
    // Los tres que sí se editan por línea, en su propia celda.
    for (const campo of ["'cantidad'", "'precioUnitario'", "'descuentoPorcentaje'"]) {
      assert.ok(lineas.includes(`cambiarLinea(i, ${campo}`), `falta poder editar ${campo}`);
    }
    for (const archivo of [vista, lineas, edicion]) {
      assert.equal(/cambiarLinea\(i, 'tarifa'/.test(archivo), false, 'el impuesto volvió a ser editable');
      assert.equal(/cambiarLinea\(i, 'impuesto/.test(archivo), false, 'el impuesto volvió a ser editable');
    }
  });

  test('la tarifa de una línea nueva sale del producto', () => {
    assert.match(reglas, /tarifa: p\.tax\?\.length \? num\(p\.tax\[0\]\.percentage\) : 0/);
    assert.match(edicion, /setLineas\(\[\.\.\.lineas, lineaDeProducto\(p\)\]\)/);
  });

  test('se puede corregir el cliente, que es el error más caro', () => {
    assert.match(reglas, /clienteId: cliente\?\.id/);
    assert.match(leer('components', 'facturacion', 'ClienteFactura.jsx'), /edicion\.elegirCliente\(c\)/);
  });

  test('el motivo de la corrección queda en la bitácora', () => {
    assert.match(reglas, /motivo: String\(motivo \|\| ''\)\.trim\(\) \|\| null/);
    assert.match(vista, /value=\{edicion\.motivo\} onChange=\{\(e\) => edicion\.setMotivo\(e\.target\.value\)\}/);
  });

  test('cancelar no deja nada a medias', () => {
    // La copia de trabajo se rehace cada vez que se entra a editar.
    assert.match(edicion, /if \(!editando\) return/);
    assert.match(edicion, /setLineas\(f\.lineas\.map\(filaDe\)\)/);
  });

  test('la pantalla quedó partida: reglas, gancho y secciones', () => {
    for (const parte of ['ClienteFactura', 'LineasFactura', 'TotalesFactura', 'CobrosFactura', 'NotasCreditoFactura']) {
      assert.match(vista, new RegExp(`<${parte}\\b`), `la sección ${parte} volvió a estar escrita dentro de la vista`);
    }
    assert.match(vista, /useEdicionFactura\(\{ factura: f, editando, clientes, productos, onGuardar \}\)/);
    assert.doesNotMatch(vista, /useState|useEffect|useMemo/, 'la vista volvió a guardar estado propio');
  });
});

describe('la pestaña de edición rápida', () => {
  const pestanas = leer('components', 'facturacion', 'PestanasFacturacion.jsx');

  test('existe solo en el teléfono, salvo cuando hay algo por subir', () => {
    // La cola de ventas sin enviar vive solo en ese panel: con algo pendiente
    // tiene que verse también en tablet y escritorio (2026-10-11; ver
    // facturacionFlujoPantalla.test.js).
    assert.match(pestanas, /soloMovil: porSubir === 0/);
    assert.match(pestanas, /soloMovil \? 'md:hidden '/);
  });

  test('"Facturas" está en las dos', () => {
    const facturas = pestanas.slice(pestanas.indexOf("clave: 'facturas'"));
    assert.equal(/soloMovil/.test(facturas.split('\n')[0]), false);
  });
});

// El antiguo botón deshabilitado se reemplazó por el flujo fiscal. Sus estados
// y la aceptación real se comprueban en haciendaFiscal/haciendaPg.
