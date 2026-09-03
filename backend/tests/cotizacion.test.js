/**
 * Test de cotizaciones.service.js.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Una cotización es una promesa de precio. No es documento fiscal —si sale
 * mal se corrige— pero el cliente YA la vio, y eso no se corrige: o se le
 * cobra de más al facturar, o se pierde la diferencia por sostener el precio
 * equivocado.
 *
 * Los dos errores que este archivo fija ya pasaron en producción, en otro
 * módulo:
 *
 *   1. Línea sin `tax`. Alegra no completa solo el impuesto del producto: el
 *      documento sale 13% más barato. Pasó con las facturas del portal
 *      (ver facturarPedidoConImpuesto.test.js).
 *   2. Precio tomado de lo que manda el navegador. Cualquiera podría cotizar
 *      a ₡1. El precio se lee siempre del catálogo del servidor.
 *
 * Y uno propio de este módulo: al facturar hay que usar el precio COTIZADO,
 * no el de hoy. Si el producto subió entre la cotización y la aceptación,
 * cobrarle el nuevo es romper lo que se le prometió al cliente.
 *
 * CÓMO SE PRUEBA SIN BASE DE DATOS NI ALEGRA
 * La base local ES la de producción y la cuenta de Alegra es la real: crear
 * una cotización de prueba de verdad consumiría un número. Se sustituyen
 * `config/database`, la integración de Alegra y facturacion.service por
 * dobles en require.cache ANTES de pedir el servicio, y se limpian los
 * cuatro módulos de la cadena en cada prueba.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaAlegra = require.resolve('../src/integrations/alegra');
const rutaFacturacion = require.resolve('../src/modules/facturacion/facturacion.service');
const rutaServicio = require.resolve('../src/modules/cotizaciones/cotizaciones.service');

/** El catálogo de impuestos tal como lo devuelve la cuenta real. */
const IMPUESTOS_ALEGRA = [
  { id: '1', name: 'IVA', percentage: '13.00', type: 'IVA', status: 'active' },
  { id: '2', name: 'IVA exento', percentage: '0.00', type: 'IVA', status: 'active' },
  { id: '6', name: 'IVA reducido', percentage: '4.00', type: 'IVA', status: 'active' },
  // Mismo porcentaje, otro tipo: no se debe colar en el mapa.
  { id: '9', name: 'Factor bienes usados', percentage: '4.00', type: 'IVA_BIENES_USADOS', status: 'active' }
];

/** Fila de alegra_products_cache. `price` va SIN impuesto, como en Alegra. */
function producto({ id, nombre, precio, iva = 13, estado = 'active', ref = '' }) {
  return {
    alegra_id: String(id), name: nombre, reference: ref,
    price: String(precio), tax_percentage: String(iva), status: estado
  };
}

/**
 * Arma el entorno: catálogo en la base, respuestas de Alegra, y devuelve el
 * servicio junto con el registro de lo que se le pidió a cada doble.
 */
function montar({ catalogo = [], intentoPrevio = [], alegraResponde = {}, facturaCreada } = {}) {
  const registro = { peticiones: [], escrituras: [], facturas: [] };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params = []) => {
        const texto = String(sql);
        if (/FROM alegra_products_cache/i.test(texto)) {
          const pedidos = (params[0] || []).map(String);
          return { rows: catalogo.filter(p => pedidos.includes(String(p.alegra_id))) };
        }
        if (/SELECT .*FROM factura_intento/i.test(texto)) {
          return { rows: intentoPrevio.filter(r => r.clave === params[0]) };
        }
        registro.escrituras.push({ sql: texto, params });
        return { rows: [] };
      }
    }
  };

  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getClient: () => ({
        request: async (metodo, ruta, cuerpo) => {
          registro.peticiones.push({ metodo, ruta, cuerpo });
          const clave = `${metodo} ${ruta}`;
          if (Object.prototype.hasOwnProperty.call(alegraResponde, clave)) {
            const r = alegraResponde[clave];
            return typeof r === 'function' ? r(cuerpo) : r;
          }
          if (metodo === 'POST' && ruta === '/estimates') {
            return { id: 777, numberTemplate: { fullNumber: 'COT-777' }, total: 0 };
          }
          if (metodo === 'PUT' && /^\/estimates\/\d+$/.test(ruta)) {
            return { id: 55, number: 55, total: 0 };
          }
          throw new Error(`El doble de Alegra no esperaba ${clave}`);
        }
      })
    }
  };

  class FacturacionDoble {
    async getTaxes() { return { success: true, data: IMPUESTOS_ALEGRA }; }
    async createInvoice(datos, clave) {
      registro.facturas.push({ datos, clave });
      return { success: true, data: facturaCreada || { id: 9001, numberTemplate: { fullNumber: 'FE-9001' } } };
    }
  }
  require.cache[rutaFacturacion] = {
    id: rutaFacturacion, filename: rutaFacturacion, loaded: true, exports: FacturacionDoble
  };

  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), registro };
}

