const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');
const { REFERENCIAS_DE_NOTA } = require('../src/integrations/hacienda/unClic.service');

/**
 * El seguimiento de la nota de crédito: qué hizo, a qué se aplicó y cómo va
 * ante Hacienda.
 *
 * LO QUE PASÓ (2026-10-11, producción). El usuario hizo una nota de crédito
 * sobre una factura electrónica y contó: «apliqué la nota de crédito y no
 * avisó nada y solo me salió la factura como pagada». La nota bajaba el saldo
 * a cero y la etiqueta decía "Pagada"; la nota era un renglón gris al pie.
 * Pidió: «que se sepa si se aplicó, si anuló el documento o qué pasó» y «que
 * indique si la nota es aplicada a una factura electrónica o una de venta
 * normal».
 *
 * LO QUE SE CUIDA
 *  - saldo en cero no es "Pagada" cuando lo dejó en cero una nota;
 *  - la nota dice si anuló la factura entera o acreditó una parte, y si
 *    quedó plata a favor del cliente;
 *  - dice a qué documento se aplicó: electrónico o de venta común;
 *  - dice si falta emitirla ante Hacienda, o por qué no va;
 *  - emitirla pregunta QUÉ HACE la nota: no se deduce de su motivo.
 * Lo del servidor está en haciendaUnClicPg.test.js.
 */

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const codigo = (...partes) => sinComentarios(fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8'));
const fmt = (n) => `₡${Math.round(Number(n) || 0)}`;

let u, pasos;
before(async () => {
  u = await import('../../frontend/src/utils/notaCreditoTexto.js');
  pasos = await import('../../frontend/src/utils/emisionPasos.js');
});

// La factura del caso real: ₡62,15, electrónica, acreditada entera por una nota.
const FACTURA = {
  id: 5565, numero: '001000015014', estado: 'emitida', total: 62.15, cobrado: 0, acreditado: 62.15, saldo: 0,
  electronica: true, fiscal: { consecutivo: '00100001010000004947', tipo: '01' }
};
const NOTA = { id: 28, numero: '001000030001', estado: 'emitida', motivo: 'devolucion', motivoTexto: 'mal estado', monto: 62.15, unidades: 1 };
const venta = (cambios = {}) => ({ id: 1, numero: '001000015016', estado: 'emitida', total: 1000, cobrado: 0, acreditado: 0, saldo: 1000, electronica: false, ...cambios });

describe('saldo en cero no es "Pagada"', () => {
  test('el caso real: acreditada entera por una nota, decía "Pagada"', () => {
    assert.deepEqual(u.estadoDeFactura(FACTURA, fmt), { tono: 'nota', texto: 'Anulada con nota de crédito' });
  });

  test('pagada es la que se cobró', () => {
    assert.deepEqual(u.estadoDeFactura(venta({ cobrado: 1000, saldo: 0 }), fmt), { tono: 'exito', texto: 'Pagada' });
  });

  test('con saldo dice cuánto debe; anulada y borrador no cambian', () => {
    assert.deepEqual(u.estadoDeFactura(venta(), fmt), { tono: 'alerta', texto: 'Debe ₡1000' });
    assert.equal(u.estadoDeFactura(venta({ estado: 'anulada' }), fmt).texto, 'Anulada');
    assert.equal(u.estadoDeFactura(venta({ estado: 'borrador' }), fmt).texto, 'Borrador');
    // Una anulada con una nota vieja sigue siendo "Anulada", no "con nota".
    assert.equal(u.estadoDeFactura(venta({ estado: 'anulada', acreditado: 1000 }), fmt).texto, 'Anulada');
  });

  test('una nota parcial no la anula: sigue debiendo, o quedó pagada, y se dice que hay nota', () => {
    const debe = venta({ acreditado: 300, saldo: 700 });
    assert.equal(u.estadoDeFactura(debe, fmt).texto, 'Debe ₡700');
    assert.equal(u.notasDeFactura(debe, fmt), 'Nota de crédito por ₡300');
    const pagada = venta({ acreditado: 300, cobrado: 700, saldo: 0 });
    assert.equal(u.estadoDeFactura(pagada, fmt).texto, 'Pagada');
    assert.equal(u.notasDeFactura(pagada, fmt), 'Nota de crédito por ₡300');
    // Sin notas, o acreditada entera (ya lo dice la etiqueta), no se repite.
    assert.equal(u.notasDeFactura(venta(), fmt), '');
    assert.equal(u.notasDeFactura(FACTURA, fmt), '');
  });

  test('medio colón de diferencia por redondeo sigue siendo "entera"', () => {
    assert.equal(u.estadoDeFactura(venta({ total: 62.15, acreditado: 62.14, saldo: 0.01 }), fmt).texto, 'Anulada con nota de crédito');
    assert.equal(u.estadoDeFactura(venta({ total: 1000, acreditado: 999, saldo: 1 }), fmt).texto, 'Debe ₡1');
  });
});

describe('qué hizo la nota', () => {
  test('la que acredita todo: anuló la factura completa', () => {
    const e = u.efectoDeNota(NOTA, FACTURA, fmt);
    assert.equal(e.clave, 'total');
    assert.equal(e.titulo, 'Anuló la factura completa');
    assert.match(e.detalle, /el cliente no debe nada por ella/);
    assert.doesNotMatch(e.detalle, /a favor/);
  });

  test('la que acredita una parte: cuánto de cuánto, y lo que queda debiendo', () => {
    const f = venta({ acreditado: 300, saldo: 700 });
    const e = u.efectoDeNota({ ...NOTA, monto: 300 }, f, fmt);
    assert.equal(e.clave, 'parcial');
    assert.equal(e.titulo, 'Acreditó ₡300 de ₡1000');
    assert.match(e.detalle, /todavía debe ₡700/);
  });

  test('si la factura ya estaba cobrada, dice que queda plata a favor del cliente', () => {
    const cobradaYAcreditada = venta({ cobrado: 1000, acreditado: 1000, saldo: 0 });
    assert.match(u.efectoDeNota({ ...NOTA, monto: 1000 }, cobradaYAcreditada, fmt).detalle, /quedan ₡1000 a favor del cliente/);
    const parcial = venta({ cobrado: 1000, acreditado: 300, saldo: 0 });
    const e = u.efectoDeNota({ ...NOTA, monto: 300 }, parcial, fmt);
    assert.match(e.detalle, /ya está cobrado/);
    assert.match(e.detalle, /quedan ₡300 a favor del cliente/);
  });

  test('dos notas parciales que juntas cubren la factura', () => {
    const f = venta({ acreditado: 1000, saldo: 0 });
    const e = u.efectoDeNota({ ...NOTA, monto: 400 }, f, fmt);
    assert.equal(e.clave, 'parcial');
    assert.match(e.detalle, /Con las otras notas, la factura quedó acreditada por completo/);
  });

  test('una nota anulada ya no descuenta, ni devolvió inventario', () => {
    const anulada = { ...NOTA, estado: 'anulada' };
    assert.equal(u.efectoDeNota(anulada, venta(), fmt).titulo, 'Nota anulada');
    assert.equal(u.inventarioDeNota(anulada), '');
  });

  test('cuenta las unidades que volvieron al inventario', () => {
    assert.equal(u.inventarioDeNota(NOTA), 'Volvió 1 unidad al inventario.');
    assert.equal(u.inventarioDeNota({ ...NOTA, unidades: 12 }), 'Volvieron 12 unidades al inventario.');
    assert.equal(u.inventarioDeNota({ ...NOTA, unidades: 0 }), '');
  });

  test('el motivo se lee en palabras', () => {
    assert.equal(u.motivoDeNota('devolucion'), 'Devolución');
    assert.equal(u.motivoDeNota('error'), 'Error en la factura');
    assert.equal(u.motivoDeNota(null), 'Sin motivo');
  });
});

describe('a qué documento se aplicó', () => {
  test('factura electrónica: con su consecutivo fiscal', () => {
    assert.deepEqual(u.aplicadaA(FACTURA), {
      electronica: true, tipo: 'Factura electrónica', numero: '00100001010000004947', nota: 'Aceptada por Hacienda'
    });
  });

  test('tiquete electrónico', () => {
    assert.equal(u.aplicadaA({ ...FACTURA, fiscal: { consecutivo: '00100001040000001970', tipo: '04' } }).tipo, 'Tiquete electrónico');
    assert.equal(u.aplicadaA({ ...FACTURA, fiscal: null, tipoDocumento: 'tiquete' }).tipo, 'Tiquete electrónico');
  });

  test('factura de venta común: lo dice, con su número', () => {
    assert.deepEqual(u.aplicadaA(venta()), { electronica: false, tipo: 'Factura de venta', numero: '001000015016', nota: 'No es electrónica' });
  });
});

describe('cómo va ante Hacienda', () => {
  test('sobre una factura electrónica y sin emitir: FALTA, y se ofrece emitirla', () => {
    const h = u.haciendaDeNota(NOTA, FACTURA, { comprobante: null, motivoNoEmitible: null });
    assert.equal(h.tono, 'alerta');
    assert.equal(h.titulo, 'Falta emitirla ante Hacienda');
    assert.equal(h.emitible, true);
    assert.match(h.detalle, /para Hacienda la factura sigue entera/);
  });

  test('sobre una factura de venta común: no va a Hacienda, con el porqué del servidor', () => {
    const motivo = 'La factura no es electrónica: esta nota no va a Hacienda.';
    const h = u.haciendaDeNota(NOTA, venta(), { comprobante: null, motivoNoEmitible: motivo });
    assert.deepEqual(h, { tono: 'neutro', titulo: 'No va a Hacienda', detalle: motivo });
    // Antes de que conteste el servidor ya se sabe por la factura.
    assert.equal(u.haciendaDeNota(NOTA, venta(), null).titulo, 'No va a Hacienda');
    assert.equal(u.haciendaDeNota(NOTA, FACTURA, null), null, 'afirmó algo de una electrónica sin saber');
  });

  test('aceptada: con su consecutivo', () => {
    const aceptada = { ...NOTA, electronica: true, fiscal: { consecutivo: '00100001030000000082', estado: 'aceptada' } };
    const h = u.haciendaDeNota(aceptada, FACTURA, { comprobante: { estado: 'aceptada' } });
    assert.equal(h.tono, 'exito');
    assert.equal(h.detalle, 'Consecutivo 00100001030000000082');
  });

  test('en curso o rechazada lo cuenta el panel de pasos, no este recuadro', () => {
    assert.equal(u.haciendaDeNota(NOTA, FACTURA, { comprobante: { estado: 'recibida' } }), null);
    assert.equal(u.haciendaDeNota({ ...NOTA, fiscal: { consecutivo: 'x', estado: 'rechazada' } }, FACTURA, { comprobante: { estado: 'rechazada' } }), null);
  });

  test('una nota de Alegra dice que se hizo allá; una anulada, nada', () => {
    assert.equal(u.haciendaDeNota({ ...NOTA, historica: true, electronica: true }, FACTURA, null).detalle, 'Se emitió desde Alegra.');
    assert.equal(u.haciendaDeNota({ ...NOTA, historica: true, electronica: false }, FACTURA, null).titulo, 'Hecha en Alegra');
    assert.equal(u.haciendaDeNota({ ...NOTA, estado: 'anulada' }, FACTURA, { comprobante: null }), null);
  });
});

describe('el aviso al crearla dice qué pasó', () => {
  test('el caso real: anuló la factura y falta emitirla', () => {
    const aviso = u.avisoNotaCreada({ id: 28, numero: '001000030001', total: 62.15 }, { ...FACTURA, notasCredito: [NOTA] }, fmt);
    assert.equal(aviso, 'Nota de crédito 001000030001 por ₡62 aplicada. Anuló la factura completa. ' +
      'La factura es electrónica: falta emitir la nota ante Hacienda, en la tarjeta de la nota.');
  });

  test('sobre una factura de venta común: parcial, y no va a Hacienda', () => {
    const f = venta({ acreditado: 300, saldo: 700, notasCredito: [{ id: 9, monto: 300, estado: 'emitida' }] });
    const aviso = u.avisoNotaCreada({ id: 9, numero: '001000030002', total: 300 }, f, fmt);
    assert.match(aviso, /por ₡300 aplicada\. Acreditó ₡300 de ₡1000\./);
    assert.match(aviso, /no es electrónica: la nota queda en el sistema y no va a Hacienda/);
  });
});

describe('emitirla pregunta qué hace la nota', () => {
  test('lo que se ofrece existe en el anexo y el servidor lo admite', () => {
    const codigos = pasos.REFERENCIAS_NOTA.map(([c]) => c);
    assert.deepEqual(codigos, ['01', '06', '14', '02', '09', '99']);
    for (const c of codigos) assert.ok(REFERENCIAS_DE_NOTA.includes(c), `el servidor rechaza el ${c} que la pantalla ofrece`);
    // El 02 es "corrige texto", no "corrige monto" (el modal viejo lo decía mal).
    assert.match(pasos.REFERENCIAS_NOTA.find(([c]) => c === '02')[1], /texto/);
    assert.match(pasos.REFERENCIAS_NOTA.find(([c]) => c === '14')[1], /monto/);
  });

  test('sin elegirlo no se emite, y «Otro» pide su descripción', () => {
    const nota = { pendientes: [], faltaMedioPago: false, faltaReferencia: true };
    assert.equal(pasos.pideDatos(nota), true);
    assert.match(pasos.faltaContestar([], {}, nota), /qué hace la nota/);
    assert.match(pasos.faltaContestar([], { codigoReferencia: '99' }, nota), /Describí qué hace la nota/);
    assert.equal(pasos.faltaContestar([], { codigoReferencia: '99', referenciaOtro: 'Ajuste' }, nota), '');
    assert.equal(pasos.faltaContestar([], { codigoReferencia: '06' }, nota), '');
  });

  test('al servidor viaja el código, y la descripción solo con «Otro»', () => {
    const nota = { pendientes: [], faltaMedioPago: false, faltaReferencia: true };
    assert.deepEqual(pasos.respuestaDe(nota, { codigoReferencia: '06', referenciaOtro: 'sobra' }), { codigoReferencia: '06' });
    assert.deepEqual(pasos.respuestaDe(nota, { codigoReferencia: '99', referenciaOtro: ' Ajuste ' }), { codigoReferencia: '99', referenciaOtro: 'Ajuste' });
    // Una factura no manda nada de esto.
    assert.deepEqual(pasos.respuestaDe({ pendientes: [], faltaMedioPago: false }, { codigoReferencia: '06' }), {});
  });

  // 2026-10-11: «en nota de crédito está faltando enviar la nota de crédito
  // por correo al cliente, el pdf con sus xml». Antes la nota tenía tres
  // pasos y ningún correo.
  test('la nota tiene los mismos cuatro pasos que la factura: también se le entrega al cliente', () => {
    const aceptada = { consecutivo: 'x', estado: 'aceptada', ambiente: 'produccion' };
    const de = (correo) => pasos.pasosDe({ comprobante: aceptada, correo, origen: 'nota_credito' });
    assert.deepEqual(de({ estado: 'enviado', para: 'c@x.cr' }).map(p => `${p.clave}=${p.estado}`),
      ['firma=hecho', 'envio=hecho', 'respuesta=hecho', 'correo=hecho']);
    assert.match(de({ estado: 'enviado', para: 'c@x.cr' })[3].titulo, /c@x\.cr/);
    assert.equal(de(null)[3].estado, 'aviso', 'aceptada y sin correo anotado tiene que avisar, no callar');
    assert.equal(de({ estado: 'error', motivo: 'x' })[3].estado, 'fallo');
    assert.equal(pasos.nombreDeTipo('03'), 'Nota de crédito electrónica');
  });

  test('sin correo en la ficha, la nota no manda a un botón que solo tiene la factura', () => {
    const aceptada = { consecutivo: 'x', estado: 'aceptada', ambiente: 'produccion' };
    const sinCorreo = (origen) => pasos.pasosDe({ comprobante: aceptada, correo: { estado: 'sin_correo' }, origen })[3];
    assert.equal(sinCorreo('nota_credito').estado, 'aviso');
    assert.doesNotMatch(sinCorreo('nota_credito').detalle, /botón Correo/);
    assert.match(sinCorreo('nota_credito').detalle, /Enviar al cliente/);
    assert.match(sinCorreo('factura').detalle, /botón Correo/);
  });

  test('una nota de pruebas no se le manda a nadie', () => {
    const p = pasos.pasosDe({ comprobante: { consecutivo: 'x', estado: 'aceptada', ambiente: 'pruebas' }, origen: 'nota_credito' });
    assert.equal(p[3].estado, 'omitido');
  });
});

describe('cómo quedó conectada la pantalla', () => {
  const vista = codigo('components', 'facturacion', 'VistaFactura.jsx');
  const tarjetas = codigo('components', 'facturacion', 'NotasCreditoFactura.jsx');

  test('las notas van ARRIBA del documento, no en un renglón al pie', () => {
    assert.match(vista, /\{!editando && \(\s*<NotasCreditoFactura factura=\{f\} onCambio=\{onFiscalCambio\}/);
    assert.ok(vista.indexOf('<NotasCreditoFactura') < vista.indexOf('rounded-2xl ${editando'), 'las notas quedaron debajo del documento');
    assert.doesNotMatch(vista, /f\.notasCredito\.map/, 'volvió la lista vieja al pie de la factura');
  });

  test('cada tarjeta contesta las tres preguntas', () => {
    assert.match(tarjetas, /etiqueta="Qué hizo"/);
    assert.match(tarjetas, /etiqueta="Se aplicó a"/);
    assert.match(tarjetas, /etiqueta="Ante Hacienda"/);
  });

  test('la nota se emite con el mismo botón y los mismos pasos que la factura, sin modal', () => {
    assert.match(tarjetas, /origen: 'nota_credito'/);
    assert.match(tarjetas, /<BotonEmitirFactura emision=\{emision\} \/>/);
    assert.match(tarjetas, /<PanelEmisionFactura emision=\{emision\} incrustado \/>/);
    assert.doesNotMatch(tarjetas, /DocumentoFiscal|Modal/);
    const gancho = codigo('hooks', 'useEmisionFactura.js');
    assert.match(gancho, /nota_credito: \{ estado: estadoNota, emitir: emitirNota, correo: reenviarCorreoNota \}/);
  });

  test('la nota aceptada se le puede mandar al cliente y se le puede ver el PDF', () => {
    const panel = codigo('components', 'facturacion', 'PanelEmisionFactura.jsx');
    // El botón y el cuarto paso ya no excluyen a la nota.
    assert.doesNotMatch(panel, /esNota|conCorreo/);
    assert.match(panel, /origen: emision\.origen/);
    assert.match(codigo('hooks', 'useEmisionFactura.js'), /await servidor\.correo\(id\)/);
    assert.match(tarjetas, /data-pdf-nota=\{n\.id\}/);
    assert.match(codigo('hooks', 'useFacturasEmitidas.js'), /\/facturacion\/notas-credito\/\$\{id\}\/pdf/);
  });

  test('la etiqueta de estado es la misma regla en la factura y en la lista', () => {
    assert.match(vista, /const e = estadoDeFactura\(f, colones\)/);
    const lista = codigo('components', 'facturacion', 'PanelFacturasEmitidas.jsx');
    assert.match(lista, /const e = estadoDeFactura\(f, colones\)/);
    for (const pantalla of [vista, lista]) assert.doesNotMatch(pantalla, /tono="exito">Pagada/, 'quedó una "Pagada" escrita a mano');
  });

  test('al crear la nota el aviso se arma con la factura ya releída', () => {
    const hook = codigo('hooks', 'useFacturasEmitidas.js');
    assert.match(hook, /aviso = avisoNotaCreada\(nota, fresca, colones\)/);
  });

  test('el servidor tiene las rutas de la nota y devuelve lo que la tarjeta muestra', () => {
    const rutas = fs.readFileSync(path.join(__dirname, '..', 'src', 'integrations', 'hacienda', 'rutas.js'), 'utf8');
    assert.match(rutas, /"\/notas-credito\/:id\/estado"/);
    assert.match(rutas, /"\/notas-credito\/:id\/emitir"/);
    assert.match(rutas, /"\/notas-credito\/:id\/correo"/);
    // El correo se enchufa en las rutas: el módulo fiscal no importa correo.
    assert.match(rutas, /alAceptarNota: \(notaId\) =>/);
    assert.match(rutas, /entregarNotaElectronica\(notaId\)/);
    const consulta = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaConsulta.service.js'), 'utf8');
    for (const campo of ['unidades:', 'electronica:', 'haciendaEstado:', 'fiscal:']) {
      assert.ok(consulta.slice(consulta.indexOf('notasCredito:')).includes(campo), `la factura no devuelve ${campo} de sus notas`);
    }
  });
});
