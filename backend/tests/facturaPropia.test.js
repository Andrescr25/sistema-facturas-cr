const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
beforeEach(() => require('./dobles/inventario').instalar());

/**
 * Crear una factura de venta sin Alegra.
 *
 * LO QUE CUIDA ESTA PRUEBA, que no se ve mirando la pantalla:
 *  - que el impuesto salga del MAESTRO y no del `tax.id` que manda el
 *    navegador (ya pasó que esos ids no eran los de la cuenta y 82 líneas al
 *    1 % se registraron al 4 %);
 *  - que el número se tome de la serie propia y no se gaste si algo falla;
 *  - que la factura guarde copia fija del cliente y del producto;
 *  - que a un cliente de contado no se le ponga fecha de vencimiento a 30 días
 *    ni al revés.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'facturaPropia.service.js');

const CLIENTE_CONTADO = {
  id: 7, nombre: 'PULPERÍA LA ESQUINA', tipo_identificacion: 'CJ', identificacion: '3101123456',
  correo: 'pulperia@correo.com', activo: true, plazo_credito_id: 1, plazo_nombre: 'De contado', plazo_dias: 0,
  // La ficha real trae el contacto, y la factura lo copia: el papel lo lleva
  // impreso y tiene que reimprimirse igual años después.
  telefono: '2453-1122', celular: null,
  provincia: 'Alajuela', canton: 'Palmares', distrito: 'Zaragoza', barrio: null, otras_senas: 'Frente al parque'
};
const CLIENTE_CREDITO = { ...CLIENTE_CONTADO, plazo_credito_id: 3, plazo_nombre: '15 días', plazo_dias: 15 };

const TORNILLO = {
  id: 12, alegra_id: '1183', nombre: 'TORNILLO FRIJOLILLO 3/4', referencia: 'TOR02',
  descripcion: null, cabys: '4294401030100', unidad: 'Unid', activo: true, impuesto_id: 1, tarifa: '13.00'
};
// Un producto al 1 %: es donde se nota si alguien vuelve a asumir el 13 %.
const SALSA = {
  id: 20, alegra_id: '900', nombre: 'GALON SALSA LIZANO 5L', referencia: 'SAL01',
  descripcion: null, cabys: '1079120000000', unidad: 'Unid', activo: true, impuesto_id: 4, tarifa: '1.00'
};

function montar({ cliente = CLIENTE_CONTADO, productos = [TORNILLO], serie = null, fallaInsert = false } = {}) {
  const log = [];
  const serieActiva = serie || { id: 1, serie: '00100001', siguiente: '4869', ancho_consecutivo: 0, electronica: false, activo: true };

  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });

    if (/FROM cliente c/.test(texto)) return { rows: cliente ? [{ ...cliente }] : [] };
    if (/FROM producto p/.test(texto)) return { rows: productos.map(p => ({ ...p })) };
    if (/FROM cliente c/.test(texto)) return { rows: clienteNuevo ? [{ ...clienteNuevo }] : [] };
    if (/FROM serie_consecutivo/.test(texto)) return { rows: [{ ...serieActiva }] };
    if (/INSERT INTO factura \(/.test(texto)) {
      if (fallaInsert) throw new Error('la base se cayó');
      const columnas = texto.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      return { rows: [{ id: 500, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])) }] };
    }
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [], rowCount: 1 };
  };

  const clientePg = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => clientePg, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

const hubo = (log, re) => log.some(l => re.test(l.sql));
const params = (log, re) => log.find(l => re.test(l.sql))?.params;
const columnasDe = (entrada) => entrada.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
const valor = (entrada, columna) => entrada.params[columnasDe(entrada).indexOf(columna)];

const VENTA = {
  client: 128,
  // `fecha` es lo que lee el servicio; `date` es como lo nombra la pantalla y
  // hoy se descarta (ver el checklist: falta decidir qué pasa con una factura
  // hecha sin señal y sincronizada días después).
  fecha: '2026-09-12',
  date: '2026-09-12',
  items: [{ id: '1183', quantity: 2, price: 1000, discount: 0, tax: [{ id: '9999' }] }]
};

describe('el impuesto sale del maestro', () => {
  test('ignora el id de impuesto que manda la pantalla y usa la tarifa del producto', async () => {
    // El navegador manda tax:[{id:'9999'}], que no existe. La tarifa que vale
    // es la del producto: 13 %.
    const { servicio, log } = montar();
    await servicio.crearFactura(VENTA, 4);
    const linea = log.find(l => /INSERT INTO factura_linea/.test(l.sql));
    assert.equal(valor(linea, 'tarifa'), 13);
    assert.equal(valor(linea, 'impuesto_id'), 1);
    assert.equal(valor(linea, 'impuesto_monto'), 260);  // 2.000 × 13 %
  });

  test('un producto al 1 % paga 1 %, no 13 %', async () => {
    const { servicio, log } = montar({ productos: [SALSA] });
    await servicio.crearFactura({ ...VENTA, items: [{ id: '900', quantity: 1, price: 10000 }] }, 4);
    const linea = log.find(l => /INSERT INTO factura_linea/.test(l.sql));
    assert.equal(valor(linea, 'tarifa'), 1);
    assert.equal(valor(linea, 'impuesto_monto'), 100);
  });

  test('los totales de la factura suman lo de las líneas', async () => {
    const { servicio, log } = montar({ productos: [TORNILLO, SALSA] });
    await servicio.crearFactura({
      ...VENTA,
      items: [
        { id: '1183', quantity: 2, price: 1000 },       // 2.000 + 260 de IVA
        { id: '900', quantity: 1, price: 10000 }        // 10.000 + 100 de IVA
      ]
    }, 4);
    const factura = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(factura, 'subtotal'), 12000);
    assert.equal(valor(factura, 'impuesto'), 360);
    assert.equal(valor(factura, 'total'), 12360);
    assert.equal(valor(factura, 'saldo'), 12360, 'nace sin pagos: el cobro se registra aparte');
  });
});

describe('el descuento', () => {
  test('se guarda en porcentaje y en monto, y baja la base del impuesto', async () => {
    const { servicio, log } = montar();
    await servicio.crearFactura({ ...VENTA, items: [{ id: '1183', quantity: 2, price: 1000, discount: 10 }] }, 4);
    const linea = log.find(l => /INSERT INTO factura_linea/.test(l.sql));
    assert.equal(valor(linea, 'descuento_porcentaje'), 10);
    assert.equal(valor(linea, 'descuento_monto'), 200);
    assert.equal(valor(linea, 'impuesto_monto'), 234, '13 % sobre 1.800, no sobre 2.000');
    assert.equal(valor(linea, 'total'), 2034);
  });

  test('un descuento imposible se rechaza', async () => {
    const { servicio } = montar();
    await assert.rejects(
      servicio.crearFactura({ ...VENTA, items: [{ id: '1183', quantity: 1, price: 100, discount: 150 }] }, 4),
      e => e.status === 400 && /entre 0 y 100/.test(e.message)
    );
  });
});

describe('el número', () => {
  test('sale de la serie propia, con FOR UPDATE, y queda en la factura', async () => {
    const { servicio, log } = montar();
    const factura = await servicio.crearFactura(VENTA, 4);
    assert.ok(hubo(log, /FROM serie_consecutivo.*FOR UPDATE/));
    const guardada = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(guardada, 'numero'), '001000014869');
    assert.equal(valor(guardada, 'consecutivo'), 4869);
    assert.equal(valor(guardada, 'electronica'), false);
    assert.equal(factura.numero, '001000014869');
  });

  test('si la factura no se guarda, el número no se gasta', async () => {
    // El consecutivo se toma dentro de la misma transacción: al revertirse,
    // vuelve atrás con todo lo demás.
    const { servicio, log } = montar({ fallaInsert: true });
    await assert.rejects(servicio.crearFactura(VENTA, 4), /la base se cayó/);
    assert.ok(hubo(log, /^ROLLBACK$/), 'tiene que revertir');
  });
});

describe('la fecha del documento', () => {
  test('es el día en Costa Rica, no el de UTC', () => {
    const { servicio } = montar();
    // 13 de setiembre a la 01:21 UTC son todavía las 19:21 del 12 en Costa
    // Rica. Con toISOString() la factura salía fechada mañana, y acá se
    // factura de noche.
    assert.equal(servicio.hoyEnCostaRica(new Date('2026-09-13T01:21:00Z')), '2026-09-12');
    assert.equal(servicio.hoyEnCostaRica(new Date('2026-09-13T06:30:00Z')), '2026-09-13');
  });

  test('sin fecha, la factura nace con el día de hoy en Costa Rica', async () => {
    const { servicio, log } = montar();
    // A propósito SIN fecha: es el camino por omisión, el del mostrador.
    await servicio.crearFactura({ ...VENTA, fecha: undefined, date: undefined }, 4);
    const factura = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(factura, 'fecha'), servicio.hoyEnCostaRica());
  });
});

describe('el cliente y el plazo', () => {
  test('copia fija: nombre y cédula quedan escritos en el documento', async () => {
    const { servicio, log } = montar();
    await servicio.crearFactura(VENTA, 4);
    const factura = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(factura, 'cliente_id'), 7);
    assert.equal(valor(factura, 'cliente_nombre'), 'PULPERÍA LA ESQUINA');
    assert.equal(valor(factura, 'cliente_identificacion'), '3101123456');
  });

  test('la copia incluye el teléfono y la dirección, no solo el nombre', async () => {
    // El PDF los imprime. Se copiaban vacíos porque la consulta del cliente no
    // traía esas columnas: las facturas nuevas salían sin los datos del
    // cliente y solo se veía al mirar el papel.
    const { servicio, log } = montar();
    await servicio.crearFactura(VENTA, 4);
    const factura = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(factura, 'cliente_telefono'), '2453-1122');
    assert.equal(valor(factura, 'cliente_direccion'), 'Alajuela Palmares Zaragoza Frente al parque');
  });

  test('de contado: vence el mismo día', async () => {
    const { servicio, log } = montar();
    await servicio.crearFactura(VENTA, 4);
    const factura = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(factura, 'condicion_venta'), 'contado');
    assert.equal(valor(factura, 'fecha_vencimiento'), '2026-09-12');
    assert.equal(valor(factura, 'plazo_credito_id'), null);
  });

  test('a crédito: vence a los días del plazo del cliente', async () => {
    const { servicio, log } = montar({ cliente: CLIENTE_CREDITO });
    await servicio.crearFactura(VENTA, 4);
    const factura = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(factura, 'condicion_venta'), 'credito');
    assert.equal(valor(factura, 'fecha_vencimiento'), '2026-09-27');
    assert.equal(valor(factura, 'plazo_texto'), '15 días');
  });

  test('a un cliente inactivo no se le factura', async () => {
    const { servicio } = montar({ cliente: { ...CLIENTE_CONTADO, activo: false } });
    await assert.rejects(servicio.crearFactura(VENTA, 4), e => e.status === 400 && /inactivo/.test(e.message));
  });

  test('un cliente que no existe se dice, no se inventa', async () => {
    const { servicio } = montar({ cliente: null });
    await assert.rejects(servicio.crearFactura(VENTA, 4), e => e.status === 400 && /No se encontró ese cliente/.test(e.message));
  });
});

describe('lo que no se factura', () => {
  test('sin líneas no hay factura', async () => {
    const { servicio, log } = montar();
    await assert.rejects(servicio.crearFactura({ ...VENTA, items: [] }, 4), e => e.status === 400 && /sin líneas|no tiene líneas/.test(e.message));
    assert.equal(log.length, 0);
  });

  test('un producto inactivo o inexistente no pasa', async () => {
    const inactivo = montar({ productos: [{ ...TORNILLO, activo: false }] });
    await assert.rejects(inactivo.servicio.crearFactura(VENTA, 4), e => e.status === 400 && /inactivo/.test(e.message));

    const vacio = montar({ productos: [] });
    await assert.rejects(vacio.servicio.crearFactura(VENTA, 4), e => e.status === 400 && /No se encontró el producto/.test(e.message));
  });

  test('cantidad en cero o negativa se rechaza', async () => {
    const { servicio } = montar();
    for (const cantidad of [0, -2]) {
      await assert.rejects(
        servicio.crearFactura({ ...VENTA, items: [{ id: '1183', quantity: cantidad, price: 100 }] }, 4),
        e => e.status === 400 && /cantidad/.test(e.message)
      );
    }
  });
});

describe('lo que se guarda es texto, no código', () => {
  test('ninguna columna recibe una función', async () => {
    // ESTO PASÓ DE VERDAD. `texto` de utils/validacion se usa al revés que el
    // `texto` de los archivos de traducción: uno es texto(largo)(valor), el
    // otro texto(valor, largo). Escribirlo al revés no falla ni avisa —
    // devuelve la función, que al guardarse se vuelve su propio código fuente,
    // 294 caracteres que reventaban tres columnas a la vez. Los dobles de
    // estas pruebas lo aceptaban sin chistar, así que llegó hasta la base.
    const { servicio, log } = montar();
    await servicio.crearFactura({ ...VENTA, metodoPagoTexto: 'efectivo', vendedor: 'Andrés' }, 4);

    for (const entrada of log.filter(l => /^INSERT INTO/.test(l.sql))) {
      for (const [i, v] of entrada.params.entries()) {
        assert.notEqual(typeof v, 'function', `${columnasDe(entrada)[i]} recibió una función`);
        if (typeof v === 'string') {
          assert.equal(/=>|function\s*\(/.test(v), false, `${columnasDe(entrada)[i]} recibió código: ${v.slice(0, 40)}`);
        }
      }
    }
  });

  test('los textos se recortan al largo de su columna', async () => {
    const { servicio, log } = montar();
    await servicio.crearFactura({ ...VENTA, metodoPagoTexto: 'x'.repeat(120), vendedor: 'y'.repeat(300) }, 4);
    const factura = log.find(l => /INSERT INTO factura \(/.test(l.sql));
    assert.equal(valor(factura, 'metodo_pago_texto').length, 40);
    assert.equal(valor(factura, 'vendedor').length, 120);
  });
});

// La factura que se va a editar o anular, tal como la devuelve la base.
const EMITIDA = {
  id: 500, numero: '001000014869', serie: '00100001', consecutivo: 4869, electronica: false,
  estado: 'emitida', fecha: '2026-09-12', total: '3051.00', impuesto: '351.00', saldo: '3051.00',
  // La fila real siempre trae el cliente; sin él, una prueba sobre cambiar de
  // cliente no puede distinguir "el mismo" de "otro".
  cliente_id: 7, cliente_nombre: 'PULPERÍA LA ESQUINA'
};

/** Doble para editar/anular: controla cobros y notas aplicadas. */
function montarEmitida({ factura = EMITIDA, cobrado = 0, acreditado = 0, productos = [TORNILLO], clienteNuevo = null, enLaFactura = [] } = {}) {
  const log = [];
  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });
    if (/FROM factura WHERE id = \$1 FOR UPDATE/.test(texto)) return { rows: factura ? [{ ...factura }] : [] };
    if (/FROM pago_factura/.test(texto)) return { rows: [{ total: cobrado }] };
    if (/FROM nota_credito_factura/.test(texto)) return { rows: [{ total: acreditado }] };
    if (/SELECT DISTINCT producto_id FROM factura_linea/.test(texto)) return { rows: enLaFactura.map(id => ({ producto_id: id })) };
    if (/FROM producto p/.test(texto)) return { rows: productos.map(p => ({ ...p })) };
    if (/FROM cliente c/.test(texto)) return { rows: clienteNuevo ? [{ ...clienteNuevo }] : [] };
    if (/^UPDATE factura/.test(texto)) return { rows: [{ ...factura, estado: 'anulada' }] };
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [], rowCount: 1 };
  };
  const clientePg = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => clientePg, query: ejecutar }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log };
}

