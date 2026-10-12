const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');
const {
  ambienteDeEmision, tipoDeFactura, datosPendientes, lineasDadas
} = require('../src/integrations/hacienda/unClic.service');

/**
 * Emitir una factura electrónica de UN clic.
 *
 * QUÉ SE PIDIÓ (2026-10-11): «ocupo que con solo darle a este botón ya se
 * emita electrónicamente y no me abra el modal de antes», «que en la misma
 * factura me indique qué va pasando, si se envió, o si la aceptó Hacienda»,
 * y que al cliente le llegue «el pdf con los 2 XML».
 *
 * Antes eran un modal, dos listas (ambiente y tipo) y tres botones que había
 * que tocar en orden. Acá se cuida lo que ahora decide el sistema solo:
 *  - a qué ambiente y con qué tipo de comprobante sale;
 *  - cuándo NO puede salir sin preguntar (descuentos, medicamentos);
 *  - el orden de los pasos, y que nunca se firme dos veces la misma factura;
 *  - qué dice cada renglón del avance, sin prometer lo que no pasó.
 *
 * Lo que toca la base (aceptación → correo, una sola vez) está en
 * haciendaUnClicPg.test.js; el correo mismo, en facturaCorreo.test.js.
 */

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const codigo = (...partes) => sinComentarios(fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8'));

let u;
before(async () => { u = await import('../../frontend/src/utils/emisionPasos.js'); });

describe('lo que antes se elegía en el modal', () => {
  test('va a producción si está habilitada; si no, a pruebas; si no, a ninguna', () => {
    const fila = (ambiente, habilitada) => ({ ambiente, habilitada });
    assert.equal(ambienteDeEmision([fila('pruebas', true), fila('produccion', true)]), 'produccion');
    assert.equal(ambienteDeEmision([fila('pruebas', true), fila('produccion', false)]), 'pruebas');
    assert.equal(ambienteDeEmision([fila('pruebas', false), fila('produccion', false)]), null);
    assert.equal(ambienteDeEmision([]), null);
    assert.equal(ambienteDeEmision(undefined), null);
    // "habilitada" tiene que ser un sí de verdad, no un texto o un 1.
    assert.equal(ambienteDeEmision([fila('produccion', 'true')]), null);
  });

  test('factura si el cliente tiene identificación, tiquete si no', () => {
    assert.equal(tipoDeFactura({ cliente_identificacion: '3101123456' }), '01');
    assert.equal(tipoDeFactura({ cliente_identificacion: '' }), '04');
    assert.equal(tipoDeFactura({ cliente_identificacion: '   ' }), '04');
    assert.equal(tipoDeFactura({ cliente_identificacion: null }), '04');
    assert.equal(tipoDeFactura({}), '04');
  });
});

describe('cuándo el clic no puede emitir sin preguntar', () => {
  const comun = { numero_linea: 1, nombre: 'ARROZ', descuento_monto: '0.00', es_medicamento: false };
  const rebajada = { numero_linea: 2, nombre: 'FRIJOLES', descuento_monto: '150.00', es_medicamento: false };
  const pastilla = { numero_linea: 3, nombre: 'ACETAMINOFÉN', descuento_monto: 0, es_medicamento: true, registro_sanitario: 'M-CR-1' };

  test('una factura común no pide nada', () => {
    assert.deepEqual(datosPendientes([comun]), []);
    assert.deepEqual(datosPendientes([]), []);
    assert.deepEqual(datosPendientes(undefined), []);
  });

  test('un descuento pide su motivo: Hacienda lo exige y no se adivina', () => {
    const [p] = datosPendientes([comun, rebajada]);
    assert.equal(p.numeroLinea, 2);
    assert.equal(p.nombre, 'FRIJOLES');
    assert.deepEqual(p.falta, ['el motivo del descuento']);
    assert.equal(p.descuento, true);
    assert.equal(p.medicamento, false);
  });

  test('un medicamento pide lo que su ficha no trae, y muestra lo que sí', () => {
    const [p] = datosPendientes([pastilla]);
    assert.deepEqual(p.falta, ['los datos del medicamento']);
    assert.equal(p.registroSanitario, 'M-CR-1');
    assert.equal(p.formaFarmaceutica, '');
    // Con la ficha completa ya no pide nada.
    assert.deepEqual(datosPendientes([{ ...pastilla, forma_farmaceutica: '012' }]), []);
    // Un código que no son tres dígitos no es una forma farmacéutica.
    assert.equal(datosPendientes([{ ...pastilla, forma_farmaceutica: '12' }]).length, 1);
  });

  test('con lo que la persona contestó, la línea deja de estar pendiente', () => {
    const dadas = [{ numeroLinea: 2, codigoDescuento: '07' }, { numeroLinea: '3', formaFarmaceutica: '012' }];
    assert.deepEqual(datosPendientes([comun, rebajada, pastilla], dadas), []);
  });

  test('un motivo que no existe, o "Otro" sin describir, sigue pendiente', () => {
    assert.deepEqual(datosPendientes([rebajada], [{ numeroLinea: 2, codigoDescuento: '10' }])[0].falta, ['el motivo del descuento']);
    assert.deepEqual(datosPendientes([rebajada], [{ numeroLinea: 2, codigoDescuento: '99' }])[0].falta, ['la descripción del descuento']);
    assert.deepEqual(datosPendientes([rebajada], [{ numeroLinea: 2, codigoDescuento: '99', naturalezaDescuento: 'Producto golpeado' }]), []);
    // Contestar OTRA línea no resuelve esta.
    assert.equal(datosPendientes([rebajada], [{ numeroLinea: 9, codigoDescuento: '07' }]).length, 1);
    assert.equal(datosPendientes([rebajada], 'no es una lista').length, 1);
  });

  test('de lo que llega del navegador solo pasan los cinco campos conocidos, con tope', () => {
    const [l] = lineasDadas([{
      numeroLinea: '2', codigoDescuento: ' 07 ', naturalezaDescuento: 'x'.repeat(200),
      registroMedicamento: null, formaFarmaceutica: 12345, ambiente: 'produccion', tipo: '03'
    }]);
    assert.deepEqual(Object.keys(l).sort(), ['codigoDescuento', 'formaFarmaceutica', 'naturalezaDescuento', 'numeroLinea', 'registroMedicamento']);
    assert.equal(l.numeroLinea, 2);
    assert.equal(l.codigoDescuento, '07');
    assert.equal(l.naturalezaDescuento.length, 80);
    assert.equal(l.registroMedicamento, '');
    assert.equal(l.formaFarmaceutica, '123');
    assert.deepEqual(lineasDadas(undefined), []);
    assert.deepEqual(lineasDadas({ numeroLinea: 1 }), []);
  });
});

/** Un servidor de mentira: cada llamada contesta lo siguiente de su guion. */
function servidor({ firmar = [], enviar = [], consultar = [] } = {}) {
  const llamadas = [];
  const fases = [];
  const siguiente = (nombre, cola) => async (c) => {
    llamadas.push(nombre);
    const r = cola.shift();
    if (r instanceof Error) throw r;
    if (!r) throw new Error(`el guion no esperaba otro "${nombre}"`);
    return { id: 9, clave: 'C'.repeat(50), consecutivo: '00100001010000004947', ...(c || {}), noEncontrada: undefined, ...r };
  };
  return {
    llamadas, fases,
    firmar: siguiente('firmar', firmar),
    enviar: siguiente('enviar', enviar),
    consultar: siguiente('consultar', consultar),
    esperar: async () => { llamadas.push('esperar'); },
    alAvanzar: ({ fase }) => fases.push(fase)
  };
}

describe('un clic encadena los tres pasos', () => {
  test('firma, envía y consulta hasta que Hacienda acepta', async () => {
    const s = servidor({
      firmar: [{ estado: 'preparada' }], enviar: [{ estado: 'recibida' }],
      consultar: [{ estado: 'procesando' }, { estado: 'aceptada', correo: { estado: 'enviado', para: 'a@b.cr' } }]
    });
    const c = await u.emitirPasoAPaso(s);
    assert.deepEqual(s.llamadas, ['firmar', 'enviar', 'esperar', 'consultar', 'esperar', 'consultar']);
    assert.deepEqual(s.fases, ['firmando', 'enviando', 'esperando', 'esperando', null]);
    assert.equal(c.estado, 'aceptada');
    assert.deepEqual(c.correo, { estado: 'enviado', para: 'a@b.cr' });
  });

  test('un rechazo también es una respuesta: deja de consultar', async () => {
    const s = servidor({ firmar: [{ estado: 'preparada' }], enviar: [{ estado: 'recibida' }], consultar: [{ estado: 'rechazada', mensaje: 'ZZ motivo' }] });
    const c = await u.emitirPasoAPaso(s);
    assert.equal(c.estado, 'rechazada');
    assert.equal(s.llamadas.filter(l => l === 'consultar').length, 1);
  });

  test('si Hacienda no contesta a tiempo, se deja de insistir y queda como está', async () => {
    const s = servidor({
      firmar: [{ estado: 'preparada' }], enviar: [{ estado: 'recibida' }],
      consultar: [{ estado: 'recibida' }, { estado: 'procesando' }, { estado: 'procesando' }]
    });
    const c = await u.emitirPasoAPaso({ ...s, intentos: 3 });
    assert.equal(c.estado, 'procesando');
    assert.equal(s.llamadas.filter(l => l === 'consultar').length, 3);
    assert.equal(s.fases.at(-1), null, 'la pantalla quedó girando');
  });

  test('si Hacienda no la recibió, esperar no lo arregla: no consulta', async () => {
    const s = servidor({ firmar: [{ estado: 'preparada' }], enviar: [{ estado: 'error', mensaje: 'Hacienda respondió: ZZ' }] });
    const c = await u.emitirPasoAPaso(s);
    assert.equal(c.estado, 'error');
    assert.deepEqual(s.llamadas, ['firmar', 'enviar']);
  });

  test('si falla un paso, el error llega a la pantalla y no se sigue', async () => {
    const s = servidor({ firmar: [new Error('ZZ sin certificado')] });
    await assert.rejects(u.emitirPasoAPaso(s), /ZZ sin certificado/);
    assert.deepEqual(s.llamadas, ['firmar']);
    const t = servidor({ firmar: [{ estado: 'preparada' }], enviar: [new Error('ZZ sin red')] });
    await assert.rejects(u.emitirPasoAPaso(t), /ZZ sin red/);
    assert.deepEqual(t.llamadas, ['firmar', 'enviar']);
  });

  test('si la persona se fue de la factura, no se sigue llamando', async () => {
    const s = servidor({ firmar: [{ estado: 'preparada' }] });
    let llamado = 0;
    await u.emitirPasoAPaso({ ...s, sigue: () => ++llamado < 1 });
    assert.deepEqual(s.llamadas, ['firmar']);
  });
});

describe('continuar un comprobante a medias nunca firma otro', () => {
  const previo = (estado) => ({ id: 9, clave: 'C'.repeat(50), consecutivo: '00100001010000004947', estado });

  test('preparado y sin enviar: lo envía', async () => {
    const s = servidor({ enviar: [{ estado: 'recibida' }], consultar: [{ estado: 'aceptada' }] });
    await u.emitirPasoAPaso({ ...s, comprobante: previo('preparada') });
    assert.deepEqual(s.llamadas, ['enviar', 'esperar', 'consultar']);
  });

  test('ya recibido por Hacienda: solo consulta', async () => {
    for (const estado of ['recibida', 'procesando']) {
      const s = servidor({ consultar: [{ estado: 'aceptada' }] });
      await u.emitirPasoAPaso({ ...s, comprobante: previo(estado) });
      assert.deepEqual(s.llamadas, ['esperar', 'consultar'], estado);
    }
  });

  test('envío sin confirmar: el servidor decide si reenvía la MISMA clave', async () => {
    for (const estado of ['incierta', 'enviando', 'error']) {
      const s = servidor({ enviar: [{ estado: 'recibida' }], consultar: [{ estado: 'aceptada' }] });
      await u.emitirPasoAPaso({ ...s, comprobante: previo(estado) });
      assert.equal(s.llamadas[0], 'enviar', estado);
      assert.ok(!s.llamadas.includes('firmar'), `${estado}: se firmó otra vez`);
    }
  });

  test('ya aceptado: no hace nada', async () => {
    const s = servidor();
    const c = await u.emitirPasoAPaso({ ...s, comprobante: previo('aceptada') });
    assert.deepEqual(s.llamadas, []);
    assert.equal(c.estado, 'aceptada');
  });

  test('Hacienda no conoce la clave: se mandan otra vez los mismos bytes', async () => {
    const s = servidor({
      consultar: [{ estado: 'recibida', noEncontrada: true }, { estado: 'aceptada' }],
      enviar: [{ estado: 'recibida' }]
    });
    await u.emitirPasoAPaso({ ...s, comprobante: previo('recibida') });
    assert.deepEqual(s.llamadas, ['esperar', 'consultar', 'enviar', 'esperar', 'consultar']);
  });
});

describe('lo que dice cada renglón del avance', () => {
  const C = { consecutivo: '00100001010000004947', clave: 'C'.repeat(50), ambiente: 'produccion' };
  const estados = (datos) => u.pasosDe(datos).map(p => p.estado);
  const paso = (datos, clave) => u.pasosDe(datos).find(p => p.clave === clave);

  test('son cuatro, siempre en el mismo orden', () => {
    assert.deepEqual(u.pasosDe({}).map(p => p.clave), ['firma', 'envio', 'respuesta', 'correo']);
  });

  test('se van llenando de izquierda a derecha', () => {
    assert.deepEqual(estados({ fase: 'firmando' }), ['activo', 'pendiente', 'pendiente', 'pendiente']);
    assert.deepEqual(estados({ comprobante: { ...C, estado: 'preparada' }, fase: 'enviando' }), ['hecho', 'activo', 'pendiente', 'pendiente']);
    assert.deepEqual(estados({ comprobante: { ...C, estado: 'recibida' }, fase: 'esperando' }), ['hecho', 'hecho', 'activo', 'pendiente']);
    assert.deepEqual(
      estados({ comprobante: { ...C, estado: 'aceptada' }, correo: { estado: 'enviado', para: 'cliente@example.test' } }),
      ['hecho', 'hecho', 'hecho', 'hecho']
    );
  });

  test('el consecutivo se muestra apenas se firma', () => {
    assert.match(paso({ comprobante: { ...C, estado: 'preparada' } }, 'firma').detalle, /00100001010000004947/);
  });

  test('si Hacienda tarda, solo promete que se consulta sola cuando el servidor lo hace', () => {
    const tarda = { comprobante: { ...C, estado: 'procesando' } };
    const con = paso({ ...tarda, seguimiento: true }, 'respuesta');
    assert.equal(con.estado, 'aviso');
    assert.match(con.detalle, /sigue consultando solo cada minuto/);
    // Sin el seguimiento encendido (o sin saberlo) no se promete: se pide el toque.
    for (const seguimiento of [false, undefined]) {
      const sin = paso({ ...tarda, seguimiento }, 'respuesta');
      assert.equal(sin.estado, 'aviso');
      assert.doesNotMatch(sin.detalle, /sola|solo/);
      assert.match(sin.detalle, /Consultar a Hacienda/);
    }
  });

  test('un rechazo no se pinta como hecho, y no se le manda nada al cliente', () => {
    const datos = { comprobante: { ...C, estado: 'rechazada', mensaje: 'ZZ motivo' } };
    assert.deepEqual(estados(datos), ['hecho', 'hecho', 'fallo', 'pendiente']);
    assert.match(paso(datos, 'respuesta').titulo, /Rechazada/);
  });

  test('si Hacienda no la recibió, falla el envío y muestra lo que respondió', () => {
    const e = paso({ comprobante: { ...C, estado: 'error', mensaje: 'Hacienda respondió: ZZ' } }, 'envio');
    assert.equal(e.estado, 'fallo');
    assert.equal(e.detalle, 'Hacienda respondió: ZZ');
  });

  test('un envío sin confirmar avisa que no se gasta otro número', () => {
    const e = paso({ comprobante: { ...C, estado: 'incierta' } }, 'envio');
    assert.equal(e.estado, 'aviso');
    assert.match(e.detalle, /no se gasta otro número/);
  });

  test('el correo dice a quién se le mandó, o por qué no', () => {
    const aceptada = { ...C, estado: 'aceptada' };
    assert.match(paso({ comprobante: aceptada, correo: { estado: 'enviado', para: 'cliente@example.test' } }, 'correo').titulo, /cliente@example\.test/);
    const sin = paso({ comprobante: aceptada, correo: { estado: 'sin_correo' } }, 'correo');
    assert.equal(sin.estado, 'aviso');
    assert.match(sin.titulo, /no tiene correo/);
    const mal = paso({ comprobante: aceptada, correo: { estado: 'error', motivo: 'ZZ no aceptó al destinatario' } }, 'correo');
    assert.equal(mal.estado, 'fallo');
    assert.equal(mal.detalle, 'ZZ no aceptó al destinatario');
    // Sin registro del envío no se afirma que se envió.
    assert.equal(paso({ comprobante: aceptada, correo: null }, 'correo').estado, 'aviso');
  });

  test('en pruebas no se le manda al cliente, y se dice por qué', () => {
    const p = paso({ comprobante: { ...C, ambiente: 'pruebas', estado: 'aceptada' } }, 'correo');
    assert.equal(p.estado, 'omitido');
    assert.match(p.detalle, /no tiene validez fiscal/);
  });

  test('la etiqueta de arriba resume en una palabra', () => {
    assert.deepEqual(u.resumenDe({ comprobante: { estado: 'aceptada' } }), { tono: 'exito', texto: 'Aceptada' });
    assert.deepEqual(u.resumenDe({ comprobante: { estado: 'rechazada' } }), { tono: 'peligro', texto: 'Rechazada' });
    assert.equal(u.resumenDe({ fase: 'firmando' }).texto, 'Emitiendo');
    assert.equal(u.resumenDe({ comprobante: { estado: 'recibida' } }).texto, 'Esperando a Hacienda');
    assert.equal(u.resumenDe({}), null);
  });

  test('cada tipo de comprobante con su nombre', () => {
    assert.equal(u.nombreDeTipo('01'), 'Factura electrónica');
    assert.equal(u.nombreDeTipo('04'), 'Tiquete electrónico');
    assert.equal(u.nombreDeTipo(undefined), 'Comprobante electrónico');
  });
});

describe('qué hace el botón según cómo va', () => {
  const con = (estado) => u.botonDe({ estado: { comprobante: estado ? { estado } : null } });

  test('sin comprobante emite; mientras carga o emite no se puede tocar', () => {
    assert.deepEqual(con(null), { texto: 'Emitir electrónicamente' });
    assert.equal(u.botonDe({ estado: null }).ocupado, true);
    assert.deepEqual(u.botonDe({ estado: { comprobante: null }, fase: 'enviando' }), { texto: 'Emitiendo…', ocupado: true });
  });

  test('una aceptada no se vuelve a emitir: el botón desaparece', () => {
    assert.equal(con('aceptada'), null);
  });

  test('solo un rechazo prepara un comprobante nuevo', () => {
    assert.deepEqual(con('rechazada'), { texto: 'Volver a emitir', sustituir: true });
    for (const estado of ['preparada', 'enviando', 'incierta', 'error', 'recibida', 'procesando']) {
      const b = con(estado);
      assert.equal(b.continuar, true, estado);
      assert.equal(b.sustituir, undefined, `${estado}: gastaría otro número`);
    }
    assert.equal(con('preparada').texto, 'Enviar a Hacienda');
    assert.equal(con('recibida').texto, 'Consultar a Hacienda');
  });
});

describe('el dato que a veces falta se contesta en la misma factura', () => {
  const pendientes = [
    { numeroLinea: 2, nombre: 'FRIJOLES', descuento: true, medicamento: false },
    { numeroLinea: 4, nombre: 'ATÚN', descuento: true, medicamento: false },
    { numeroLinea: 5, nombre: 'ACETAMINOFÉN', descuento: false, medicamento: true, registroSanitario: 'M-CR-1', formaFarmaceutica: '' }
  ];

  test('el motivo se elige una vez y vale para todas las líneas con descuento', () => {
    const lineas = u.lineasDe(pendientes, { codigoDescuento: '07', medicamentos: { 5: { forma: '012' } } });
    assert.deepEqual(lineas, [
      { numeroLinea: 2, codigoDescuento: '07', naturalezaDescuento: '' },
      { numeroLinea: 4, codigoDescuento: '07', naturalezaDescuento: '' },
      { numeroLinea: 5, registroMedicamento: 'M-CR-1', formaFarmaceutica: '012' }
    ]);
  });

  test('lo que arma la pantalla es justo lo que el servidor da por contestado', () => {
    const delServidor = [
      { numero_linea: 2, nombre: 'FRIJOLES', descuento_monto: '10' },
      { numero_linea: 4, nombre: 'ATÚN', descuento_monto: '5' },
      { numero_linea: 5, nombre: 'ACETAMINOFÉN', descuento_monto: 0, es_medicamento: true, registro_sanitario: 'M-CR-1' }
    ];
    const lineas = u.lineasDe(datosPendientes(delServidor), { codigoDescuento: '07', medicamentos: { 5: { forma: '012' } } });
    assert.deepEqual(datosPendientes(delServidor, lineasDadas(lineas)), []);
  });

  test('no deja emitir hasta que esté contestado, y dice qué falta', () => {
    assert.match(u.faltaContestar(pendientes, {}), /motivo del descuento/);
    assert.match(u.faltaContestar(pendientes, { codigoDescuento: '99' }), /de qué es el descuento/);
    assert.match(u.faltaContestar(pendientes, { codigoDescuento: '07' }), /3 dígitos/);
    assert.match(u.faltaContestar(pendientes, { codigoDescuento: '07', medicamentos: { 5: { registro: ' ', forma: '012' } } }), /registro sanitario/);
    assert.equal(u.faltaContestar(pendientes, { codigoDescuento: '07', medicamentos: { 5: { forma: '012' } } }), '');
    assert.equal(u.faltaContestar([], {}), '');
  });

  test('los motivos son los del anexo de Hacienda', () => {
    assert.deepEqual(u.MOTIVOS_DESCUENTO.map(m => m[0]), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '99']);
  });
});

