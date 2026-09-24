/**
 * Test de cotizaciones.service.js (base propia, migración 029).
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Una cotización es una promesa de precio. No es documento fiscal —si sale
 * mal se corrige— pero el cliente YA la vio, y eso no se corrige: o se le
 * cobra de más al facturar, o se pierde la diferencia por sostener el precio
 * equivocado. Lo que se fija acá:
 *
 *   1. El precio sale del catálogo del SERVIDOR, sin impuesto, y la tarifa del
 *      maestro — nunca de lo que mande el navegador.
 *   2. Al facturar vale el precio COTIZADO, no el de hoy; y la factura nace en
 *      la MISMA transacción que marca la cotización.
 *   3. Una vencida no se factura sin confirmar; una facturada no se cambia ni
 *      se borra.
 *   4. El número sale de la serie, dentro de la transacción: si la
 *      cotización no se guarda, el número no se gasta.
 *
 * CÓMO SE PRUEBA SIN BASE DE DATOS
 * Se sustituyen `config/database` (pool y conexión con un registro de cada
 * sentencia), la creación de la factura y el envío por WhatsApp por dobles
 * en require.cache ANTES de pedir el servicio. `armarLineas` es el real: es
 * justamente lo que tiene que dar el mismo redondeo que la factura.
 */

const { test, describe, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaFactura = require.resolve('../src/modules/facturacion/facturaPropia.service');
const rutaEnvios = require.resolve('../src/modules/envios-whatsapp/envios.service');
const rutaServicio = require.resolve('../src/modules/cotizaciones/cotizaciones.service');
const CADENA = [rutaDb, rutaFactura, rutaEnvios, rutaServicio,
  require.resolve('../src/modules/clientes/clientes.service')];

const SECRETO_PREVIO = process.env.JWT_SECRET;
before(() => { process.env.JWT_SECRET = 'secreto-de-prueba-cotizaciones'; });
after(() => {
  if (SECRETO_PREVIO === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = SECRETO_PREVIO;
});

/** Fila de `producto` con su tarifa. `precio_sin_iva` como lo guarda el maestro. */
const producto = (id, nombre, precio, tarifa = 13, extra = {}) => ({
  id, alegra_id: String(1000 + id), nombre, referencia: `R${id}`, descripcion: null, cabys: null,
  unidad: 'Unid', activo: true, impuesto_id: tarifa === 13 ? 1 : tarifa === 1 ? 4 : 2,
  precio_sin_iva: String(precio), tarifa: tarifa === null ? null : String(tarifa), ...extra
});

const CATALOGO = [
  producto(1, 'ACEITE 20W-50', 5000, 13),
  producto(2, 'LAPICERO BIC AZUL', 200, 1),
  producto(3, 'ARROZ 1 KG', 1000, 0),
  producto(4, 'DADO DE BAJA', 999, 13, { activo: false })
];

const CLIENTE = { id: 8, nombre: 'AB CHANA', identificacion: '101110111', activo: true };

/** Cabecera como la devuelve SELECT_CABECERA (con el estado ya calculado). */
function cabecera(extra = {}) {
  return {
    id: 55, consecutivo: 12, numero: '12', fecha: '2026-09-20', vence: '2026-10-05',
    cliente_id: 8, cliente_nombre: 'AB CHANA', cliente_identificacion: '101110111', observaciones: null,
    subtotal: '10000.00', descuento: '0.00', impuesto: '1300.00', total: '11300.00',
    factura_id: null, facturada_en: null, factura_numero: null, factura_estado: null,
    alegra_id: null, estado: 'vigente', ...extra
  };
}

/** Línea guardada de una cotización: el precio es el COTIZADO. */
const lineaGuardada = (extra = {}) => ({
  numero_linea: 1, producto_id: 1, nombre: 'ACEITE 20W-50', referencia: 'R1', cantidad: '2.0000',
  precio_unitario: '5000.00000', descuento_porcentaje: '0.000', descuento_monto: '0.00',
  impuesto_id: 1, tarifa: '13.000', impuesto_monto: '1300.00', total: '11300.00', ...extra
});

function montar({
  catalogo = CATALOGO, cliente = CLIENTE, cot = null, lineas = [], previa = null,
  serie = 12, choqueClave = false
} = {}) {
  const log = [];
  const facturas = [];
  const envios = [];

  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();
    log.push({ sql: texto, params });

    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(texto)) return { rows: [] };
    if (/FROM cotizacion c LEFT JOIN factura f/.test(texto)) {
      if (/ORDER BY c\.consecutivo DESC/.test(texto)) return { rows: cot ? [cot] : [] };
      return { rows: cot && Number(params[0]) === cot.id ? [{ ...cot }] : [] };
    }
    if (/FROM cotizacion_linea WHERE cotizacion_id/.test(texto)) return { rows: lineas.map((l) => ({ ...l })) };
    if (/FROM cotizacion WHERE clave_idempotencia/.test(texto)) return { rows: previa ? [previa] : [] };
    if (/FROM cliente WHERE id = \$1/.test(texto)) {
      return { rows: cliente && Number(params[0]) === cliente.id ? [{ ...cliente }] : [] };
    }
    if (/FROM producto p LEFT JOIN impuesto i ON i\.id = p\.impuesto_id WHERE p\.id = ANY/.test(texto)) {
      const pedidos = (params[0] || []).map(Number);
      return { rows: catalogo.filter((p) => pedidos.includes(p.id)) };
    }
    if (/WHERE p\.activo AND NOT p\.oculto/.test(texto)) return { rows: catalogo.filter((p) => p.activo) };
    if (/UPDATE serie_consecutivo/.test(texto)) return { rows: serie ? [{ consecutivo: String(serie) }] : [] };
    if (/INSERT INTO cotizacion \(/.test(texto)) {
      if (choqueClave) {
        throw Object.assign(new Error('duplicate key'), {
          code: '23505', constraint: 'cotizacion_clave_idempotencia_key'
        });
      }
      return { rows: [{ id: 70, numero: params[1], total: String(params[11]) }] };
    }
    if (/UPDATE cotizacion SET vence/.test(texto)) return { rows: [{ numero: cot.numero, total: String(params[8]) }] };
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [], rowCount: 1 };
  };

  const conexion = { query: ejecutar, release: () => {} };
  const pool = { connect: async () => conexion, query: ejecutar };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool, query: (...a) => pool.query(...a) }
  };

  // La creación de la factura es de facturación y tiene sus propias pruebas.
  // Acá importa QUÉ se le pide y sobre QUÉ conexión.
  delete require.cache[rutaFactura];
  const real = require(rutaFactura);
  require.cache[rutaFactura].exports = {
    ...real,
    crearFacturaEnTransaccion: async (cx, datos, usuarioId) => {
      facturas.push({ cx, datos, usuarioId });
      return { id: 901, numero: '001000014900', total: 11300 };
    }
  };

  require.cache[rutaEnvios] = {
    id: rutaEnvios, filename: rutaEnvios, loaded: true,
    exports: { enviarYRegistrar: async (datos) => { envios.push(datos); return { telefono: datos.telefono }; } }
  };

  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), log, facturas, envios, conexion, pool, ejecutar };
}