describe('anular una factura', () => {
  test('no se borra: queda anulada, con su número y su motivo', async () => {
    // Un número que desaparece es un hueco que después hay que explicarle a
    // Hacienda.
    const { servicio, log } = montarEmitida();
    await servicio.anularFactura(500, { motivo: 'El cliente devolvió todo' }, 4);
    assert.equal(hubo(log, /DELETE FROM factura\b/), false);
    const update = log.find(l => /^UPDATE factura/.test(l.sql));
    assert.match(update.sql, /estado = 'anulada'/);
    assert.match(update.sql, /saldo = 0/);
    assert.equal(update.params[0], 'El cliente devolvió todo');
    assert.equal(params(log, /INSERT INTO bitacora_cambio/).includes('anular'), true);
  });

  test('sin motivo no se anula', async () => {
    const { servicio, log } = montarEmitida();
    for (const motivo of [undefined, '', '  ', 'ups']) {
      await assert.rejects(servicio.anularFactura(500, { motivo }, 4), e => e.status === 400 && /por qué se anula/.test(e.message));
    }
    assert.equal(log.length, 0, 'ni siquiera llega a la base');
  });

  test('una factura con cobros aplicados NO se anula: primero se revierte el cobro', async () => {
    const { servicio, log } = montarEmitida({ cobrado: 3051 });
    await assert.rejects(
      servicio.anularFactura(500, { motivo: 'error de digitación' }, 4),
      e => e.status === 409 && /cobros aplicados/.test(e.message) && /3.051/.test(e.message)
    );
    assert.equal(hubo(log, /^UPDATE factura/), false);
  });

  test('una electrónica no se anula: se corrige con nota de crédito', async () => {
    // Ante Hacienda ya existe; anularla por dentro no la borra de allá.
    const { servicio } = montarEmitida({ factura: { ...EMITIDA, electronica: true } });
    await assert.rejects(
      servicio.anularFactura(500, { motivo: 'error de digitación' }, 4),
      e => e.status === 409 && /nota de crédito/.test(e.message)
    );
  });

  test('anular lo ya anulado no es un error', async () => {
    const { servicio, log } = montarEmitida({ factura: { ...EMITIDA, estado: 'anulada' } });
    const r = await servicio.anularFactura(500, { motivo: 'de nuevo' }, 4);
    assert.equal(r.estado, 'anulada');
    assert.equal(hubo(log, /^UPDATE factura/), false, 'no vuelve a escribir');
  });

  test('una factura que no existe da 404', async () => {
    const { servicio } = montarEmitida({ factura: null });
    await assert.rejects(servicio.anularFactura(500, { motivo: 'lo que sea' }, 4), e => e.status === 404);
  });
});