describe('con qué paga el cliente, cuando la factura no lo dice', () => {
  // EL ERROR (2026-10-11): «Medio de pago: falta un dato fiscal válido»,
  // con la factura de contado a la vista. Desde que la factura nace sin
  // cobrar ya no trae medio de pago, y Hacienda lo pide en contado.
  const contado = { pendientes: [], faltaMedioPago: true, mediosPago: [{ id: 1, nombre: 'Efectivo' }, { id: 2, nombre: 'SINPE Móvil' }] };

  test('una venta de contado sin medio de pago pide el dato antes de emitir', () => {
    assert.equal(u.pideDatos(contado), true);
    assert.equal(u.pideDatos({ pendientes: [], faltaMedioPago: false }), false);
    assert.equal(u.pideDatos({ pendientes: [{ numeroLinea: 1 }], faltaMedioPago: false }), true);
    assert.equal(u.pideDatos(null), false);
  });

  test('no deja emitir sin elegirlo, y lo que viaja es solo eso', () => {
    assert.match(u.faltaContestar([], {}, contado), /con qué paga el cliente/);
    assert.equal(u.faltaContestar([], { metodoPagoId: 2 }, contado), '');
    assert.deepEqual(u.respuestaDe(contado, { metodoPagoId: 2, codigoDescuento: '07' }), { metodoPagoId: 2 });
  });

  test('si la factura ya dice el medio, no se manda ninguno: no se pisa el suyo', () => {
    const conDescuento = { pendientes: [{ numeroLinea: 2, nombre: 'FRIJOLES', descuento: true, medicamento: false }], faltaMedioPago: false };
    assert.deepEqual(u.respuestaDe(conDescuento, { metodoPagoId: 2, codigoDescuento: '07' }), {
      lineas: [{ numeroLinea: 2, codigoDescuento: '07', naturalezaDescuento: '' }]
    });
    assert.deepEqual(u.respuestaDe({ pendientes: [], faltaMedioPago: false }, { metodoPagoId: 2 }), {});
  });

  test('descuento y medio de pago a la vez: se piden los dos', () => {
    const ambos = { ...contado, pendientes: [{ numeroLinea: 2, nombre: 'FRIJOLES', descuento: true, medicamento: false }] };
    assert.match(u.faltaContestar(ambos.pendientes, { codigoDescuento: '07' }, ambos), /con qué paga/);
    assert.match(u.faltaContestar(ambos.pendientes, { metodoPagoId: 1 }, ambos), /motivo del descuento/);
    assert.deepEqual(Object.keys(u.respuestaDe(ambos, { metodoPagoId: 1, codigoDescuento: '07' })).sort(), ['lineas', 'metodoPagoId']);
  });

  test('la pantalla dice que elegirlo NO registra un cobro', () => {
    const datos = codigo('components', 'facturacion', 'DatosPendientesEmision.jsx');
    assert.match(datos, /¿Con qué paga el cliente\?/);
    assert.match(datos, /no registra ningún cobro/);
    assert.match(datos, /estado\.mediosPago/);
  });
});

