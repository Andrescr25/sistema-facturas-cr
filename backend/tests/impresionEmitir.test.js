/**
 * «Imprimir y emitir» en Impresión.
 *
 * 2026-10-20, el usuario: «hay facturas que siempre se emiten, pero estas se
 * emiten hasta después del proceso de impresión; entonces pongamos un filtro
 * que todas las facturas que tienen correo en impresión salga el botón así:
 * imprimir y emitir. Eso sí, que el proceso de rebajas y ajustes de precios
 * en impresión se haga primero y después se emita».
 *
 * El orden queda guardar → emitir → imprimir: Hacienda recibe la factura con
 * los faltantes rebajados y los precios ajustados, y el papel sale como
 * «Factura electrónica» con su clave. El orden de guardar y emitir lo prueba
 * impresionHook.test.js con el gancho real.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.resolve(__dirname, '../../frontend/src');
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));

let u;
before(async () => { u = await import(pathToFileURL(path.join(FRONT, 'utils', 'impresionUtils.js'))); });

const fila = (extra = {}) => ({ numero_factura: '001000015100', cliente_email: 'zz@ejemplo.com', electronica: false, con_comprobante: false, historica: false, ...extra });

test('se ofrece solo a las que tienen correo y todavía no son ni van camino a ser electrónicas', () => {
  assert.equal(u.seEmiteAlImprimir(fila()), true);
  assert.equal(u.seEmiteAlImprimir(fila({ cliente_email: null })), false, 'sin correo');
  assert.equal(u.seEmiteAlImprimir(fila({ cliente_email: '   ' })), false);
  assert.equal(u.seEmiteAlImprimir(fila({ cliente_email: 'sin arroba' })), false);
  assert.equal(u.seEmiteAlImprimir(fila({ electronica: true })), false, 'ya es electrónica: ni se edita ni se vuelve a emitir');
  assert.equal(u.seEmiteAlImprimir(fila({ con_comprobante: true })), false, 'ya tiene un comprobante en curso');
  assert.equal(u.seEmiteAlImprimir(fila({ historica: true })), false, 'las de Alegra no se emiten');
  assert.equal(u.seEmiteAlImprimir(null), false);
});

test('la pregunta de la lista dice que emite y a qué correo llega', () => {
  const conAjustes = u.preguntaAlProcesar(fila(), { soloImprimir: false, despues: u.DESPUES.EMITIR });
  assert.match(conAjustes, /^¿Marcar la factura 001000015100 como impresa, emitirla electrónicamente e imprimirla\?/);
  assert.match(conAjustes, /Se le rebajan los faltantes y se le ponen los precios del catálogo\.\n\nDespués de eso se emite ante Hacienda; cuando la acepte, le llega a zz@ejemplo\.com y se imprime\./);
  assert.match(u.preguntaAlProcesar(fila(), { soloImprimir: true, despues: u.DESPUES.EMITIR }), /\?\n\nSe emite ante Hacienda/);
  // Las de siempre no cambian.
  assert.equal(u.preguntaAlProcesar(fila(), { soloImprimir: true, despues: u.DESPUES.IMPRIMIR }), '¿Marcar la factura 001000015100 como impresa e imprimir ahora?');
  assert.equal(u.preguntaAlProcesar(fila(), { soloImprimir: true, despues: u.DESPUES.GUARDAR }), '¿Marcar la factura 001000015100 como impresa?');
});

test('la cola le dice a la pantalla si la factura ya es electrónica, tiene comprobante o es de Alegra', () => {
  const { aFilaDeCola } = require('../src/modules/reprinting/colaImpresion');
  const f = aFilaDeCola({ reimpresion_id: 1, factura_id: 7, numero: 'ZZ-7', cliente_correo: 'zz@ejemplo.com', electronica: true, con_comprobante: true, historica: false });
  assert.deepEqual([f.cliente_email, f.electronica, f.con_comprobante, f.historica], ['zz@ejemplo.com', true, true, false]);
  const fuente = fs.readFileSync(path.resolve(__dirname, '../src/modules/reprinting/colaImpresion.js'), 'utf8');
  assert.match(fuente, /f\.electronica,\n\s+\(f\.hacienda_comprobante_id IS NOT NULL\) AS con_comprobante, \(f\.alegra_id IS NOT NULL\) AS historica/);
});

test('el botón sale en la lista, la revisión y la edición, con quien puede emitir', () => {
  const pagina = leer('pages', 'Impresion.jsx');
  assert.match(pagina, /const puedeEmitir = puedeVer\(usuario, '\/facturacion'\)/, 'emitir usa las rutas de Facturación');
  assert.match(pagina, /puedeEmitir && seEmiteAlImprimir\(facturaEditando\)/);
  assert.match(pagina, /<EmitirEImprimir factura=\{porEmitir\} onImprimir=\{handleVerPDF\} onCerrar=\{cerrarEmision\} \/>/);
  assert.match(leer('components', 'impresion', 'ListaFacturasPendientes.jsx'), /onProcesarSinCambios\(factura, DESPUES\.EMITIR\)/);
  for (const archivo of ['CambiosAutomaticos.jsx', 'FormularioEdicionFactura.jsx']) {
    const fuente = leer('components', 'impresion', archivo);
    assert.match(fuente, /\{emitible && \(\s*<Boton[^>]*onClick=\{\(\) => onGuardar\(DESPUES\.EMITIR\)\}[\s\S]*?Imprimir y emitir/, archivo);
    assert.doesNotMatch(fuente, /onGuardar\((true|false)\)/, `${archivo}: el viejo verdadero/falso`);
  }
});

test('emite con lo mismo que Facturación, sola y una sola vez, y no se cierra a medio camino', () => {
  const modal = leer('components', 'impresion', 'EmitirEImprimir.jsx');
  assert.match(modal, /const emision = useEmisionFactura\(factura\.factura_id\)/);
  assert.match(modal, /<PanelEmisionFactura emision=\{emision\} incrustado angosto \/>/);
  assert.match(leer('components', 'facturacion', 'PanelEmisionFactura.jsx'), /angosto \? 'sm:grid-cols-2'/, 'en el modal, dos columnas como mucho');
  assert.match(modal, /<BotonEmitirFactura emision=\{emision\}/);
  assert.doesNotMatch(modal, /integrations\/hacienda|services\//, 'una segunda forma de emitir');
  assert.match(modal, /if \(arranco\.current \|\| !emision\.estado\) return\n\s+arranco\.current = true\n\s+emision\.emitir\(\)/);
  assert.match(modal, /const cerrar = ocupado \? \(\) => \{\} : onCerrar/);
  // Imprime cuando Hacienda aceptó; si no se pudo, igual se puede imprimir.
  assert.match(modal, /aceptada \? \(\s*<Boton tamano="lg" icono=\{Printer\} data-imprimir-emitida onClick=\{imprimir\}>/);
  assert.match(modal, /data-imprimir-sin-emitir onClick=\{imprimir\}/);
});
