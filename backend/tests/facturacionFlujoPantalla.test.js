const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');

/**
 * La pantalla de Facturación, después de recorrerla entera en un navegador
 * (2026-10-11: escritorio, tablet y teléfono; con y sin conexión; vender,
 * editar, anular y que el servidor rechace).
 *
 * LO QUE SE ENCONTRÓ Y QUEDA CUIDADO ACÁ
 *  1. La factura salía COBRADA sola: a todo cliente de contado (185 de 247)
 *     se le marcaba "Efectivo" por omisión, y en tablet y teléfono la elección
 *     ni se veía. Cada papel decía "Pagado · SALDO ₡0".
 *  2. El código del producto distinguía mayúsculas: "es-400" no encontraba
 *     ES-400 (662 productos tienen letras en la referencia).
 *  3. Tecleando "64⏎10⏎" de corrido, el "10" caía en la casilla del código.
 *  4. Un aviso viejo se llevaba al nuevo: el motivo de un rechazo desaparecía.
 *  5. Al volver la conexión la pantalla releía la cola antes de que la subida
 *     terminara: mostraba como pendiente lo que ya estaba facturado.
 *  6. En tablet no había cómo ver lo que esperaba subir.
 *  7. Editar una factura desde la lista borraba el detalle escrito en las
 *     otras líneas, y no mandaba lo que la pantalla mostraba.
 *  8. No había desde dónde anular un cobro.
 *
 * Lo del servidor (la guarda que seguía contando cobros anulados) está en
 * facturaCobroRevertido.test.js, contra la base; lo del papel, en
 * facturaPdf.test.js.
 *
 * Los archivos del frontend son ESM con imports sin extensión: se les quitan
 * las líneas de módulo y se evalúan, como en las demás pruebas de este tipo.
 */

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (...partes) => fs.readFileSync(path.join(FRONTEND, ...partes), 'utf8');
const codigo = (...partes) => sinComentarios(leer(...partes));
const sinModulo = (fuente) => fuente.replace(/^import .*$/gm, '').replace(/^export default .*$/gm, '').replace(/^export /gm, '');
const silencio = { log() {}, warn() {}, error() {} };

/** El cuerpo de `const nombre = (…) => {` hasta la llave que lo cierra. */
function cuerpoDe(fuente, nombre) {
  const inicio = fuente.search(new RegExp(`const ${nombre} = (async )?\\(`));
  assert.ok(inicio >= 0, `no está ${nombre}`);
  const abre = fuente.indexOf('{', fuente.indexOf('=>', inicio));
  let nivel = 0;
  for (let i = abre; i < fuente.length; i++) {
    if (fuente[i] === '{') nivel++;
    if (fuente[i] === '}' && --nivel === 0) return fuente.slice(abre, i + 1);
  }
  throw new Error(`no cierra ${nombre}`);
}

describe('la factura nace sin cobrar', () => {
  const hook = codigo('hooks', 'useFacturacion.js');

  test('elegir un cliente no marca ningún método de pago, sea de contado o a crédito', () => {
    const elegir = cuerpoDe(hook, 'seleccionarCliente');
    assert.match(elegir, /setMetodoPagoId\(null\)/);
    assert.doesNotMatch(elegir, /efectivo/i, 'volvió a marcarse Efectivo por omisión');
    assert.doesNotMatch(elegir, /plazoCreditoId/, 'el cobro por omisión volvió a depender del plazo del cliente');
  });

  test('el cobro de una venta no se hereda a la siguiente', () => {
    assert.match(cuerpoDe(hook, 'limpiarFactura'), /setMetodoPagoId\(null\)/);
  });

  test('"Queda pendiente" es la primera opción, no la última', () => {
    const selector = codigo('components', 'facturacion', 'SelectorPago.jsx');
    const opciones = selector.slice(selector.indexOf('const opciones = ['));
    assert.ok(opciones.indexOf('pendiente: true') < opciones.indexOf('...metodos.map'), 'no cobrar quedó otra vez al final');
  });

  test('la barra de tablet y teléfono dice qué va a pasar con el cobro sin abrir el desglose', () => {
    const panel = codigo('components', 'facturacion', 'PanelCobro.jsx');
    assert.match(panel, /Queda pendiente de cobro/);
    assert.match(panel, /Se cobra ahora: \$\{metodoElegido\.name\}/);
    // Dentro del botón que siempre está a la vista, no del desglose plegado.
    const barra = panel.slice(panel.indexOf('aria-expanded={desgloseAbierto}'));
    assert.match(barra.slice(0, barra.indexOf('</button>')), /\{estadoCobro\}/);
  });
});