describe('cómo quedó conectada la pantalla', () => {
  const vista = codigo('components', 'facturacion', 'VistaFactura.jsx');
  const boton = codigo('components', 'facturacion', 'BotonEmitirFactura.jsx');
  const panel = codigo('components', 'facturacion', 'PanelEmisionFactura.jsx');
  const gancho = codigo('hooks', 'useEmisionFactura.js');

  test('la factura usa el botón de un clic, no el modal', () => {
    assert.match(vista, /<BotonEmitirFactura emision=\{emision\} \/>/);
    assert.doesNotMatch(vista, /<DocumentoFiscal documento=\{f\}/, 'la factura volvió a abrir el modal');
    // Tampoco las notas de crédito: tienen su tarjeta con el mismo botón
    // (ver notaCreditoSeguimiento.test.js).
    assert.doesNotMatch(vista, /DocumentoFiscal/);
  });

  test('cada cosa en su lugar: reglas en utils, estado en el gancho, y los componentes solo dibujan', () => {
    // El molde del proyecto. Estos archivos nacieron juntos dentro de
    // integrations/hacienda, con otro formato que el de esa carpeta y con el
    // panel llamando al servidor por su cuenta (revisión del 2026-10-11).
    for (const ruta of [['utils', 'emisionPasos.js'], ['hooks', 'useEmisionFactura.js'],
      ['components', 'facturacion', 'BotonEmitirFactura.jsx'], ['components', 'facturacion', 'PanelEmisionFactura.jsx'],
      ['components', 'facturacion', 'DatosPendientesEmision.jsx']]) {
      assert.ok(fs.existsSync(path.join(FRONTEND, ...ruta)), `falta ${ruta.join('/')}`);
    }
    for (const dibujo of [boton, panel, codigo('components', 'facturacion', 'DatosPendientesEmision.jsx')]) {
      assert.doesNotMatch(dibujo, /integrations\/hacienda\/api|services\//, 'un componente volvió a llamar al servidor por su cuenta');
    }
    assert.match(gancho, /from '\.\.\/integrations\/hacienda\/api'/);
    // Bajar los XML también pasa por el gancho.
    assert.match(gancho, /await descargar\(c, respuesta\)/);
    assert.match(panel, /bajar, bajando, errorDescarga \} = emision/);
  });

  test('el botón no abre nada: llama a emitir', () => {
    assert.doesNotMatch(boton, /Modal/);
    assert.match(boton, /onClick=\{\(\) => emision\.emitir\(\)\}/);
  });

  test('el avance vive dentro de la factura, arriba del documento', () => {
    assert.match(vista, /\{!editando && <PanelEmisionFactura emision=\{emision\} \/>\}/);
    assert.ok(vista.indexOf('<PanelEmisionFactura') < vista.indexOf('rounded-2xl ${editando'), 'el panel quedó debajo del documento');
    assert.match(panel, /pasosDe\(/);
    assert.match(panel, /aria-live="polite"/);
  });

  test('el gancho encadena con los pasos de siempre del servidor', () => {
    assert.match(gancho, /emitirPasoAPaso\(/);
    assert.match(gancho, /firmar: \(\) => servidor\.emitir\(id, \{ sustituir: rechazado, \.\.\.respuesta \}\)/);
    assert.match(gancho, /factura: \{ estado: estadoFactura, emitir: emitirFactura, correo: reenviarCorreo \}/);
    assert.match(gancho, /enviar: \(c\) => operar\(c, 'enviar'\)/);
    assert.match(gancho, /consultar: \(c\) => operar\(c, 'consultar'\)/);
  });

  test('una histórica de Alegra, una anulada o un borrador no ofrecen emitir', () => {
    assert.match(vista, /activo: !f\.historica && f\.estado === 'emitida'/);
    assert.match(boton, /if \(!emision\.activo\) return null/);
  });

  test('al terminar se relee la factura sin cerrarla', () => {
    const lista = codigo('components', 'facturacion', 'PanelFacturasEmitidas.jsx');
    assert.match(lista, /onFiscalCambio=\{\(\) => f\.refrescarDetalle\(f\.detalle\.id\)\}/);
    const hook = codigo('hooks', 'useFacturasEmitidas.js');
    const refrescar = hook.slice(hook.indexOf('const refrescarDetalle'), hook.indexOf('const abrirEdicion'));
    assert.doesNotMatch(refrescar, /setDetalle\(null\)/, 'vaciar el detalle desmonta la pantalla y se pierde el avance');
  });

  test('el servidor tiene las tres rutas, y el correo se enchufa al armar el servicio', () => {
    const rutas = fs.readFileSync(path.join(__dirname, '..', 'src', 'integrations', 'hacienda', 'rutas.js'), 'utf8');
    assert.match(rutas, /"\/facturas\/:id\/estado"/);
    assert.match(rutas, /"\/facturas\/:id\/emitir"/);
    assert.match(rutas, /"\/facturas\/:id\/correo"/);
    assert.match(rutas, /alAceptarFactura:/);
    assert.match(rutas, /seguimiento: process\.env\.HACIENDA_TRABAJADOR === "true"/);
    assert.match(codigo('components', 'facturacion', 'PanelEmisionFactura.jsx'), /seguimiento: estado\?\.seguimiento/);
    assert.match(rutas, /entregarFacturaElectronica\(facturaId\)/);
    const api = codigo('integrations', 'hacienda', 'api.js');
    assert.match(api, /api\.get\(`\/facturacion\/hacienda\/facturas\/\$\{id\}\/estado`\)/);
    assert.match(api, /api\.post\(`\/facturacion\/hacienda\/facturas\/\$\{id\}\/emitir`, datos\)/);
    assert.match(api, /api\.post\(`\/facturacion\/hacienda\/facturas\/\$\{id\}\/correo`\)/);
  });
});