/** El POST que se le mandó a Alegra para crear la cotización. */
const cuerpoCotizacion = (registro) =>
  registro.peticiones.find(p => p.metodo === 'POST' && p.ruta === '/estimates')?.cuerpo;

/** Una cotización tal como la devuelve GET /estimates/:id. */
function cotizacionEnAlegra({ id = 55, status = 'unbilled', items = [], vence } = {}) {
  const enUnMes = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  return {
    id, status, date: '2026-09-01', dueDate: vence || enUnMes,
    numberTemplate: { fullNumber: 'COT-55' },
    client: { id: 38, name: 'Pulpería La Esquina' },
    total: 1000,
    items
  };
}

beforeEach(() => {
  for (const r of [rutaDb, rutaAlegra, rutaFacturacion, rutaServicio]) delete require.cache[r];
});

describe('crear cotización', () => {
  test('cada línea lleva el impuesto que le toca, y el exento va sin impuesto', async () => {
    const { servicio, registro } = montar({
      catalogo: [
        producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000, iva: 13 }),
        producto({ id: 200, nombre: 'ARROZ 1KG', precio: 900, iva: 0 }),
        producto({ id: 300, nombre: 'MEDICAMENTO', precio: 2000, iva: 4 })
      ]
    });

    await servicio.crear({
      clienteId: 38,
      lineas: [
        { alegraItemId: '100', cantidad: 2 },
        { alegraItemId: '200', cantidad: 1 },
        { alegraItemId: '300', cantidad: 3 }
      ]
    });

    const items = cuerpoCotizacion(registro).items;
    const porId = Object.fromEntries(items.map(i => [i.id, i]));

    // El error que salió caro en el portal: sin `tax`, Alegra deja la línea
    // sin impuesto y el documento sale 13% más barato.
    assert.deepEqual(porId[100].tax, [{ id: '1', percentage: 13, name: 'IVA', type: 'IVA' }]);
    assert.deepEqual(porId[300].tax, [{ id: '6', percentage: 4, name: 'IVA reducido', type: 'IVA' }]);

    // Un exento va con tax vacío a propósito: Alegra tiene TRES tasas de 0%
    // distintas y el porcentaje suelto no dice cuál corresponde.
    assert.deepEqual(porId[200].tax, []);
  });

  test('el precio sale del catálogo del servidor, no del que mande el navegador', async () => {
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })]
    });

    await servicio.crear({
      clienteId: 38,
      // Un navegador manipulado mandando precio y nombre propios.
      lineas: [{ alegraItemId: '100', cantidad: 1, precio: 1, price: 1, nombre: 'REGALADO' }]
    });

    assert.equal(cuerpoCotizacion(registro).items[0].price, 5000);
  });

  test('un producto inactivo o que ya no existe queda fuera, avisando cuál', async () => {
    const { servicio, registro } = montar({
      catalogo: [
        producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 }),
        producto({ id: 200, nombre: 'DESCONTINUADO', precio: 800, estado: 'inactive' })
      ]
    });

    const r = await servicio.crear({
      clienteId: 38,
      lineas: [
        { alegraItemId: '100', cantidad: 1 },
        { alegraItemId: '200', cantidad: 1 },
        { alegraItemId: '999', cantidad: 1 }   // no está en el catálogo
      ]
    });

    assert.equal(cuerpoCotizacion(registro).items.length, 1);
    assert.equal(r.noDisponibles.length, 2);
    const fuera = r.noDisponibles.map(x => x.nombre);
    assert.ok(fuera.includes('DESCONTINUADO'), 'el inactivo debe quedar fuera');
    assert.ok(fuera.includes(null), 'el que ya no existe queda fuera, sin nombre que dar');
  });

  test('si no queda ninguna línea válida no se manda nada a Alegra', async () => {
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 200, nombre: 'DESCONTINUADO', precio: 800, estado: 'inactive' })]
    });

    await assert.rejects(
      () => servicio.crear({ clienteId: 38, lineas: [{ alegraItemId: '200', cantidad: 1 }] }),
      (e) => e.status === 400
    );
    assert.equal(cuerpoCotizacion(registro), undefined);
  });

  test('cantidad cero no cotiza una línea vacía', async () => {
    const { servicio, registro } = montar({
      catalogo: [
        producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 }),
        producto({ id: 200, nombre: 'ARROZ 1KG', precio: 900 })
      ]
    });

    await servicio.crear({
      clienteId: 38,
      lineas: [{ alegraItemId: '100', cantidad: 2 }, { alegraItemId: '200', cantidad: 0 }]
    });

    const items = cuerpoCotizacion(registro).items;
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 100);
  });

  test('si el impuesto del producto no existe en Alegra, se falla en vez de cotizar barato', async () => {
    const { servicio, registro } = montar({
      // 8% no está en el catálogo de impuestos de la cuenta.
      catalogo: [producto({ id: 100, nombre: 'RARO', precio: 1000, iva: 8 })]
    });

    await assert.rejects(
      () => servicio.crear({ clienteId: 38, lineas: [{ alegraItemId: '100', cantidad: 1 }] }),
      (e) => e.status === 500 && /8%/.test(e.message)
    );
    // Lo importante: NO se creó una cotización sin ese impuesto.
    assert.equal(cuerpoCotizacion(registro), undefined);
  });

  test('la fecha de vencimiento respeta los días de validez pedidos', async () => {
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })]
    });

    await servicio.crear({
      clienteId: 38, validezDias: 30, lineas: [{ alegraItemId: '100', cantidad: 1 }]
    });

    const { date, dueDate } = cuerpoCotizacion(registro);
    const dias = (new Date(dueDate) - new Date(date)) / 86400000;
    assert.equal(dias, 30);
  });

  test('la misma clave no crea una segunda cotización con otro número', async () => {
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })],
      intentoPrevio: [{ clave: 'cot-abc', alegra_invoice_id: '777', numero_factura: 'COT-777' }]
    });

    const r = await servicio.crear({
      clienteId: 38,
      claveIdempotencia: 'cot-abc',
      lineas: [{ alegraItemId: '100', cantidad: 1 }]
    });

    assert.equal(r.yaExistia, true);
    assert.equal(r.numero, 'COT-777');
    assert.equal(cuerpoCotizacion(registro), undefined, 'no debió pedirle otra cotización a Alegra');
  });

  test('sin cliente o sin líneas no se llama a Alegra', async () => {
    const { servicio, registro } = montar({ catalogo: [] });

    await assert.rejects(() => servicio.crear({ lineas: [{ alegraItemId: '1', cantidad: 1 }] }),
      (e) => e.status === 400);
    await assert.rejects(() => servicio.crear({ clienteId: 38, lineas: [] }),
      (e) => e.status === 400);
    assert.equal(registro.peticiones.length, 0);
  });
});