describe('el código del producto', () => {
  const PRODUCTOS = [
    { id: 857, productoId: 857, reference: 'ES-400', name: 'ESCOBA SUPER FLAMANTE' },
    { id: 2051, productoId: 2051, reference: '0005', name: 'UNION LISA 1/2" PVC' }
  ];

  /** Una IndexedDB con el índice por referencia, que compara letra por letra como la de verdad. */
  function baseLocal() {
    const pedido = (resultado) => {
      const req = {};
      setTimeout(() => { req.result = resultado; req.onsuccess?.(); }, 0);
      return req;
    };
    const db = {
      transaction: () => ({
        objectStore: () => ({
          getAll: () => pedido(PRODUCTOS),
          index: () => ({ get: (ref) => pedido(PRODUCTOS.find(p => p.reference === ref)) })
        })
      })
    };
    const indexedDB = { open() { const req = { result: db }; setTimeout(() => req.onsuccess?.(), 0); return req; } };
    const Clase = new Function('indexedDB', 'combinarCopiaFactura', 'convertirCopiaV3', 'console',
      `${sinModulo(leer('services', 'indexedDBService.js'))}\nreturn IndexedDBService;`)(indexedDB, (a) => a, (a) => a, silencio);
    return new Clase();
  }

  test('se encuentra tal como está escrito', async () => {
    assert.equal((await baseLocal().getProductoByReference('ES-400')).id, 857);
  });

  test('y también en minúsculas o con espacios, como se teclea en una tablet', async () => {
    assert.equal((await baseLocal().getProductoByReference('es-400')).id, 857);
    assert.equal((await baseLocal().getProductoByReference('  Es-400 ')).id, 857);
  });

  test('los ceros siguen contando: "5" no es "0005"', async () => {
    assert.equal(await baseLocal().getProductoByReference('5'), undefined);
    assert.equal((await baseLocal().getProductoByReference('0005')).id, 2051);
  });

  test('un código vacío no devuelve el primer producto que encuentre', async () => {
    assert.equal(await baseLocal().getProductoByReference(''), undefined);
    assert.equal(await baseLocal().getProductoByReference('   '), undefined);
  });

  test('al dar Enter el foco pasa a la cantidad ANTES de buscar, no después', () => {
    const tecla = cuerpoDe(codigo('hooks', 'useFacturacion.js'), 'handleCodigoKeyPress');
    const foco = tecla.indexOf('cantidadInputRef.current?.focus()');
    const busca = tecla.indexOf('await buscarProductoPorCodigo(');
    assert.ok(foco >= 0 && busca >= 0 && foco < busca, 'el foco volvió a moverse después de la búsqueda');
    assert.doesNotMatch(tecla.slice(0, busca), /setTimeout/, 'el foco volvió a esperar un reloj');
  });
});