describe('editar una factura emitida', () => {
  test('reemplaza las líneas y recalcula los totales, sin cambiar el número', async () => {
    const { servicio, log } = montarEmitida();
    await servicio.editarFactura(500, { items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4);
    assert.ok(hubo(log, /DELETE FROM factura_linea WHERE factura_id/), 'las líneas se reemplazan enteras');
    const update = log.find(l => /^UPDATE factura/.test(l.sql));
    assert.equal(/numero =/.test(update.sql), false, 'el número no se toca: es el mismo documento');
    assert.equal(update.params[3], 1130, 'total recalculado: 1.000 + 13 %');
  });

  test('se puede corregir el cliente, y el plazo pasa a ser el suyo', async () => {
    // Es el error más caro de una factura: queda a nombre de quien no compró y
    // la deuda se le reclama a esa persona.
    const { servicio, log } = montarEmitida({
      clienteNuevo: {
        id: 9, activo: true, nombre: 'FERRETERÍA EL CLAVO', tipo_identificacion: 'CJ', identificacion: '3101999999',
        correo: 'clavo@ejemplo.com', telefono: '2453-1122', celular: null,
        provincia: 'Alajuela', canton: 'Palmares', distrito: 'Zaragoza', barrio: null, otras_senas: 'Frente al parque',
        plazo_credito_id: 3, plazo_dias: 30, plazo_nombre: '30 días'
      }
    });

    await servicio.editarFactura(500, { clienteId: 9, items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4);
    const update = log.find(l => /^UPDATE factura/.test(l.sql));

    assert.match(update.sql, /cliente_id = /, 'no cambió el cliente');
    // Se copia la ficha ENTERA, no solo el nombre: el documento tiene que
    // poder reimprimirse igual años después.
    for (const columna of ['cliente_nombre', 'cliente_identificacion', 'cliente_telefono', 'cliente_direccion']) {
      assert.match(update.sql, new RegExp(`${columna} = `), `no copió ${columna}`);
    }
    assert.ok(update.params.includes('FERRETERÍA EL CLAVO'));
    assert.ok(update.params.includes('Alajuela Palmares Zaragoza Frente al parque'));
    // El plazo es del cliente NUEVO: pasa a crédito a 30 días.
    assert.ok(update.params.includes('credito'), 'no recalculó la condición de venta');
    assert.ok(update.params.includes('30 días'));
  });

  // 2026-10-13, en producción: «Invalid time value» al cambiar el cliente.
  // La base no entrega la fecha como texto sino como un Date; la prueba de
  // arriba usa un texto y por eso nunca lo vio. `String(unDate).slice(0, 10)`
  // es "Sat Sep 12", y sumarle los días del plazo reventaba.
  test('cambiar el cliente con la fecha COMO LA ENTREGA LA BASE: el vencimiento se recalcula bien', async () => {
    const delDriver = { ...EMITIDA, fecha: new Date(2026, 8, 12) };   // DATE → Date a la medianoche local
    const aCredito = montarEmitida({
      factura: delDriver,
      clienteNuevo: { id: 9, activo: true, nombre: 'FERRETERÍA EL CLAVO', plazo_credito_id: 3, plazo_dias: 30, plazo_nombre: '30 días' }
    });
    await aCredito.servicio.editarFactura(500, { clienteId: 9, items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4);
    const conPlazo = aCredito.log.find(l => /^UPDATE factura/.test(l.sql));
    assert.ok(conPlazo.params.includes('2026-10-12'), `el vencimiento a 30 días salió mal: ${JSON.stringify(conPlazo.params.filter(p => /\d{4}-|Sep|Invalid/.test(String(p))))}`);

    const deContado = montarEmitida({
      factura: delDriver,
      clienteNuevo: { id: 9, activo: true, nombre: 'FERRETERÍA EL CLAVO', plazo_credito_id: null, plazo_dias: null, plazo_nombre: null }
    });
    await deContado.servicio.editarFactura(500, { clienteId: 9, items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4);
    const sinPlazo = deContado.log.find(l => /^UPDATE factura/.test(l.sql));
    assert.ok(sinPlazo.params.includes('2026-09-12'), 'de contado, vence el mismo día de la factura');
    assert.ok(sinPlazo.params.includes('contado'));
    for (const update of [conPlazo, sinPlazo])
      assert.equal(update.params.some(p => /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d/.test(String(p))), false, 'se guardó una fecha con forma de "Sat Sep 12"');
  });

  test('un producto desactivado DESPUÉS de facturarlo se conserva al editar; uno nuevo inactivo no entra', async () => {
    // Impresión edita la factura para reimprimirla (rebaja faltantes, pone
    // precios del catálogo): si un producto de la factura se desactivó
    // después, no se podía procesar. Había 8 facturas así en el último mes.
    const inactivo = { ...TORNILLO, activo: false };
    const ya = montarEmitida({ productos: [inactivo], enLaFactura: [TORNILLO.id] });
    await ya.servicio.editarFactura(500, { items: [{ productoId: TORNILLO.id, quantity: 1, price: 1000 }] }, 4);
    assert.ok(hubo(ya.log, /^UPDATE factura/), 'no editó la factura');

    const nuevo = montarEmitida({ productos: [inactivo], enLaFactura: [] });
    await assert.rejects(
      nuevo.servicio.editarFactura(500, { items: [{ productoId: TORNILLO.id, quantity: 1, price: 1000 }] }, 4),
      e => e.status === 400 && /inactivo/.test(e.message)
    );
  });

  test('sin cliente nuevo, la factura conserva el suyo', async () => {
    const { servicio, log } = montarEmitida();
    await servicio.editarFactura(500, { items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4);
    const update = log.find(l => /^UPDATE factura/.test(l.sql));
    assert.equal(/cliente_id = /.test(update.sql), false, 'tocó el cliente sin que se lo pidieran');
  });

  test('mandar el MISMO cliente no cuenta como cambio', async () => {
    const { servicio, log } = montarEmitida();
    await servicio.editarFactura(500, { clienteId: EMITIDA.cliente_id, items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4);
    const update = log.find(l => /^UPDATE factura/.test(l.sql));
    assert.equal(/cliente_id = /.test(update.sql), false);
  });

  test('una con cobros o con nota de crédito no se edita', async () => {
    const conCobro = montarEmitida({ cobrado: 100 });
    await assert.rejects(
      conCobro.servicio.editarFactura(500, { items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4),
      e => e.status === 409 && /cobros aplicados/.test(e.message)
    );

    const conNota = montarEmitida({ acreditado: 500 });
    await assert.rejects(
      conNota.servicio.editarFactura(500, { items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4),
      e => e.status === 409 && /nota de crédito/.test(e.message)
    );
  });

  test('una anulada no se edita', async () => {
    const { servicio } = montarEmitida({ factura: { ...EMITIDA, estado: 'anulada' } });
    await assert.rejects(
      servicio.editarFactura(500, { items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4),
      e => e.status === 409 && /anulada/.test(e.message)
    );
  });

  test('el cambio queda en la bitácora con el antes y el después', async () => {
    const { servicio, log } = montarEmitida();
    await servicio.editarFactura(500, { items: [{ id: '1183', quantity: 1, price: 1000 }], motivo: 'se cobró de más' }, 4);
    const bitacora = JSON.stringify(params(log, /INSERT INTO bitacora_cambio/));
    assert.match(bitacora, /3051/, 'el total anterior');
    assert.match(bitacora, /1130/, 'el nuevo');
    assert.match(bitacora, /se cobró de más/);
  });
});

describe('rastro', () => {
  test('queda en la bitácora, y ya no se copia a la tabla vieja', async () => {
    const { servicio, log } = montar();
    await servicio.crearFactura(VENTA, 4);
    assert.ok(hubo(log, /INSERT INTO bitacora_cambio/));
    assert.equal(params(log, /INSERT INTO bitacora_cambio/).includes('factura'), true);
    // Bodega, Faltantes, Impresión y el portal leen `factura` desde la
    // sección 11: la copia en `facturas` se retiró el 2026-09-30.
    assert.equal(hubo(log, /INSERT INTO facturas \(/), false);
  });
});

/**
 * LO QUE EL CAJERO VIO ES LO QUE SE FACTURA.
 *
 * 2026-10-10, producción, el día del corte. El navegador conservaba el
 * catálogo del sistema anterior, donde `id` era el id de ALEGRA, y la pantalla
 * nueva lo mandó como id propio. Los dos son números del mismo rango: el
 * servidor encontró a OTRO cliente y OTRO producto y facturó, sin un error.
 * Se eligió a un cliente y la factura salió a nombre de PANADERÍA SION; se
 * pidió la referencia 0005 (UNIÓN LISA) y salió JARRA VIDRIO MD LABRADA.
 *
 * La pantalla manda, además del id, lo que mostraba (referencia y nombre del
 * producto; nombre y cédula del cliente). Si nada de eso es lo que el
 * servidor tiene con ese id, no se factura.
 */
describe('lo que el cajero vio es lo que se factura', () => {
  // Lo que el servidor tiene con el id 1084; la pantalla creía que era la unión.
  const JARRA = { ...TORNILLO, id: 1084, alegra_id: '2210', nombre: 'JARRA VIDRIO MD LABRADA', referencia: 'JAR14' };
  const UNION = { ...TORNILLO, id: 1084, alegra_id: '2210', nombre: 'UNION LISA 1/2', referencia: '0005' };
  const pedido = (linea = {}, cabecera = {}) => ({
    clienteId: 7, fecha: '2026-09-12',
    items: [{ productoId: 1084, reference: '0005', name: 'UNION LISA 1/2', quantity: 1, price: 1000, ...linea }],
    ...cabecera
  });

  test('un id que acá es OTRO producto no se factura, y no gasta número', async () => {
    const { servicio, log } = montar({ productos: [JARRA] });
    await assert.rejects(servicio.crearFactura(pedido(), 4), (e) => {
      assert.equal(e.status, 409);
      assert.match(e.message, /0005/, 'no dice qué pidió la pantalla');
      assert.match(e.message, /JARRA VIDRIO MD LABRADA/, 'no dice qué hay acá con ese id');
      assert.match(e.message, /Actualizar catálogo/, 'no dice cómo arreglarlo');
      return true;
    });
    assert.equal(hubo(log, /INSERT INTO factura \(/), false, 'quedó una factura');
    assert.equal(hubo(log, /UPDATE serie_consecutivo/), false, 'se gastó un número');
  });

  test('si es el mismo producto, se factura', async () => {
    const { servicio, log } = montar({ productos: [UNION] });
    await servicio.crearFactura(pedido(), 4);
    assert.ok(hubo(log, /INSERT INTO factura \(/));
  });

  test('la referencia se compara sin espacios ni mayúsculas, y los ceros cuentan', async () => {
    const iguales = montar({ productos: [{ ...UNION, referencia: 'Tor02 ' }] });
    await iguales.servicio.crearFactura(pedido({ reference: ' TOR02', name: '' }), 4);

    // "0005" y "5" son dos productos distintos: no se convierten a número.
    const distintos = montar({ productos: [{ ...JARRA, referencia: '5' }] });
    await assert.rejects(distintos.servicio.crearFactura(pedido({ name: '' }), 4), e => e.status === 409);
  });

  test('con que una seña calce alcanza: cambiarle la referencia en la oficina no rechaza a la tablet', async () => {
    const { servicio, log } = montar({ productos: [{ ...UNION, referencia: '0005-A' }] });
    await servicio.crearFactura(pedido(), 4);
    assert.ok(hubo(log, /INSERT INTO factura \(/), 'el nombre calzaba y aun así se rechazó');
  });

  test('un producto sin referencia se reconoce por el nombre', async () => {
    const mismo = montar({ productos: [{ ...UNION, referencia: null }] });
    await mismo.servicio.crearFactura(pedido({ reference: '' }), 4);

    const otro = montar({ productos: [{ ...JARRA, referencia: null }] });
    await assert.rejects(otro.servicio.crearFactura(pedido({ reference: '' }), 4), e => e.status === 409);
  });

  test('un id que acá es OTRO cliente no se factura', async () => {
    const { servicio, log } = montar({ productos: [UNION] });
    await assert.rejects(
      servicio.crearFactura(pedido({}, { clienteNombre: 'Tarcicio Gerardo Vargas Chavarria', clienteIdentificacion: '203330444' }), 4),
      (e) => {
        assert.equal(e.status, 409);
        assert.match(e.message, /Tarcicio Gerardo Vargas Chavarria/);
        assert.match(e.message, /PULPERÍA LA ESQUINA/, 'no dice a nombre de quién iba a salir');
        return true;
      }
    );
    assert.equal(hubo(log, /INSERT INTO factura \(/), false);
    assert.equal(hubo(log, /UPDATE serie_consecutivo/), false);
  });

  test('el cliente se reconoce por el nombre sin acentos o por la cédula con guiones', async () => {
    const porNombre = montar({ productos: [UNION] });
    await porNombre.servicio.crearFactura(pedido({}, { clienteNombre: '  pulperia   la esquina ' }), 4);

    // Le corrigieron el nombre en la oficina mientras la tablet andaba sin señal.
    const porCedula = montar({ productos: [UNION] });
    await porCedula.servicio.crearFactura(
      pedido({}, { clienteNombre: 'PULPERIA ESQUINA (nombre de antes)', clienteIdentificacion: '3-101-123456' }), 4);
    assert.ok(hubo(porCedula.log, /INSERT INTO factura \(/));
  });

  test('quien no manda señas no se revisa: el portal e Impresión ponen el id en el servidor', async () => {
    const { servicio, log } = montar({ productos: [JARRA] });
    await servicio.crearFactura({ clienteId: 7, fecha: '2026-09-12', items: [{ productoId: 1084, quantity: 1, price: 1000 }] }, 4);
    assert.ok(hubo(log, /INSERT INTO factura \(/));
  });

  test('una cola antigua de tablet (ids de Alegra) sigue entrando: ahí el id sí es el que mostraba', async () => {
    const { servicio, log } = montar();
    await servicio.crearFactura({
      ...VENTA, clienteNombre: 'OTRO NOMBRE',
      items: [{ id: '1183', reference: 'REF-DE-ANTES', name: 'NOMBRE DE ANTES', quantity: 2, price: 1000 }]
    }, 4);
    assert.ok(hubo(log, /INSERT INTO factura \(/));
  });

  test('al editar: lo que ya estaba no se revisa, lo que se agrega sí', async () => {
    // La referencia de una línea ya facturada es la copia de aquel día.
    const ya = montarEmitida({ productos: [JARRA], enLaFactura: [JARRA.id] });
    await ya.servicio.editarFactura(500, { items: [{ productoId: 1084, reference: 'REF-VIEJA', name: 'NOMBRE VIEJO', quantity: 1, price: 1000 }] }, 4);
    assert.ok(hubo(ya.log, /^UPDATE factura/));

    const nueva = montarEmitida({ productos: [JARRA], enLaFactura: [] });
    await assert.rejects(
      nueva.servicio.editarFactura(500, { items: [{ productoId: 1084, reference: '0005', name: 'UNION LISA 1/2', quantity: 1, price: 1000 }] }, 4),
      e => e.status === 409 && /JARRA VIDRIO MD LABRADA/.test(e.message)
    );
    assert.equal(hubo(nueva.log, /DELETE FROM factura_linea/), false, 'borró las líneas antes de darse cuenta');
  });

  test('al corregir el cliente de una factura tampoco se cambia por otro', async () => {
    const clienteNuevo = {
      id: 9, activo: true, nombre: 'FERRETERÍA EL CLAVO', tipo_identificacion: 'CJ', identificacion: '3101999999',
      correo: null, telefono: null, celular: null, provincia: null, canton: null, distrito: null, barrio: null,
      otras_senas: null, plazo_credito_id: null, plazo_dias: 0, plazo_nombre: 'De contado'
    };
    const { servicio, log } = montarEmitida({ clienteNuevo });
    await assert.rejects(
      servicio.editarFactura(500, { clienteId: 9, clienteNombre: 'SODA LA AMISTAD', items: [{ id: '1183', quantity: 1, price: 1000 }] }, 4),
      e => e.status === 409 && /FERRETERÍA EL CLAVO/.test(e.message)
    );
    assert.equal(hubo(log, /^UPDATE factura/), false);
  });
});