describe('listar', () => {
  test('nunca le pide a Alegra más de 30, que es su tope para cotizaciones', async () => {
    // Pedir 40 devuelve 400 ("El límite de cotizaciones para retornar debe
    // estar entre 0 y 30") y la pantalla sale en blanco. No es el mismo tope
    // que el de facturas: se descubrió con la lista ya en el navegador.
    const { servicio, registro } = montar({ alegraResponde: { 'GET /estimates': [] } });

    await servicio.listar({ limite: 500 });
    assert.equal(registro.peticiones[0].cuerpo.limit, 30);

    registro.peticiones.length = 0;
    await servicio.listar();
    assert.ok(registro.peticiones[0].cuerpo.limit <= 30);
  });

  test('"unbilled" es la que todavía no se facturó', async () => {
    const { servicio } = montar({
      alegraResponde: {
        'GET /estimates': [
          cotizacionEnAlegra({ id: 1, status: 'unbilled' }),
          cotizacionEnAlegra({ id: 2, status: 'billed' })
        ]
      }
    });

    const lista = await servicio.listar();
    assert.equal(lista[0].facturada, false);
    assert.equal(lista[1].facturada, true);
    assert.equal(lista[0].clienteNombre, 'Pulpería La Esquina');
  });
});

describe('facturar', () => {
  const LINEAS = [
    { id: 100, name: 'ACEITE 20W-50', reference: '167', quantity: 2, price: 5000, tax: [{ id: '1', percentage: '13.00' }], total: 11300 },
    { id: 200, name: 'ARROZ 1KG', reference: '900', quantity: 1, price: 900, tax: [], total: 900 }
  ];

  test('factura con el precio COTIZADO, aunque el catálogo ya haya subido', async () => {
    const { servicio, registro } = montar({
      // El precio de hoy es otro: si se colara, el cliente pagaría de más.
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 6500 })],
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS }) }
    });

    await servicio.facturar(55);

    const items = registro.facturas[0].datos.items;
    assert.equal(items.find(i => i.id === 100).price, 5000);
    assert.equal(items.find(i => i.id === 200).price, 900);
  });

  test('la factura conserva el impuesto de cada línea cotizada', async () => {
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS }) }
    });

    await servicio.facturar(55);

    const items = registro.facturas[0].datos.items;
    assert.deepEqual(items.find(i => i.id === 100).tax,
      [{ id: '1', percentage: 13, name: 'IVA', type: 'IVA' }]);
    assert.deepEqual(items.find(i => i.id === 200).tax, []);
  });

  test('facturar dos veces la misma cotización usa la misma clave', async () => {
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS }) }
    });

    await servicio.facturar(55);
    assert.equal(registro.facturas[0].clave, 'cotizacion-55');
  });

  test('una cotización ya facturada no se vuelve a facturar', async () => {
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ status: 'billed', items: LINEAS }) }
    });

    await assert.rejects(() => servicio.facturar(55), (e) => e.status === 400);
    assert.equal(registro.facturas.length, 0);
  });

  test('una cotización VENCIDA no se factura sin confirmar', async () => {
    // En la cuenta real hay cotizaciones de 2024 por más de un millón de
    // colones, todas con el botón "Facturar" al lado. Facturar usa el precio
    // COTIZADO —que es lo correcto mientras esté vigente— así que un clic
    // distraído vendería a precios de hace dos años.
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS, vence: '2024-07-30' }) }
    });

    await assert.rejects(() => servicio.facturar(55), (e) => e.status === 409 && /venció/.test(e.message));
    assert.equal(registro.facturas.length, 0, 'no debió crearse ninguna factura');
  });

  test('confirmando, la vencida sí se factura y con su precio de entonces', async () => {
    // Se puede sostener un precio vencido a propósito; lo que no se puede es
    // hacerlo sin enterarse.
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS, vence: '2024-07-30' }) }
    });

    await servicio.facturar(55, { aunqueVencida: true });
    assert.equal(registro.facturas.length, 1);
    assert.equal(registro.facturas[0].datos.items.find(i => i.id === 100).price, 5000);
  });

  test('una cotización vigente se factura sin pedir nada', async () => {
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS }) }
    });

    await servicio.facturar(55);
    assert.equal(registro.facturas.length, 1);
  });

  test('una cotización sin líneas no genera una factura vacía', async () => {
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: [] }) }
    });

    await assert.rejects(() => servicio.facturar(55), (e) => e.status === 400);
    assert.equal(registro.facturas.length, 0);
  });
});

