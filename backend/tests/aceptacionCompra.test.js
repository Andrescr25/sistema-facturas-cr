const { test, describe, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');
const { crearAceptacion, motivoDeNoAceptar, AMBIENTE } = require('../src/integrations/hacienda/aceptacionCompra.service');
const { CONDICIONES_IVA_COMPRAS } = require('../src/integrations/hacienda/configuracion.service');

/**
 * La compra se acepta sola ante Hacienda.
 *
 * QUÉ SE PIDIÓ (2026-10-12). Al registrar una compra en Revisión de Precios
 * aparecía un formulario («Responder comprobante del proveedor»: ambiente en
 * pruebas, respuesta, detalle, condición del IVA, IVA a acreditar, gasto
 * aplicable). El usuario: «que una vez termine de revisar precio y la
 * registre, ese formulario se haga solo», «que siempre salga como totalmente
 * aceptada y ya en producción», y que la compra «NO se duplique, sino que
 * salga que yo le hice recepción».
 *
 * Acá se cuida lo que el sistema decide solo y, sobre todo, lo que NO decide:
 *  - siempre producción y siempre aceptación total;
 *  - la condición del IVA no tiene valor por omisión: sin elegirla no sale;
 *  - sin el XML del proveedor no se arma nada;
 *  - registrar la compra nunca falla por culpa de Hacienda.
 *
 * El XML mismo está en haciendaFiscal.test.js; lo que toca la base, en
 * haciendaPg.test.js. Acá todo es de mentira: ninguna prueba abre PostgreSQL.
 */

const BUZON = '11111111-2222-4333-8444-555555555555';
const COMPRA = { id: 77, estado: 'registrada', xml_ruta: 'compras-proveedor/xml-zz.xml' };

/** Un servicio de aceptación sobre una base de mentira. */
function montar({ compra = COMPRA, habilitada = true, condicion = '01', comprobante = null, preparar, enviar } = {}) {
  const consultas = [], preparados = [], enviados = [];
  const pool = { query: async (sql, p) => {
    consultas.push([sql, p]);
    if (/FROM compra WHERE/.test(sql)) return { rows: compra ? [compra] : [] };
    if (/FROM hacienda_configuracion/.test(sql)) return { rows: [{ habilitada, datos: { condicion_iva_compras: condicion } }] };
    if (/FROM hacienda_comprobante/.test(sql)) return { rows: comprobante ? [comprobante] : [] };
    throw new Error('consulta inesperada: ' + sql);
  } };
  const servicio = crearAceptacion({
    pool,
    tx: async (fn) => fn(pool),
    preparar: preparar || (async (...a) => { preparados.push(a); return { id: 900, estado: 'preparada', consecutivo: '00100001050000000001' }; }),
    enviar: enviar || (async (id) => { enviados.push(id); return { id, estado: 'recibida' }; }),
    vista: (r) => r || null,
    id: (v) => { const n = Number(v); if (!Number.isSafeInteger(n) || n <= 0) throw Object.assign(new Error('Identificador inválido.'), { code: 'ID_INVALIDO' }); return n; }
  });
  return { ...servicio.publico, alRegistrar: servicio.alRegistrar, consultas, preparados, enviados };
}

describe('por qué una compra todavía no se puede aceptar', () => {
  const base = { compra: COMPRA, habilitada: true, condicion: '01' };

  test('con todo en su lugar, se puede', () => {
    assert.equal(motivoDeNoAceptar(base), null);
  });

  test('sin el XML del proveedor no se inventa una aceptación', () => {
    assert.match(motivoDeNoAceptar({ ...base, compra: { ...COMPRA, xml_ruta: null } }), /no conserva el XML del proveedor/);
  });

  test('la condición del IVA NO tiene valor por omisión: sin elegirla no sale', () => {
    for (const condicion of [null, undefined, ''])
      assert.match(motivoDeNoAceptar({ ...base, condicion }), /Falta elegir con qué condición de IVA/);
  });

  test('solo va a producción: si no está habilitada, se dice', () => {
    assert.match(motivoDeNoAceptar({ ...base, habilitada: false }), /Habilitá Producción/);
    assert.equal(AMBIENTE, 'produccion');
  });

  test('una compra anulada no se acepta, y se dice primero lo que hay que arreglar primero', () => {
    assert.match(motivoDeNoAceptar({ ...base, compra: { ...COMPRA, estado: 'anulada' } }), /no está registrada/);
    // Le falta todo: el XML es lo primero, porque sin él lo demás no sirve.
    assert.match(motivoDeNoAceptar({ compra: { ...COMPRA, xml_ruta: null }, habilitada: false, condicion: null }), /XML del proveedor/);
  });
});

describe('lo que decide el sistema solo', () => {
  test('siempre producción, siempre aceptación total, con la condición elegida y sin montos a mano', async () => {
    const s = montar({ condicion: '04' });
    await s.aceptarCompra(77, {}, 4);
    assert.deepEqual(s.preparados, [['compra', 77, { ambiente: 'produccion', mensaje: '1', condicionImpuesto: '04', sustituir: false }, 4]]);
  });

  test('la pantalla manda el id de la factura del buzón, y se resuelve a su compra', async () => {
    const s = montar();
    const e = await s.estadoDeCompra(BUZON);
    assert.equal(e.compraId, 77);
    assert.match(s.consultas[0][0], /WHERE factura_proveedor_id=\$1/);
    assert.deepEqual(s.consultas[0][1], [BUZON]);
    const porId = montar();
    await porId.estadoDeCompra('77');
    assert.match(porId.consultas[0][0], /WHERE id=\$1/);
    assert.deepEqual(porId.consultas[0][1], [77]);
  });

  test('el estado dice lo que la pantalla necesita, sin comprobante todavía', async () => {
    const e = await montar().estadoDeCompra(77);
    assert.deepEqual(e, {
      compraId: 77, ambiente: 'produccion', tipo: '05', condicion: '01',
      necesitaXml: false, motivoNoEmitible: null, comprobante: null, declarado: null
    });
  });

  test('sin XML lo dice y pide subirlo; con uno guardado ya no', async () => {
    const e = await montar({ compra: { ...COMPRA, xml_ruta: null } }).estadoDeCompra(77);
    assert.equal(e.necesitaXml, true);
    assert.match(e.motivoNoEmitible, /XML del proveedor/);
  });

  test('una condición que no se puede declarar sola cuenta como no elegida', async () => {
    // Crédito parcial y bienes de capital piden montos de cada compra.
    for (const condicion of ['02', '03', '99', '', null]) {
      const s = montar({ condicion });
      const e = await s.estadoDeCompra(77);
      assert.equal(e.condicion, null, String(condicion));
      await assert.rejects(s.aceptarCompra(77), (x) => x.code === 'NO_EMITIBLE' && x.status === 409);
      assert.equal(s.preparados.length, 0, 'se reservó un número para una aceptación que no podía salir');
    }
    assert.deepEqual([...CONDICIONES_IVA_COMPRAS], ['01', '04', '05']);
  });

  test('rechazada: «volver a enviar» prepara otra, pidiéndola como sustitución', async () => {
    const s = montar();
    await s.aceptarCompra(77, { sustituir: true }, 4);
    assert.equal(s.preparados[0][2].sustituir, true);
    // Cualquier otra cosa que mande el navegador no llega al comprobante.
    const otro = montar();
    await otro.aceptarCompra(77, { ambiente: 'pruebas', mensaje: '3', condicionImpuesto: '05', sustituir: 'true' });
    assert.deepEqual(otro.preparados[0][2], { ambiente: 'produccion', mensaje: '1', condicionImpuesto: '01', sustituir: false });
  });

  test('una compra que no existe o un buzón sin compra registrada dan 404, cada uno con su motivo', async () => {
    await assert.rejects(montar({ compra: null }).estadoDeCompra(77), (x) => x.code === 'NO_EXISTE' && x.status === 404);
    await assert.rejects(montar({ compra: null }).estadoDeCompra(BUZON), (x) => x.code === 'COMPRA_NO_REGISTRADA' && x.status === 404);
    await assert.rejects(montar().estadoDeCompra('abc'), (x) => x.code === 'ID_INVALIDO');
  });
});

describe('al registrar la compra: sale sola, y nunca tumba el registro', () => {
  test('prepara y envía, y cuenta que salió', async () => {
    const s = montar();
    const r = await s.alRegistrar(77, 4);
    assert.deepEqual(r, { estado: 'enviada', comprobante: { id: 900, estado: 'recibida' } });
    assert.deepEqual(s.enviados, [900]);
    assert.equal(s.preparados[0][3], 4, 'no quedó anotado quién registró la compra');
  });

  test('sin condición elegida no reserva número ni envía: dice por qué quedó pendiente', async () => {
    const s = montar({ condicion: null });
    const r = await s.alRegistrar(77, 4);
    assert.equal(r.estado, 'pendiente');
    assert.match(r.motivo, /Falta elegir con qué condición de IVA/);
    assert.equal(s.preparados.length + s.enviados.length, 0);
  });

  test('si Hacienda no atiende, la compra igual quedó: se devuelve lo preparado y el motivo', async () => {
    const propio = Object.assign(new Error('Hacienda no confirmó el estado. Reintente después.'), { status: 502, code: 'HACIENDA_CONSULTA' });
    const s = montar({ enviar: async () => { throw propio; } });
    const r = await s.alRegistrar(77, 4);
    assert.equal(r.estado, 'pendiente');
    assert.equal(r.motivo, 'Hacienda no confirmó el estado. Reintente después.');
    assert.equal(r.comprobante.id, 900, 'la pantalla no sabría que ya hay una aceptación firmada esperando');
  });

  test('un error ajeno no llega a la pantalla con datos de la conexión', async () => {
    const ajeno = Object.assign(new Error('connect ECONNREFUSED usuario=zz-secreto clave=zz-clave'), { code: 'ECONNREFUSED' });
    for (const s of [montar({ enviar: async () => { throw ajeno; } }), montar({ preparar: async () => { throw ajeno; } })]) {
      const r = await s.alRegistrar(77, 4);
      assert.equal(r.estado, 'pendiente');
      assert.equal(r.motivo, 'No se pudo enviar la aceptación a Hacienda.');
      assert.doesNotMatch(JSON.stringify(r), /zz-secreto|zz-clave|ECONNREFUSED/);
    }
  });

  test('una compra que no existe tampoco lanza', async () => {
    const r = await montar({ compra: null }).alRegistrar(77, 4);
    assert.equal(r.estado, 'pendiente');
  });
});

describe('el controlador de compras: primero registra, después acepta', () => {
  const rutas = {
    servicio: require.resolve('../src/modules/compras/compras.service'),
    hacienda: require.resolve('../src/integrations/hacienda/rutas'),
    controlador: require.resolve('../src/modules/compras/compras.controller')
  };
  afterEach(() => { for (const r of Object.values(rutas)) delete require.cache[r]; });

  function montarControlador({ registrar, alRegistrarCompra }) {
    const doble = (ruta, exports) => { require.cache[ruta] = { id: ruta, filename: ruta, loaded: true, exports }; };
    doble(rutas.servicio, { registrarCompra: registrar });
    doble(rutas.hacienda, { alRegistrarCompra });
    delete require.cache[rutas.controlador];
    const res = { codigo: null, cuerpo: null, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
    return { controlador: require(rutas.controlador), res };
  }

  test('la respuesta trae cómo quedó la aceptación, junto con la compra', async () => {
    const orden = [];
    const { controlador, res } = montarControlador({
      registrar: async (...a) => { orden.push(['registrar', ...a]); return { compra: { id: 77 }, lineas: 2, costosActualizados: 2, preciosActualizados: 1 }; },
      alRegistrarCompra: async (...a) => { orden.push(['aceptar', ...a]); return { estado: 'enviada', comprobante: { id: 900 } }; }
    });
    await controlador.registrar({ body: { facturaId: BUZON, preciosAjustados: { x: 1 } }, usuario: { id: 4 } }, res);
    assert.equal(res.codigo, 201);
    assert.deepEqual(res.cuerpo.data.hacienda, { estado: 'enviada', comprobante: { id: 900 } });
    assert.equal(res.cuerpo.data.lineas, 2);
    assert.deepEqual(orden, [['registrar', BUZON, { x: 1 }, 4], ['aceptar', 77, 4]], 'la aceptación tiene que ir DESPUÉS de registrar, con el id de la compra');
  });

  test('una pantalla antigua no enlaza órdenes; Hacienda sigue usando el id de compra', async () => {
    const llamadas = [];
    const { controlador, res } = montarControlador({
      registrar: async (...a) => { llamadas.push(['registrar', ...a]); return { compra: { id: 77 }, lineas: 1, costosActualizados: 1, preciosActualizados: 0 }; },
      alRegistrarCompra: async (...a) => { llamadas.push(['aceptar', ...a]); return { estado: 'enviada' }; }
    });
    await controlador.registrar({ body: { facturaId: BUZON, ordenCompraId: 12 }, usuario: { id: 4 } }, res);
    assert.equal(res.cuerpo.data.ordenCompraId, undefined);
    assert.deepEqual(llamadas, [['registrar', BUZON, {}, 4], ['aceptar', 77, 4]]);
  });

  test('si la compra no se registró, no se le acepta nada a Hacienda', async () => {
    let aceptadas = 0;
    const { controlador, res } = montarControlador({
      registrar: async () => { throw Object.assign(new Error('La factura ya tiene una compra registrada.'), { status: 409 }); },
      alRegistrarCompra: async () => { aceptadas++; }
    });
    await controlador.registrar({ body: { facturaId: BUZON }, usuario: { id: 4 } }, res);
    assert.equal(res.codigo, 409);
    assert.equal(aceptadas, 0);
  });
});

describe('lo que dice la pantalla', () => {
  let t, pasos;
  before(async () => {
    t = await import('../../frontend/src/utils/aceptacionCompraTexto.js');
    pasos = await import('../../frontend/src/utils/emisionPasos.js');
  });
  const fmt = (n) => `₡${n}`;

  test('ofrece elegir exactamente las condiciones que el servidor acepta', () => {
    assert.deepEqual(t.CONDICIONES_IVA_COMPRAS.map(c => c[0]), [...CONDICIONES_IVA_COMPRAS]);
    for (const [, nombre, detalle] of t.CONDICIONES_IVA_COMPRAS) assert.ok(nombre && detalle);
    assert.equal(t.condicionDeIva('01'), 'Genera crédito de IVA');
    assert.equal(t.condicionDeIva('zz'), '');
  });

  test('aceptada: dice que es una confirmación y no otra compra', () => {
    const c = t.aceptacionDeCompra({ comprobante: { estado: 'aceptada' } });
    assert.equal(c.tono, 'exito');
    assert.match(c.titulo, /Hacienda registró que aceptaste esta compra/);
    assert.match(c.detalle, /no se crea otra compra/);
  });

  test('sin salir: dice por qué, o que alcanza con un clic', () => {
    const falta = t.aceptacionDeCompra({ comprobante: null, motivoNoEmitible: 'Falta elegir con qué condición de IVA…' });
    assert.equal(falta.tono, 'alerta');
    assert.match(falta.detalle, /Falta elegir/);
    assert.match(t.aceptacionDeCompra({ comprobante: null, motivoNoEmitible: null }).detalle, /Aceptar ante Hacienda/);
    assert.equal(t.aceptacionDeCompra({ comprobante: { estado: 'recibida' } }).titulo, 'La aceptación está en camino');
    assert.equal(t.aceptacionDeCompra({ comprobante: { estado: 'rechazada' } }).tono, 'peligro');
    assert.equal(t.aceptacionDeCompra(null), null, 'antes de que conteste el servidor no se afirma nada');
  });

  test('muestra lo que se le declaró a Hacienda, y solo lo que se declaró', () => {
    assert.equal(
      t.declaradoDe({ declarado: { condicion: '01', impuestoAcreditar: '13.00000', gastoAplicable: '100.00000' } }, fmt),
      'Genera crédito de IVA · IVA acreditado ₡13 · gasto aplicable ₡100'
    );
    // Proporcionalidad no lleva montos: no se escribe un cero que nadie declaró.
    assert.equal(t.declaradoDe({ declarado: { condicion: '05', impuestoAcreditar: null, gastoAplicable: null } }, fmt), 'Proporcionalidad');
    assert.equal(t.declaradoDe({ declarado: null }, fmt), '');
  });

  test('el aviso al registrar cuenta qué pasó con la aceptación', () => {
    assert.match(t.avisoDeAceptacion({ estado: 'enviada', comprobante: { estado: 'recibida' } }), /Aceptación enviada a Hacienda \(sin formulario\)/);
    assert.match(t.avisoDeAceptacion({ estado: 'enviada', comprobante: { estado: 'aceptada' } }), /ya registró tu aceptación/);
    const pendiente = t.avisoDeAceptacion({ estado: 'pendiente', motivo: 'Falta elegir la condición.' });
    assert.match(pendiente, /NO salió: Falta elegir la condición\./);
    assert.equal(t.avisoDeAceptacion(undefined), '', 'un servidor viejo que no la manda no rompe el aviso');
  });

  test('en la lista: aceptada, rechazada, en camino o falta; las viejas siguen diciendo «Registrada»', () => {
    assert.deepEqual(t.etiquetaDeAceptacion('aceptada'), { tono: 'exito', texto: 'Aceptada en Hacienda' });
    assert.deepEqual(t.etiquetaDeAceptacion('rechazada'), { tono: 'peligro', texto: 'Hacienda la rechazó' });
    assert.deepEqual(t.etiquetaDeAceptacion('sin_enviar'), { tono: 'alerta', texto: 'Falta aceptarla en Hacienda' });
    for (const enCamino of ['preparada', 'enviando', 'incierta', 'recibida', 'procesando', 'error'])
      assert.equal(t.etiquetaDeAceptacion(enCamino).texto, 'Aceptación en camino', enCamino);
    // Sin dato (las anteriores al corte): no se inventa una alarma.
    for (const sinDato of [null, undefined, ''])
      assert.deepEqual(t.etiquetaDeAceptacion(sinDato), { tono: 'neutro', texto: 'Registrada' });
  });

  test('la aceptación de una compra tiene tres pasos: no hay cliente a quien mandarle nada', () => {
    const aceptada = { consecutivo: '00100001050000000001', estado: 'aceptada', ambiente: 'produccion' };
    assert.deepEqual(pasos.pasosDe({ comprobante: aceptada, origen: 'compra' }).map(p => `${p.clave}=${p.estado}`),
      ['firma=hecho', 'envio=hecho', 'respuesta=hecho']);
    assert.equal(pasos.pasosDe({ comprobante: aceptada, origen: 'factura' }).length, 4);
    assert.equal(pasos.nombreDeTipo('05'), 'Aceptación de la compra ante Hacienda');
  });

  test('el botón no dice «emitir»: una compra se acepta', () => {
    const boton = (estado, fase = null) => pasos.botonDe({ estado, fase, origen: 'compra' });
    assert.equal(boton({ comprobante: null }).texto, 'Aceptar ante Hacienda');
    assert.equal(boton({ comprobante: { estado: 'preparada' } }).texto, 'Enviar a Hacienda');
    assert.deepEqual(boton({ comprobante: { estado: 'rechazada' } }), { texto: 'Volver a enviar la aceptación', sustituir: true });
    assert.equal(boton({ comprobante: { estado: 'aceptada' } }), null, 'una compra ya aceptada no ofrece aceptarla otra vez');
    assert.equal(boton({ comprobante: null }, 'firmando').texto, 'Enviando…');
    // La factura sigue diciendo lo suyo.
    assert.equal(pasos.botonDe({ estado: { comprobante: null }, fase: null }).texto, 'Emitir electrónicamente');
    assert.equal(pasos.resumenDe({ comprobante: null, fase: 'firmando', origen: 'compra' }).texto, 'Enviando');
  });
});

describe('cómo quedó conectado', () => {
  const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
  const front = (...p) => sinComentarios(fs.readFileSync(path.join(FRONTEND, ...p), 'utf8'));
  const back = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

  test('el formulario ya no existe: la compra registrada muestra la aceptación', () => {
    assert.equal(fs.existsSync(path.join(FRONTEND, 'integrations', 'hacienda', 'DocumentoFiscal.jsx')), false);
    const revision = front('components', 'revision-precios', 'RevisionFactura.jsx');
    assert.doesNotMatch(revision, /DocumentoFiscal|Respuesta a Hacienda/);
    assert.match(revision, /<AceptacionCompra factura=\{facturaSeleccionada\} \/>/);
    const bloque = front('components', 'revision-precios', 'AceptacionCompra.jsx');
    // Sin ambiente, respuesta, condición ni montos para llenar.
    assert.doesNotMatch(bloque, /<select|type="number"|Pruebas de Hacienda/);
    // El botón no se ofrece mientras falte algo que él no puede arreglar.
    assert.match(bloque, /\{!estado\.motivoNoEmitible && <BotonEmitirFactura emision=\{emision\} \/>\}/);
    assert.match(bloque, /<PanelEmisionFactura emision=\{emision\} \/>/);
    assert.match(front('components', 'revision-precios', 'TarjetaFactura.jsx'), /etiquetaDeAceptacion\(factura\.aceptacionHacienda\)/);
  });

  test('la pantalla ya no puede preparar un comprobante eligiendo ambiente o respuesta', () => {
    const api = front('integrations', 'hacienda', 'api.js');
    assert.doesNotMatch(api, /export async function (preparar|datosDocumento)\b/);
    assert.match(api, /\/compras\/hacienda\/compras\/\$\{id\}\/aceptar/);
    const rutas = back('integrations', 'hacienda', 'rutas.js');
    assert.doesNotMatch(rutas, /\/preparar|\/datos`|\/buzon\//);
    assert.match(rutas, /"\/compras\/:id\/estado"/);
    assert.match(rutas, /"\/compras\/:id\/aceptar"/);
    const gancho = front('hooks', 'useEmisionFactura.js');
    assert.match(gancho, /compra: \{ estado: estadoCompra, emitir: aceptarCompra \}/);
    // Sin correo: el panel no ofrece «Enviar al cliente» en una compra.
    assert.match(gancho, /enviarAlCliente: servidor\.correo \? enviarAlCliente : null/);
    assert.match(front('components', 'facturacion', 'PanelEmisionFactura.jsx'), /enProduccion && emision\.enviarAlCliente && \(/);
  });

  test('la aceptación corre después de registrar, y el aviso lo cuenta', () => {
    const controlador = back('modules', 'compras', 'compras.controller.js');
    assert.ok(controlador.indexOf('servicio.registrarCompra(') < controlador.indexOf('.alRegistrarCompra('));
    const hook = front('hooks', 'useRevisionPrecios.js');
    assert.match(hook, /avisoDeAceptacion\(resultado\.hacienda\)/);
  });

  test('la condición del IVA se elige en Configuración, solo en producción y sin opción marcada de fábrica', () => {
    const config = front('integrations', 'hacienda', 'ConfiguracionHacienda.jsx');
    assert.match(config, /ambiente === "produccion" && \(\s*<fieldset/);
    assert.match(config, /value=\{datos\.condicion_iva_compras \|\| ""\}/);
    assert.match(config, /<option value="">\s*Sin elegir: las compras no se aceptan solas/);
    // Dejarla vacía tiene que poder guardarse: es «todavía no».
    assert.match(front('integrations', 'hacienda', 'api.js'), /VACIO_ES_UN_VALOR = new Set\(\["condicion_iva_compras"\]\)/);
  });

  test('el seguimiento reintenta solo las aceptaciones de compra de producción, con tope', () => {
    const servicio = back('integrations', 'hacienda', 'emision.service.js');
    const sql = /async function pendientes\(\) \{[\s\S]*?LIMIT 10/.exec(servicio)[0];
    assert.match(sql, /origen='compra' AND ambiente='produccion' AND intentos<5/);
    assert.match(sql, /creado_en > now\(\)-interval '3 days'/);
    assert.match(servicio, /await \(r\.sin_salir \? enviar\(r\.id\) : consultar\(r\.id\)\)/);
  });
});
