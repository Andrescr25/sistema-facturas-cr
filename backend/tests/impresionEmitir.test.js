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

// 2026-10-24: «los clientes que no tienen correo, salga la opción emitir como
// tiquete e imprimir». Es la otra mitad del mismo filtro.
test('«como tiquete» se ofrece solo a las SIN correo, y nunca junto con «Imprimir y emitir»', () => {
  assert.equal(u.seEmiteComoTiquete(fila({ cliente_email: null })), true);
  assert.equal(u.seEmiteComoTiquete(fila({ cliente_email: '' })), true);
  assert.equal(u.seEmiteComoTiquete(fila({ cliente_email: '   ' })), true);
  assert.equal(u.seEmiteComoTiquete(fila({ cliente_email: 'sin arroba' })), true, 'un correo mal escrito no es un correo');
  assert.equal(u.seEmiteComoTiquete(fila()), false, 'con correo se emite como factura');
  assert.equal(u.seEmiteComoTiquete(fila({ cliente_email: null, electronica: true })), false, 'ya es electrónica');
  assert.equal(u.seEmiteComoTiquete(fila({ cliente_email: null, con_comprobante: true })), false, 'ya tiene un comprobante en curso');
  assert.equal(u.seEmiteComoTiquete(fila({ cliente_email: null, historica: true })), false, 'las de Alegra no se emiten');
  for (const cliente_email of [null, '', 'zz@ejemplo.com', 'mal']) {
    for (const extra of [{}, { electronica: true }, { con_comprobante: true }, { historica: true }]) {
      const f = fila({ cliente_email, ...extra });
      assert.equal(u.seEmiteAlImprimir(f) && u.seEmiteComoTiquete(f), false, 'una factura no recibe las dos opciones');
    }
  }
});

test('la pregunta del tiquete avisa que no sirve para gastos ni créditos de IVA, y que no hay correo', () => {
  const sinCorreo = fila({ cliente_email: null });
  const q = u.preguntaAlProcesar(sinCorreo, { soloImprimir: false, despues: u.DESPUES.EMITIR_TIQUETE });
  assert.match(q, /^¿Marcar la factura 001000015100 como impresa, emitirla como tiquete electrónico e imprimirla\?/);
  assert.match(q, /Se le rebajan los faltantes y se le ponen los precios del catálogo\.\n\nDespués de eso se emite ante Hacienda como TIQUETE ELECTRÓNICO y se imprime/);
  assert.match(q, /no tiene correo, se le entrega en papel/);
  assert.match(q, /no le sirve al cliente para respaldar gastos ni créditos de IVA/);
  assert.doesNotMatch(q, /le llega a/, 'no promete un correo que no existe');
  assert.match(u.preguntaAlProcesar(sinCorreo, { soloImprimir: true, despues: u.DESPUES.EMITIR_TIQUETE }), /\?\n\nSe emite ante Hacienda como TIQUETE/);
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
  assert.match(modal, /const emision = useEmisionFactura\(factura\.factura_id, \{ tipo: comoTiquete \? '04' : null \}\)/);
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

test('el botón del tiquete sale en la lista, la revisión y la edición, y pide el tipo 04 al servidor', () => {
  const pagina = leer('pages', 'Impresion.jsx');
  assert.match(pagina, /puedeEmitir && seEmiteComoTiquete\(facturaEditando\)/);
  assert.equal((pagina.match(/emitibleTiquete=\{emitibleTiquete\}/g) || []).length, 2, 'la revisión y la edición');
  assert.match(leer('components', 'impresion', 'ListaFacturasPendientes.jsx'), /emitibleTiquete && \(\s*<Boton[^>]*onClick=\{\(\) => onProcesarSinCambios\(factura, DESPUES\.EMITIR_TIQUETE\)\}[\s\S]*?Imprimir y emitir como tiquete/);
  for (const archivo of ['CambiosAutomaticos.jsx', 'FormularioEdicionFactura.jsx']) {
    assert.match(leer('components', 'impresion', archivo),
      /\{emitibleTiquete && \(\s*<Boton[^>]*onClick=\{\(\) => onGuardar\(DESPUES\.EMITIR_TIQUETE\)\}[\s\S]*?Imprimir y emitir como tiquete/, archivo);
  }
  // Guarda primero y emite después, igual que con correo; el modal recibe la marca.
  assert.match(leer('hooks', 'useImpresion.js'), /if \(despues === DESPUES\.EMITIR_TIQUETE\) setPorEmitir\(\{ \.\.\.factura, comoTiquete: true \}\)/);
  const hook = leer('hooks', 'useEmisionFactura.js');
  assert.match(hook, /base\.estado\(id, \{ tipo \}\)/);
  assert.match(hook, /base\.emitir\(id, \{ \.\.\.datos, tipo \}\)/);
  assert.match(hook, /useMemo\(/, 'el objeto del servidor no cambia en cada render: si no, la consulta se repite sin parar');
});

test('un tiquete sin correo no se muestra como aviso: se entrega impreso', async () => {
  const pasos = (await import(pathToFileURL(path.join(FRONT, 'utils', 'emisionPasos.js')))).pasosDe;
  const entrega = (tipo) => pasos({ comprobante: { estado: 'aceptada', ambiente: 'produccion', tipo, consecutivo: '1' }, correo: { estado: 'sin_correo' }, ambiente: 'produccion' })
    .find((p) => p.clave === 'correo');
  assert.equal(entrega('04').estado, 'omitido');
  assert.match(entrega('04').titulo, /Tiquete: se entrega impreso/);
  assert.equal(entrega('01').estado, 'aviso', 'una factura sin correo sí es algo por arreglar');
  assert.match(entrega('01').titulo, /El cliente no tiene correo/);
});