describe('editar', () => {
  const LINEAS_ALEGRA = [
    { id: 100, name: 'ACEITE 20W-50', reference: '167', quantity: 2, price: 5000, tax: [{ id: '1', percentage: '13.00' }], total: 11300 }
  ];

  /** El PUT que se le mandó a Alegra. */
  const cuerpoPut = (registro) => registro.peticiones.find(p => p.metodo === 'PUT')?.cuerpo;

  test('editar también manda el impuesto de cada línea', async () => {
    // El motivo de que crear y editar compartan armarItems: si editar armara
    // las líneas por su cuenta, tocar una cantidad podría dejar la cotización
    // sin IVA y nadie lo notaría hasta ver el total.
    const { servicio, registro } = montar({
      catalogo: [
        producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5200, iva: 13 }),
        producto({ id: 200, nombre: 'ARROZ 1KG', precio: 900, iva: 0 })
      ],
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS_ALEGRA }) }
    });

    await servicio.editar(55, {
      lineas: [{ alegraItemId: '100', cantidad: 5 }, { alegraItemId: '200', cantidad: 2 }]
    });

    const items = cuerpoPut(registro).items;
    assert.deepEqual(items.find(i => i.id === 100).tax,
      [{ id: '1', percentage: 13, name: 'IVA', type: 'IVA' }]);
    assert.deepEqual(items.find(i => i.id === 200).tax, []);
  });

  test('editar actualiza los precios a los de hoy', async () => {
    // Es lo contrario que facturar, y a propósito: quien reabre una
    // cotización para cambiarla espera el precio de hoy; quien la factura
    // sin tocarla espera sostener el que prometió.
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 6500 })],
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS_ALEGRA }) }
    });

    await servicio.editar(55, { lineas: [{ alegraItemId: '100', cantidad: 2 }] });
    assert.equal(cuerpoPut(registro).items[0].price, 6500);
  });

  test('la fecha de emisión no se mueve al editar', async () => {
    // Moverla haría parecer que una cotización de la semana pasada es de hoy.
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })],
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS_ALEGRA }) }
    });

    await servicio.editar(55, { lineas: [{ alegraItemId: '100', cantidad: 2 }], vence: '2026-12-31' });
    assert.equal(cuerpoPut(registro).date, '2026-09-01', 'la de emisión es la original');
    assert.equal(cuerpoPut(registro).dueDate, '2026-12-31', 'la de vencimiento sí se puede correr');
  });

  test('sin fecha nueva se conserva la que ya tenía', async () => {
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })],
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS_ALEGRA, vence: '2026-10-05' }) }
    });

    await servicio.editar(55, { lineas: [{ alegraItemId: '100', cantidad: 1 }] });
    assert.equal(cuerpoPut(registro).dueDate, '2026-10-05');
  });

  test('una cotización ya facturada no se puede cambiar', async () => {
    // La factura la copia y es la que vale ante Hacienda: si la cotización
    // cambiara, los dos documentos dirían cosas distintas.
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })],
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ status: 'billed', items: LINEAS_ALEGRA }) }
    });

    await assert.rejects(
      () => servicio.editar(55, { lineas: [{ alegraItemId: '100', cantidad: 9 }] }),
      (e) => e.status === 400 && /ya se facturó/.test(e.message)
    );
    assert.equal(cuerpoPut(registro), undefined, 'no debió mandarse ningún PUT');
  });

  test('no se puede dejar sin productos', async () => {
    const { servicio, registro } = montar({
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS_ALEGRA }) }
    });

    await assert.rejects(() => servicio.editar(55, { lineas: [] }), (e) => e.status === 400);
    assert.equal(cuerpoPut(registro), undefined);
  });

  test('no se devuelve el total: Alegra contesta el PUT con el anterior', async () => {
    // Comprobado contra la cuenta real: se editó una cotización de ₡231 a
    // ₡4.355 y la respuesta del PUT seguía diciendo 231. Devolverlo sería
    // enseñarle al vendedor un número que ya no existe.
    const { servicio } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })],
      alegraResponde: {
        'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS_ALEGRA }),
        'PUT /estimates/55': { id: 55, number: 55, total: 231 }
      }
    });

    const r = await servicio.editar(55, { lineas: [{ alegraItemId: '100', cantidad: 4 }] });
    assert.equal(r.total, undefined);
    assert.equal(r.numero, '55');
  });

  test('si no se manda cliente se conserva el que tenía', async () => {
    const { servicio, registro } = montar({
      catalogo: [producto({ id: 100, nombre: 'ACEITE 20W-50', precio: 5000 })],
      alegraResponde: { 'GET /estimates/55': cotizacionEnAlegra({ items: LINEAS_ALEGRA }) }
    });

    await servicio.editar(55, { lineas: [{ alegraItemId: '100', cantidad: 1 }] });
    assert.equal(cuerpoPut(registro).client, 38);
  });
});