describe('los avisos', () => {
  const hook = codigo('hooks', 'useFacturacion.js');

  test('un aviso nuevo cancela el reloj del anterior', () => {
    const mostrar = cuerpoDe(hook, 'mostrarMensaje');
    assert.match(mostrar, /clearTimeout\(relojMensaje\.current\)/);
    assert.ok(mostrar.indexOf('clearTimeout') < mostrar.indexOf('setMensaje('), 'se muestra antes de cancelar el reloj viejo');
  });

  test('el que explica por qué NO se creó la factura no se va solo', () => {
    assert.match(cuerpoDe(hook, 'finalizarFactura'), /No se \$\{[^}]+\}: \$\{error\.message\}`, 'error', 0\)/);
    assert.match(cuerpoDe(hook, 'mostrarMensaje'), /fijo: duracion === 0/);
  });

  test('se cierra tocándolo', () => {
    const aviso = codigo('components', 'facturacion', 'AvisoFlotante.jsx');
    assert.match(aviso, /onClick=\{onCerrar\}/);
    assert.match(codigo('pages', 'Facturacion.jsx'), /<AvisoFlotante mensaje=\{mensaje\} onCerrar=\{cerrarMensaje\} \/>/);
  });

  test('el descuento de una línea se queda entre 0 y 100', () => {
    assert.match(cuerpoDe(hook, 'actualizarDescuentoItem'), /Math\.min\(100, Math\.max\(0,/);
  });
});

describe('lo que espera subir', () => {
  let copias;
  before(async () => { copias = await import('../../frontend/src/utils/facturasLocales.js'); });

  /** El servicio de verdad sobre una cola de mentira. */
  function servicio({ pendientes = [], responder }) {
    const actos = [];
    const db = {
      getFacturasPendientes: async () => pendientes.filter(p => !p.sincronizada),
      getEdicionesPendientes: async () => [],
      getFacturaById: async () => null,
      saveFacturasCache: async () => {},
      deleteFacturaCache: async () => {},
      markFacturaSincronizada: async (id) => { pendientes.find(p => p.localId === id).sincronizada = true; actos.push(`subió ${id}`); },
      markFacturaError: async (id, motivo) => { pendientes.find(p => p.localId === id).errorSincronizacion = motivo; actos.push(`rechazada ${id}`); }
    };
    const api = { post: async (_ruta, cuerpo) => responder(cuerpo) };
    const Clase = new Function('navigator', 'window', 'console', 'api', 'indexedDBService',
      'facturaEscrita', 'facturaConsultada', 'combinarCopiaFactura',
      `${sinModulo(leer('services', 'facturacionService.js'))}\nreturn FacturacionService;`)(
      { onLine: true }, { addEventListener() {} }, silencio, api, db,
      copias.facturaEscrita, copias.facturaConsultada, copias.combinarCopiaFactura);
    return { s: new Clase(), actos };
  }
  const rechazo = (mensaje) => Object.assign(new Error('Request failed with status code 400'), { response: { status: 400, data: { message: mensaje } } });
  const cola = () => [
    { localId: 1, clienteId: 7, claveIdempotencia: 'a', items: [{ productoId: 9, quantity: 1, price: 100 }] },
    { localId: 2, clienteId: 8, claveIdempotencia: 'b', items: [{ productoId: 47, quantity: 1, price: 105 }] }
  ];

  test('la pantalla se entera cuando la subida TERMINA, con lo que pasó', async () => {
    const { s, actos } = servicio({
      pendientes: cola(),
      responder: async (cuerpo) => {
        if (cuerpo.clienteId === 8) throw rechazo('ADAPTADOR MACHO está inactivo: no se puede facturar.');
        return { data: { success: true, data: { id: 90, numero: '001000014880' } } };
      }
    });
    const avisos = [];
    s.alSincronizar((aviso) => avisos.push({ ...aviso, actosHastaAhi: [...actos] }));
    await s.sincronizarFacturasPendientes();

    assert.equal(avisos.length, 1, 'no avisó, o avisó más de una vez');
    assert.equal(avisos[0].tipo, 'facturas');
    assert.deepEqual(avisos[0].actosHastaAhi, ['subió 1', 'rechazada 2'], 'avisó antes de terminar');
    assert.equal(avisos[0].resultado.sincronizadas, 1);
    assert.deepEqual(avisos[0].resultado.detalles.fallidas.map(f => [f.localId, f.rechazada]), [[2, true]]);
  });

  test('quien llega mientras otra subida corre no recibe un aviso falso de "terminó"', async () => {
    let soltar;
    const { s } = servicio({
      pendientes: cola().slice(0, 1),
      responder: () => new Promise((listo) => { soltar = () => listo({ data: { success: true, data: { id: 90, numero: 'N' } } }); })
    });
    const avisos = [];
    s.alSincronizar((aviso) => avisos.push(aviso));

    const primera = s.sincronizarFacturasPendientes();        // la del servicio, al volver la conexión
    await new Promise((r) => setTimeout(r, 5));
    const segunda = await s.sincronizarFacturasPendientes();   // la de la pantalla, que llega tarde
    assert.equal(segunda.success, false, 'la segunda no se enteró de que había otra en curso');
    assert.equal(avisos.length, 0, 'se avisó "terminó" con la subida todavía corriendo');

    soltar();
    await primera;
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].resultado.sincronizadas, 1);
  });

  test('se puede dejar de escuchar', async () => {
    const { s } = servicio({ pendientes: [], responder: async () => ({}) });
    let veces = 0;
    const dejar = s.alSincronizar(() => { veces++; });
    await s.sincronizarFacturasPendientes();
    dejar();
    await s.sincronizarFacturasPendientes();
    assert.equal(veces, 1);
  });

  test('la pantalla relee la cola en ese aviso, y no al toque después de pedir la subida', () => {
    const hook = codigo('hooks', 'useFacturacion.js');
    assert.match(hook, /facturacionService\.alSincronizar\(async \(\{ tipo, resultado \}\) =>/);
    const pedir = cuerpoDe(hook, 'sincronizarFacturas');
    assert.doesNotMatch(pedir, /setFacturasPendientes/, 'volvió a releer la cola antes de saber si la subida terminó');
  });

  test('en tablet y escritorio la pestaña aparece cuando hay algo por subir', () => {
    const pestanas = codigo('components', 'facturacion', 'PestanasFacturacion.jsx');
    assert.match(pestanas, /soloMovil: porSubir === 0/);
    assert.match(pestanas, /porSubir = \(Number\(edicionesPendientesCount\) \|\| 0\) \+ \(Number\(facturasPendientesCount\) \|\| 0\)/);
    assert.match(codigo('pages', 'Facturacion.jsx'), /facturasPendientesCount=\{facturasPendientes\.length\}/);
  });

  test('"por subir" cuenta la cola de ahora, no la que había al abrir', () => {
    assert.match(codigo('components', 'facturacion', 'EstadoCatalogo.jsx'), /valor: porSubir \?\? cacheStats\.facturasPendientes/);
    assert.match(codigo('pages', 'Facturacion.jsx'), /porSubir=\{facturasPendientes\.length\}/);
  });

  test('ir a ver lo pendiente no borra la venta en curso', () => {
    const cambiar = cuerpoDe(codigo('hooks', 'useFacturacion.js'), 'cambiarTab');
    const editar = cambiar.slice(cambiar.lastIndexOf("setTabActiva('editar')"));
    assert.match(editar, /if \(modoEdicion\) limpiarFactura\(\)/);
    assert.doesNotMatch(editar.replace(/if \(modoEdicion\) limpiarFactura\(\)/, ''), /limpiarFactura\(\)/, 'entrar a la pestaña volvió a vaciar la factura');
  });
});

describe('la factura ya emitida, vista y corregida desde la lista', () => {
  const vista = codigo('components', 'facturacion', 'VistaFactura.jsx');

  test('la copia que se edita lleva el detalle de cada línea, y al guardar se manda', () => {
    assert.match(vista, /descripcion: l\.descripcion \|\| ''/);
    const guardar = cuerpoDe(vista, 'guardar');
    assert.match(guardar, /description: \(l\.descripcion \|\| ''\)\.trim\(\)/);
  });

  test('al guardar se manda también lo que la pantalla mostraba', () => {
    const guardar = cuerpoDe(vista, 'guardar');
    for (const campo of [/clienteNombre: cliente\?\.nombre/, /clienteIdentificacion: cliente\?\.identificacion/, /reference: l\.referencia/, /name: l\.nombre/]) {
      assert.match(guardar, campo);
    }
  });

  test('el descuento se informa; no se vuelve a restar debajo del subtotal', () => {
    assert.match(vista, /Ya incluye \{colones\(descuento\)\} de descuento/);
    assert.doesNotMatch(vista, /<span>Descuento<\/span><span[^>]*>−\{colones\(f\.descuento\)\}/, 'volvió el renglón que hacía que la cuenta no cerrara');
  });

  test('el cobro se puede anular desde la factura, solo quien tiene el permiso', () => {
    assert.match(vista, /puedeAccion\(usuario, 'anular-cobro'\)/);
    assert.match(vista, /Anular cobro/);
    // Un cobro de Cuentas por Cobrar puede cubrir varias facturas: se avisa.
    assert.match(vista, /cobroAnulando\.facturas > 1/);
    assert.match(codigo('hooks', 'useFacturasEmitidas.js'), /await anularAbono\(pagoId, motivo\)/);
    assert.match(codigo('components', 'facturacion', 'PanelFacturasEmitidas.jsx'), /onAnularCobro=\{f\.anularCobro\}/);
  });

  test('el permiso existe con el mismo nombre en el servidor', () => {
    const servidor = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'usuarios', 'modulos.js'), 'utf8');
    assert.match(servidor, /clave: 'anular-cobro', metodo: 'PATCH', patron: \/\^\\\/cuentas-por-cobrar\\\/propios\\\/abonos\\\//);
    assert.match(codigo('utils', 'modulos.js'), /'anular-cobro'/);
  });
});