const fila = (log, patron) => log.find((l) => patron.test(l.sql));
const filas = (log, patron) => log.filter((l) => patron.test(l.sql));
/** Las líneas insertadas, como objetos con el nombre de su columna. */
function lineasInsertadas(log) {
  return filas(log, /INSERT INTO cotizacion_linea/).map((l) => {
    const columnas = l.sql.match(/\(([^)]+)\) VALUES/)[1].split(', ');
    return Object.fromEntries(columnas.map((c, i) => [c, l.params[i]]));
  });
}

beforeEach(() => { for (const r of CADENA) delete require.cache[r]; });

describe('crear cotización', () => {
  test('cada línea lleva la tarifa de SU producto, y el exento va en 0', async () => {
    const { servicio, log } = montar();
    await servicio.crear({
      clienteId: 8,
      lineas: [{ productoId: 1, cantidad: 2 }, { productoId: 2, cantidad: 10 }, { productoId: 3, cantidad: 1 }]
    }, 4);

    const [aceite, lapicero, arroz] = lineasInsertadas(log);
    assert.equal(aceite.tarifa, 13);
    assert.equal(aceite.impuesto_monto, 1300);
    assert.equal(lapicero.tarifa, 1, 'el lapicero es al 1 %: al 13 % sería cobrarle de más al cliente');
    assert.equal(lapicero.impuesto_monto, 20);
    assert.equal(arroz.tarifa, 0);
    assert.equal(arroz.impuesto_monto, 0);

    const cab = fila(log, /INSERT INTO cotizacion \(/).params;
    // subtotal, descuento, impuesto, total
    assert.deepEqual(cab.slice(8, 12), [13000, 0, 1320, 14320]);
  });

  test('el precio sale del catálogo del servidor, no del que mande el navegador', async () => {
    const { servicio, log } = montar();
    await servicio.crear({ clienteId: 8, lineas: [{ productoId: 1, cantidad: 1, precio: 1 }] }, 4);
    assert.equal(lineasInsertadas(log)[0].precio_unitario, 5000, 'con ₡1 cualquiera podría cotizar regalado');
  });

  test('un producto inactivo o que ya no existe queda fuera, avisando cuál', async () => {
    const { servicio, log } = montar();
    const r = await servicio.crear({
      clienteId: 8, lineas: [{ productoId: 1, cantidad: 1 }, { productoId: 4, cantidad: 1 }, { productoId: 99, cantidad: 1 }]
    }, 4);
    assert.equal(lineasInsertadas(log).length, 1);
    assert.deepEqual(r.noDisponibles.map((x) => x.productoId), [4, 99]);
    assert.equal(r.noDisponibles[0].nombre, 'DADO DE BAJA');
  });

  test('si no queda ninguna línea válida no se gasta número ni se guarda nada', async () => {
    const { servicio, log } = montar();
    await assert.rejects(
      () => servicio.crear({ clienteId: 8, lineas: [{ productoId: 4, cantidad: 1 }] }, 4),
      (e) => e.status === 400 && /Ninguno/.test(e.message)
    );
    assert.ok(!fila(log, /INSERT INTO cotizacion/));
    assert.ok(fila(log, /ROLLBACK/), 'la transacción se deshace: el número no se gasta');
  });

  test('cantidad cero no cotiza una línea vacía', async () => {
    const { servicio } = montar();
    await assert.rejects(
      () => servicio.crear({ clienteId: 8, lineas: [{ productoId: 1, cantidad: 0 }] }, 4),
      (e) => e.status === 400 && /mayor que cero/.test(e.message)
    );
  });

  test('el número sale de la serie DENTRO de la transacción', async () => {
    const { servicio, log } = montar({ serie: 12 });
    const r = await servicio.crear({ clienteId: 8, lineas: [{ productoId: 1, cantidad: 1 }] }, 4);
    assert.equal(r.numero, '12');
    const i = log.findIndex((l) => /UPDATE serie_consecutivo/.test(l.sql));
    assert.ok(i > log.findIndex((l) => l.sql === 'BEGIN') && i < log.findIndex((l) => l.sql === 'COMMIT'));
  });

  test('la fecha de vencimiento respeta los días de validez pedidos', async () => {
    const { servicio, log } = montar();
    await servicio.crear({ clienteId: 8, lineas: [{ productoId: 1, cantidad: 1 }], validezDias: 30 }, 4);
    const [, , fecha, vence] = fila(log, /INSERT INTO cotizacion \(/).params;
    const dias = (new Date(`${vence}T00:00:00Z`) - new Date(`${fecha}T00:00:00Z`)) / 86400000;
    assert.equal(dias, 30);
  });

  test('la misma clave devuelve la cotización que ya existe, sin gastar otro número', async () => {
    const { servicio, log } = montar({ previa: { id: 70, numero: '12', total: '5650.00' } });
    const r = await servicio.crear({
      clienteId: 8, lineas: [{ productoId: 1, cantidad: 1 }], claveIdempotencia: 'cot-abc'
    }, 4);
    assert.equal(r.yaExistia, true);
    assert.equal(r.numero, '12');
    assert.ok(!fila(log, /UPDATE serie_consecutivo/));
  });

  test('dos envíos simultáneos con la misma clave: el que choca devuelve el que ganó', async () => {
    // Los dos pasan la consulta previa; el segundo choca con la UNIQUE.
    const entorno = montar({ choqueClave: true });
    let consultas = 0;
    entorno.pool.query = async (sql, params) => {
      if (/clave_idempotencia/.test(sql)) {
        consultas++;
        return { rows: consultas === 1 ? [] : [{ id: 70, numero: '12', total: '5650.00' }] };
      }
      return entorno.ejecutar(sql, params);
    };
    const r = await entorno.servicio.crear({
      clienteId: 8, lineas: [{ productoId: 1, cantidad: 1 }], claveIdempotencia: 'cot-abc'
    }, 4);
    assert.equal(r.yaExistia, true);
    assert.equal(r.id, 70);
  });

  test('sin cliente o sin líneas no se abre ninguna transacción', async () => {
    const { servicio, log } = montar();
    await assert.rejects(() => servicio.crear({ lineas: [{ productoId: 1, cantidad: 1 }] }, 4), (e) => e.status === 400);
    await assert.rejects(() => servicio.crear({ clienteId: 8, lineas: [] }, 4), (e) => e.status === 400);
    assert.equal(log.length, 0);
  });

  test('a un cliente inactivo no se le cotiza', async () => {
    const { servicio } = montar({ cliente: { ...CLIENTE, activo: false } });
    await assert.rejects(
      () => servicio.crear({ clienteId: 8, lineas: [{ productoId: 1, cantidad: 1 }] }, 4),
      (e) => e.status === 400 && /inactivo/.test(e.message)
    );
  });

  test('queda en la bitácora con quién la hizo', async () => {
    const { servicio, log } = montar();
    await servicio.crear({ clienteId: 8, lineas: [{ productoId: 1, cantidad: 1 }] }, 4);
    const b = fila(log, /INSERT INTO bitacora_cambio/);
    assert.ok(b.params.includes('cotizacion'));
    assert.ok(b.params.includes('crear'));
  });
});

describe('listar y ver', () => {
  test('el estado lo calcula la base con el día de Costa Rica, no la hora del servidor', async () => {
    const { servicio, log } = montar({ cot: cabecera() });
    await servicio.listar();
    const sql = log[0].sql;
    assert.match(sql, /America\/Costa_Rica/);
    assert.match(sql, /f\.estado <> 'anulada'/, 'una factura anulada tiene que devolver la cotización a vigente');
  });

  test('una con la factura anulada queda vigente y dice cuál factura se anuló', async () => {
    const { servicio } = montar({
      cot: cabecera({ factura_id: 900, factura_numero: '0010000149', factura_estado: 'anulada' })
    });
    const [c] = await servicio.listar();
    assert.equal(c.facturada, false);
    assert.deepEqual(c.factura, { id: 900, numero: '0010000149', anulada: true });
  });

  test('el detalle muestra el precio NETO por unidad: cantidad × precio da el total guardado', async () => {
    const { servicio } = montar({
      cot: cabecera(),
      lineas: [lineaGuardada({ descuento_porcentaje: '10.000', precio_unitario: '5000.00000' })]
    });
    const d = await servicio.detalle(55);
    assert.equal(d.lineas[0].precio, 4500);
    assert.equal(d.lineas[0].precioLista, 5000);
  });

  test('el enlace público se arma con el id propio', async () => {
    const { servicio } = montar({ cot: cabecera() });
    const d = await servicio.detalle(55);
    assert.match(d.enlacePublico, /\/cotizacion\/55-/);
  });

  test('una que no existe es 404', async () => {
    const { servicio } = montar();
    await assert.rejects(() => servicio.detalle(1), (e) => e.status === 404);
  });
});

describe('facturar', () => {
  const vigente = () => montar({ cot: cabecera(), lineas: [lineaGuardada()] });

  test('factura con el precio COTIZADO, aunque el catálogo ya haya subido', async () => {
    const entorno = montar({
      cot: cabecera(), lineas: [lineaGuardada()],
      catalogo: [producto(1, 'ACEITE 20W-50', 9999, 13)]
    });
    await entorno.servicio.facturar(55, {}, 4);
    const [pedido] = entorno.facturas;
    assert.equal(pedido.datos.items[0].precio, 5000);
    assert.equal(pedido.datos.items[0].productoId, 1);
    assert.equal(pedido.datos.clienteId, 8);
    assert.equal(pedido.datos.observaciones, 'Cotización 12');
  });

  test('la factura nace en la MISMA transacción que marca la cotización', async () => {
    const { servicio, facturas, conexion, log } = vigente();
    const r = await servicio.facturar(55, {}, 4);
    assert.equal(facturas[0].cx, conexion, 'la factura se creó en otra conexión: un corte en el medio la deja huérfana');
    const marca = fila(log, /UPDATE cotizacion SET factura_id/);
    assert.deepEqual(marca.params, [901, 55]);
    assert.ok(log.findIndex((l) => l.sql === 'COMMIT') > log.indexOf(marca));
    assert.equal(r.numeroFactura, '001000014900');
  });

  test('la cotización se toma CON BLOQUEO: un doble clic espera al primero', async () => {
    const { servicio, log } = vigente();
    await servicio.facturar(55, {}, 4);
    assert.match(fila(log, /FROM cotizacion c LEFT JOIN factura f/).sql, /FOR UPDATE OF c/);
  });

  test('una ya facturada devuelve su factura en vez de crear otra', async () => {
    const { servicio, facturas } = montar({
      cot: cabecera({ estado: 'facturada', factura_id: 901, factura_numero: '001000014900', factura_estado: 'emitida' }),
      lineas: [lineaGuardada()]
    });
    const r = await servicio.facturar(55, {}, 4);
    assert.equal(r.yaExistia, true);
    assert.equal(r.numeroFactura, '001000014900');
    assert.equal(facturas.length, 0);
  });

  test('una facturada en Alegra, sin factura copiada, no se vuelve a facturar', async () => {
    const { servicio } = montar({ cot: cabecera({ estado: 'facturada', facturada_en: new Date() }) });
    await assert.rejects(() => servicio.facturar(55, {}, 4), (e) => e.status === 409 && /Alegra/.test(e.message));
  });

  test('una cotización VENCIDA no se factura sin confirmar', async () => {
    const { servicio, facturas } = montar({ cot: cabecera({ estado: 'vencida', vence: '2026-09-01' }), lineas: [lineaGuardada()] });
    await assert.rejects(() => servicio.facturar(55, {}, 4), (e) => e.status === 409 && /venció/.test(e.message));
    assert.equal(facturas.length, 0);
  });

  test('confirmando, la vencida sí se factura y con su precio de entonces', async () => {
    const { servicio, facturas } = montar({ cot: cabecera({ estado: 'vencida' }), lineas: [lineaGuardada()] });
    await servicio.facturar(55, { aunqueVencida: true }, 4);
    assert.equal(facturas[0].datos.items[0].precio, 5000);
  });

  test('una línea sin producto propio no llega a la factura: se pide editar', async () => {
    const { servicio, facturas } = montar({ cot: cabecera(), lineas: [lineaGuardada({ producto_id: null, nombre: 'VIEJO' })] });
    await assert.rejects(() => servicio.facturar(55, {}, 4), (e) => e.status === 409 && /VIEJO/.test(e.message));
    assert.equal(facturas.length, 0);
  });

  test('una cotización sin líneas no genera una factura vacía', async () => {
    const { servicio, facturas } = montar({ cot: cabecera(), lineas: [] });
    await assert.rejects(() => servicio.facturar(55, {}, 4), (e) => e.status === 400);
    assert.equal(facturas.length, 0);
  });
});

describe('editar', () => {
  test('las líneas se reemplazan enteras y con los precios de hoy', async () => {
    const { servicio, log } = montar({
      cot: cabecera(), catalogo: [producto(1, 'ACEITE 20W-50', 6000, 13)]
    });
    await servicio.editar(55, { lineas: [{ productoId: 1, cantidad: 1 }] }, 4);
    assert.ok(fila(log, /DELETE FROM cotizacion_linea/));
    assert.equal(lineasInsertadas(log)[0].precio_unitario, 6000);
  });

  test('la fecha de emisión no se mueve; el vencimiento sí se puede correr', async () => {
    const { servicio, log } = montar({ cot: cabecera() });
    await servicio.editar(55, { lineas: [{ productoId: 1, cantidad: 1 }], vence: '2026-10-30' }, 4);
    const u = fila(log, /UPDATE cotizacion SET vence/);
    assert.doesNotMatch(u.sql, /fecha =/);
    assert.equal(u.params[0], '2026-10-30');
  });

  test('no puede vencer antes de emitirse', async () => {
    const { servicio } = montar({ cot: cabecera() });
    await assert.rejects(
      () => servicio.editar(55, { lineas: [{ productoId: 1, cantidad: 1 }], vence: '2026-09-01' }, 4),
      (e) => e.status === 400 && /antes de su fecha/.test(e.message)
    );
  });

  test('sin fecha nueva ni cliente se conservan los que tenía', async () => {
    const { servicio, log } = montar({ cot: cabecera() });
    await servicio.editar(55, { lineas: [{ productoId: 1, cantidad: 1 }] }, 4);
    const u = fila(log, /UPDATE cotizacion SET vence/).params;
    assert.equal(u[0], '2026-10-05');
    assert.equal(u[1], 8);
  });

  test('la nota se puede borrar mandándola vacía', async () => {
    const { servicio, log } = montar({ cot: cabecera({ observaciones: 'Entrega el lunes' }) });
    await servicio.editar(55, { lineas: [{ productoId: 1, cantidad: 1 }], observaciones: null }, 4);
    assert.equal(fila(log, /UPDATE cotizacion SET vence/).params[4], null);
  });

  test('una cotización ya facturada no se puede cambiar', async () => {
    const { servicio } = montar({ cot: cabecera({ estado: 'facturada', factura_id: 901 }) });
    await assert.rejects(
      () => servicio.editar(55, { lineas: [{ productoId: 1, cantidad: 1 }] }, 4),
      (e) => e.status === 409 && /ya se facturó/.test(e.message)
    );
  });

  test('no se puede dejar sin productos', async () => {
    const { servicio } = montar({ cot: cabecera() });
    await assert.rejects(() => servicio.editar(55, { lineas: [] }, 4), (e) => e.status === 400);
  });

  test('devuelve el total NUEVO', async () => {
    const { servicio } = montar({ cot: cabecera() });
    const r = await servicio.editar(55, { lineas: [{ productoId: 1, cantidad: 3 }] }, 4);
    assert.equal(r.total, 16950);
  });
});

describe('eliminar', () => {
  test('una cotización sin facturar se borra y queda en la bitácora', async () => {
    const { servicio, log } = montar({ cot: cabecera() });
    const r = await servicio.eliminar(55, 4);
    assert.equal(r.borrada, true);
    assert.ok(fila(log, /DELETE FROM cotizacion WHERE id/));
    assert.ok(fila(log, /INSERT INTO bitacora_cambio/).params.includes('borrar'));
  });

  test('una YA FACTURADA no se borra, aunque su factura se haya anulado', async () => {
    for (const estado of ['facturada', 'vigente']) {
      const { servicio, log } = montar({
        cot: cabecera({ estado, factura_id: 901, factura_numero: '001000014900' })
      });
      await assert.rejects(
        () => servicio.eliminar(55, 4),
        (e) => e.status === 409 && /001000014900/.test(e.message) && /referencia/.test(e.message)
      );
      assert.ok(!fila(log, /DELETE FROM cotizacion WHERE/));
    }
  });
});

describe('WhatsApp y enlace público', () => {
  test('se manda con el id PROPIO del cliente y el número validado', async () => {
    const { servicio, envios } = montar({ cot: cabecera(), lineas: [lineaGuardada()] });
    await servicio.enviarPorWhatsApp(55, { telefono: '8888 7777', mensaje: 'Hola', usuarioId: 4 });
    assert.equal(envios[0].clienteId, 8);
    assert.equal(envios[0].alegraContactId, undefined, 'mezclar ids propone el teléfono de otra persona');
    assert.equal(envios[0].telefono, '50688887777');
    assert.ok(Buffer.isBuffer(envios[0].pdf));
  });

  test('un número mal escrito no sale', async () => {
    const { servicio, envios } = montar({ cot: cabecera(), lineas: [lineaGuardada()] });
    await assert.rejects(
      () => servicio.enviarPorWhatsApp(55, { telefono: '8888 777', mensaje: 'Hola' }),
      (e) => e.status === 400
    );
    assert.equal(envios.length, 0);
  });

  test('un enlace viejo de Alegra se busca por alegra_id, nunca por id', async () => {
    const entorno = montar({ cot: cabecera({ id: 1, alegra_id: '11' }), lineas: [lineaGuardada()] });
    // El token que salió por WhatsApp antes de la migración: firmado como
    // "cotizacion:11".
    const crypto = require('crypto');
    const firma = crypto.createHmac('sha256', process.env.JWT_SECRET).update('cotizacion:11')
      .digest('base64url').slice(0, 22);
    entorno.pool.query = async (sql, params) =>
      (/WHERE alegra_id = \$1/.test(sql) ? { rows: [{ id: 1 }] } : entorno.ejecutar(sql, params));

    const r = await entorno.servicio.publicaPorToken(`11-${firma}`);
    assert.equal(r.numero, '12');
    assert.ok(!entorno.log.some((l) => /WHERE c\.id = \$1/.test(l.sql) && Number(l.params[0]) === 11),
      'buscó el id de Alegra como id propio: abriría la cotización de otro cliente');
  });

  test('la página pública no lleva ids internos', async () => {
    const { servicio } = montar({ cot: cabecera(), lineas: [lineaGuardada()] });
    const { tokenDe } = require('../src/modules/cotizaciones/enlacePublico');
    const r = await servicio.publicaPorToken(tokenDe(55));
    assert.equal(r.lineas[0].precioConIva, 5650);
    assert.equal(r.lineas[0].importe, 10000);
    assert.doesNotMatch(JSON.stringify(r), /clienteId|productoId|"id"/);
  });
});

describe('pdf', () => {
  test('devuelve un PDF armado acá', async () => {
    const { servicio } = montar({ cot: cabecera(), lineas: [lineaGuardada()] });
    const r = await servicio.pdf(55);
    assert.ok(Buffer.isBuffer(r.archivo), 'debe devolver el archivo, no una URL');
    assert.equal(r.archivo.subarray(0, 5).toString(), '%PDF-');
    assert.equal(r.numero, '12');
  });

  test('el PDF sobrevive a los casos raros de una cotización', async () => {
    const { generarPdfCotizacion } = require('../src/modules/cotizaciones/cotizacion.pdf');

    const casos = {
      'sin nota ni referencia': {
        numero: '1', fecha: '2026-09-04', vence: '2026-09-19', clienteNombre: 'X',
        lineas: [{ nombre: 'UNO', referencia: null, cantidad: 1, precio: 100, taxPercentage: 0 }]
      },
      'con muchas líneas (cambia de página)': {
        numero: '2', fecha: '2026-09-04', vence: '2026-09-19', clienteNombre: 'X',
        lineas: Array.from({ length: 40 }, (_, i) => ({
          nombre: `PRODUCTO CON UN NOMBRE MUY LARGO NUMERO ${i}`, referencia: `R${i}`,
          cantidad: i + 1, precio: 1234.56, taxPercentage: 13
        }))
      },
      'sin cliente': {
        numero: '3', fecha: '2026-09-04', vence: '2026-09-19', clienteNombre: null,
        lineas: [{ nombre: 'UNO', cantidad: 1, precio: 100, taxPercentage: 13 }]
      }
    };

    for (const [nombre, cot] of Object.entries(casos)) {
      const pdf = await generarPdfCotizacion(cot);
      assert.ok(pdf.length > 1000, `el PDF de "${nombre}" salió vacío`);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', nombre);
    }
  });

  test('el símbolo del colón se escribe con una fuente que lo tiene', () => {
    // La Helvetica que trae pdfkit NO tiene ₡ (U+20A1): imprime "¡". El
    // primer PDF salió con todos los montos como "¡29.296".
    const fs = require('fs');
    const { FUENTES, colones } = require('../src/utils/marcaPdf');
    assert.ok(fs.existsSync(FUENTES.normal), 'falta DejaVuSans.ttf en assets/fuentes');
    assert.ok(fs.existsSync(FUENTES.negrita), 'falta DejaVuSans-Bold.ttf en assets/fuentes');
    assert.equal(colones(1234567), '₡1.234.567');
  });
});

describe('catálogo y clientes para el modal', () => {
  test('el catálogo viene con el precio CON impuesto de cada tarifa, sin los dados de baja', async () => {
    const { servicio } = montar();
    const c = await servicio.catalogoParaCotizar();
    const porId = Object.fromEntries(c.map((p) => [p.id, p.precio]));
    assert.equal(porId['1'], 5650);
    assert.equal(porId['2'], 202);
    assert.equal(porId['3'], 1000);
    assert.equal(porId['4'], undefined);
  });

  test('buscar clientes con una sola letra no consulta nada', async () => {
    const { servicio, log } = montar();
    assert.deepEqual(await servicio.buscarClientes('a'), []);
    assert.equal(log.length, 0);
  });
});