describe('pdf', () => {
  test('se pide con fields=pdf: el detalle normal no trae el enlace', async () => {
    const { servicio, registro } = montar({
      alegraResponde: {
        'GET /estimates/55': (params) => ({
          id: 55, number: 55,
          // Alegra solo devuelve `pdf` si se pide explícitamente.
          pdf: params?.fields === 'pdf' ? 'https://cdn3.alegra.com/x.pdf?Expires=1&Signature=y' : undefined
        })
      }
    });

    const r = await servicio.pdf(55);
    assert.match(r.url, /^https:\/\/cdn3\.alegra\.com\//);
    assert.equal(registro.peticiones[0].cuerpo.fields, 'pdf');
  });

  test('si Alegra no devuelve enlace se avisa, no se entrega uno vacío', async () => {
    const { servicio } = montar({
      alegraResponde: { 'GET /estimates/55': { id: 55, number: 55 } }
    });
    await assert.rejects(() => servicio.pdf(55), (e) => e.status === 404);
  });

  test('el enlace sirve aunque venga envuelto en un objeto', async () => {
    // Así lo devuelve el endpoint de facturas; no está de más aguantarlo.
    const { servicio } = montar({
      alegraResponde: { 'GET /estimates/55': { id: 55, pdf: { url: 'https://cdn3.alegra.com/y.pdf' } } }
    });
    assert.equal((await servicio.pdf(55)).url, 'https://cdn3.alegra.com/y.pdf');
  });
});
