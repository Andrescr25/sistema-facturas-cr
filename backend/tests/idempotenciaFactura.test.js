/**
 * Reenviar una factura no puede crear una segunda.
 *
 * EL PROBLEMA
 * Crear una factura es un POST. Si la respuesta no llega —timeout, WiFi
 * cortado, el servidor reiniciando— quien la mandó NO SABE si se creó. La
 * única salida es reenviarla, y si sí se había creado quedan dos documentos:
 * dos números de la serie, dos veces la misma venta en Cuentas por Cobrar.
 *
 * Con las tablets facturando sin señal y mandando después, esa incertidumbre
 * es lo normal y no la excepción.
 *
 * QUÉ SE PRUEBA ACÁ
 * La factura PROPIA (`facturaPropia.service.crearFactura`) con su clave. Estas
 * pruebas nacieron contra la facturación que creaba en Alegra, retirada el
 * 2026-10-04; la protección es la misma tabla (`factura_intento`) y el mismo
 * módulo (`idempotencia.js`), y lo que cambió es un desenlace:
 *
 *   fallida    La factura no se guardó. Como se guarda en una transacción
 *              NUESTRA, si falló no quedó nada: reintentar es seguro.
 *   incierta   No hubo respuesta de quien la creaba (antes, Alegra). El
 *              camino propio ya no la produce, pero la tabla puede tener
 *              intentos viejos en ese estado y el módulo los sigue frenando:
 *              reenviar a ciegas es justo lo que duplica.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
beforeEach(() => require('./dobles/inventario').instalar());

const rutaDb = require.resolve('../config/database');
const rutaIdem = require.resolve('../src/modules/facturacion/idempotencia');
const rutaServicio = require.resolve('../src/modules/facturacion/facturaPropia.service');

const CLIENTE = {
  id: 7, nombre: 'PULPERÍA LA ESQUINA', tipo_identificacion: 'CJ', identificacion: '3101123456',
  correo: null, activo: true, plazo_credito_id: 1, plazo_nombre: 'De contado', plazo_dias: 0,
  telefono: null, celular: null, provincia: null, canton: null, distrito: null, barrio: null, otras_senas: null
};
const producto = (id, activo = true) => ({
  id, alegra_id: null, nombre: `PRODUCTO ${id}`, referencia: `REF${id}`, descripcion: null,
  cabys: '4294401030100', unidad: 'Unid', activo, impuesto_id: 1, tarifa: '13.00'
});

// En el contrato propio: `clienteId` y `productoId` son NUESTROS ids.
const FACTURA = {
  clienteId: 7,
  date: '2026-09-01',
  items: [{ id: 12, productoId: 12, quantity: 2, price: 1000 }]
};

/**
 * La base en memoria: la tabla `factura_intento` de verdad (como mapa) y lo
 * justo para que una factura se guarde. `intentos` y `emitidas` sobreviven a
 * recargar el servicio, que es lo que pasa cuando el servidor se reinicia.
 */
function montar({ fallaElGuardado = false, productos = [producto(12), producto(999)], intentos = new Map() } = {}) {
  const estado = { emitidas: 0 };

  const ejecutar = async (sql, params = []) => {
    const texto = String(sql).replace(/\s+/g, ' ').trim();

    if (/INSERT INTO factura_intento/i.test(texto)) {
      const [clave, huella] = params;
      if (intentos.has(clave)) return { rows: [] };          // ON CONFLICT DO NOTHING
      intentos.set(clave, { clave, estado: 'en_proceso', huella, intentos: 1 });
      return { rows: [{ clave }] };
    }
    if (/SELECT \* FROM factura_intento/i.test(texto)) {
      const f = intentos.get(params[0]);
      return { rows: f ? [{ ...f }] : [] };
    }
    if (/UPDATE factura_intento/i.test(texto)) {
      const f = intentos.get(params[0]);
      if (!f) return { rows: [] };
      if (/SET estado = 'creada'/.test(texto)) {
        // La factura propia va en `factura_id`; `alegra_invoice_id` no se toca.
        assert.match(texto, /factura_id = \$2/);
        assert.equal(/alegra_invoice_id/.test(texto), false, 'el id propio volvió a escribirse en la columna de Alegra');
        Object.assign(f, { estado: 'creada', factura_id: params[1], numero_factura: params[2] });
      } else if (/SET estado = \$2/.test(texto)) {
        Object.assign(f, { estado: params[1], detalle: params[2] });
      } else if (/SET estado = 'en_proceso'/.test(texto)) {
        Object.assign(f, { estado: 'en_proceso', intentos: f.intentos + 1, huella: params[1] });
      }
      return { rows: [f] };
    }

    if (/FROM cliente c/.test(texto)) return { rows: [{ ...CLIENTE }] };
    if (/FROM producto p/.test(texto)) {
      const pedidos = (params[0] || []).map(Number);
      return { rows: productos.filter(p => pedidos.includes(p.id)).map(p => ({ ...p })) };
    }
    if (/FROM serie_consecutivo/.test(texto)) {
      return { rows: [{ id: 1, serie: '00100001', siguiente: String(4869 + estado.emitidas), ancho_consecutivo: 0, electronica: false, activo: true }] };
    }
    if (/INSERT INTO factura \(/.test(texto)) {
      if (fallaElGuardado) throw new Error('la base se cayó');
      estado.emitidas++;
      const columnas = texto.match(/\(([^)]+)\) VALUES/)[1].split(', ');
      return { rows: [{ id: 500 + estado.emitidas, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])) }] };
    }
    if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
    return { rows: [], rowCount: 1 };
  };

  for (const r of [rutaDb, rutaIdem, rutaServicio]) delete require.cache[r];
  const conexion = { query: ejecutar, release: () => {} };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { connect: async () => conexion, query: ejecutar }, query: ejecutar }
  };

  return { servicio: require(rutaServicio), idem: require(rutaIdem), intentos, estado };
}

beforeEach(() => { for (const r of [rutaDb, rutaIdem, rutaServicio]) delete require.cache[r]; });

describe('idempotencia al crear facturas propias', () => {
  test('mandar la MISMA clave dos veces crea UNA sola factura', async () => {
    const { servicio, estado } = montar();

    const primera = await servicio.crearFactura(FACTURA, 1, { clave: 'pedido-77' });
    const segunda = await servicio.crearFactura(FACTURA, 1, { clave: 'pedido-77' });

    assert.equal(estado.emitidas, 1, 'se guardó dos veces: eso es una factura duplicada');
    assert.equal(segunda.yaExistia, true, 'el reenvío debe avisar que ya existía');

    // Se comparan como texto a propósito: el primer envío devuelve el id como
    // número, y el reenvío lo devuelve desde la columna varchar donde quedó
    // guardado. Es la misma factura.
    assert.equal(String(segunda.id), String(primera.id), 'debe devolver la MISMA factura');
    assert.equal(segunda.numero, primera.numero, 'y con el mismo número de la serie');
  });

  test('el reenvío que llega después de reiniciar el servidor tampoco duplica', async () => {
    // La clave vive en la base, no en memoria del proceso.
    const antes = montar();
    const primera = await antes.servicio.crearFactura(FACTURA, 1, { clave: 'pedido-78' });

    const despues = montar({ intentos: antes.intentos });
    const segunda = await despues.servicio.crearFactura(FACTURA, 1, { clave: 'pedido-78' });

    assert.equal(despues.estado.emitidas, 0);
    assert.equal(String(segunda.id), String(primera.id));
  });

  test('claves distintas sí crean facturas distintas', async () => {
    // Dos ventas iguales al mismo cliente el mismo día son legítimas.
    const { servicio, estado } = montar();
    await servicio.crearFactura(FACTURA, 1, { clave: 'pedido-1' });
    await servicio.crearFactura(FACTURA, 1, { clave: 'pedido-2' });
    assert.equal(estado.emitidas, 2);
  });

  test('si el guardado FALLA, queda fallida y se puede reintentar', async () => {
    // La transacción es nuestra: si falló, consta que no quedó nada.
    const roto = montar({ fallaElGuardado: true });
    await assert.rejects(() => roto.servicio.crearFactura(FACTURA, 1, { clave: 'pedido-9' }), /la base se cayó/);
    assert.equal(roto.intentos.get('pedido-9').estado, 'fallida',
      'un fallo nuestro no es "incierto": marcarlo así trabaría una factura que nunca existió');

    const sano = montar({ intentos: roto.intentos });
    await sano.servicio.crearFactura(FACTURA, 1, { clave: 'pedido-9' });   // el reintento pasa
    assert.equal(sano.estado.emitidas, 1);
    assert.equal(sano.intentos.get('pedido-9').estado, 'creada');
  });

  test('un producto inactivo rechaza la factura y deja la clave libre para mandarla corregida', async () => {
    // La tablet que bajó el catálogo ANTES de que el producto se desactivara
    // lo sigue ofreciendo: el servidor lo rechaza igual.
    const { servicio, intentos, estado } = montar({ productos: [producto(12, false)] });
    await assert.rejects(
      () => servicio.crearFactura(FACTURA, 1, { clave: 'pedido-10' }),
      (e) => e.status === 400 && /PRODUCTO 12 está inactivo/.test(e.message)
    );
    assert.equal(estado.emitidas, 0);
    assert.equal(intentos.get('pedido-10').estado, 'fallida');
  });

  test('una factura que ni siquiera está completa no gasta la clave', async () => {
    // Se revisa ANTES de reservar: una clave reservada para algo que no se
    // puede crear quedaría "en proceso" para siempre.
    const { servicio, intentos } = montar();
    await assert.rejects(
      () => servicio.crearFactura({ ...FACTURA, items: [] }, 1, { clave: 'pedido-11' }),
      (e) => e.status === 400 && /no tiene líneas/.test(e.message)
    );
    assert.equal(intentos.has('pedido-11'), false);
  });

  test('un intento INCIERTO que quedó de antes no se reenvía a ciegas', async () => {
    const { servicio, idem, intentos, estado } = montar();
    intentos.set('pedido-8', { clave: 'pedido-8', estado: 'incierta', huella: idem.huellaDe(FACTURA), intentos: 1 });

    await assert.rejects(
      () => servicio.crearFactura(FACTURA, 1, { clave: 'pedido-8' }),
      (e) => e.status === 409 && e.requiereReconciliacion === true
    );
    assert.equal(estado.emitidas, 0);
    assert.equal(intentos.get('pedido-8').estado, 'incierta');
  });

  test('sin respuesta de quien crea la factura, el módulo marca INCIERTA — no fallida', async () => {
    const { idem, intentos } = montar();
    await idem.reservar('pedido-6', FACTURA);

    assert.equal(await idem.marcarFallo('pedido-6', { huboRespuesta: false, detalle: 'timeout' }), 'incierta');
    assert.equal(intentos.get('pedido-6').estado, 'incierta');
  });

  test('dos envíos a la vez: el segundo espera, no crea otra', async () => {
    // El reintento automático y el manual llegando juntos.
    const { servicio, idem, estado } = montar();
    await idem.reservar('pedido-4', FACTURA);      // el primero todavía va en camino

    await assert.rejects(
      () => servicio.crearFactura(FACTURA, 1, { clave: 'pedido-4' }),
      (e) => e.status === 409 && /se está enviando/.test(e.message)
    );
    assert.equal(estado.emitidas, 0);
  });

  test('la misma clave con los mismos productos para OTRO cliente se rechaza', async () => {
    // La fórmula anterior leía `client`, que en el contrato propio viene
    // vacío: esto pasaba por reenvío y devolvía la factura del primer cliente.
    const { servicio, estado } = montar();
    const primera = await servicio.crearFactura(FACTURA, 1, { clave: 'pedido-3' });

    await assert.rejects(
      () => servicio.crearFactura({ ...FACTURA, clienteId: 8 }, 1, { clave: 'pedido-3' }),
      (e) => e.status === 409 && /otro documento distinto/.test(e.message)
    );
    assert.equal(estado.emitidas, 1);
    assert.ok(primera.id);
  });

  test('la clave de una cotización de antes del corte no pasa por factura ya creada', async () => {
    // En producción las cotizaciones usan esta misma tabla, sin huella y con
    // el id de la cotización de Alegra. Devolver eso como "la factura ya
    // existía" sería entregar otro documento.
    const { servicio, intentos, estado } = montar();
    intentos.set('cot-123', { clave: 'cot-123', estado: 'creada', huella: null, alegra_invoice_id: '7', numero_factura: '7', intentos: 1 });

    await assert.rejects(
      () => servicio.crearFactura(FACTURA, 1, { clave: 'cot-123' }),
      (e) => e.status === 409 && /otro documento distinto/.test(e.message)
    );
    assert.equal(estado.emitidas, 0);
  });

  test('un intento registrado con la huella anterior sigue siendo reconocido', async () => {
    // Quedó guardado antes de este cambio, con la fórmula que no miraba al
    // cliente. Su reenvío legítimo no puede rechazarse como "otro documento".
    const { servicio, idem, intentos, estado } = montar();
    intentos.set('pedido-2', {
      clave: 'pedido-2', estado: 'creada', huella: idem.huellaAnteriorDe(FACTURA),
      factura_id: 501, numero_factura: '001000014869', intentos: 1
    });

    const r = await servicio.crearFactura(FACTURA, 1, { clave: 'pedido-2' });
    assert.equal(r.yaExistia, true);
    assert.equal(r.id, 501);
    assert.equal(estado.emitidas, 0);
  });

  test('reusar una clave con OTRA factura adentro se rechaza', async () => {
    // Sería un error de programación, y devolver la factura equivocada es peor
    // que fallar.
    const { servicio, estado } = montar();
    await servicio.crearFactura(FACTURA, 1, { clave: 'pedido-5' });

    const otra = { ...FACTURA, items: [{ id: 999, productoId: 999, quantity: 1, price: 50 }] };
    await assert.rejects(
      () => servicio.crearFactura(otra, 1, { clave: 'pedido-5' }),
      (e) => e.status === 409 && /otro documento distinto/.test(e.message)
    );
    assert.equal(estado.emitidas, 1);
  });

  test('sin clave no hay protección, y no se rompe a quien no la manda', async () => {
    const { servicio, intentos, estado } = montar();
    await servicio.crearFactura(FACTURA, 1);
    await servicio.crearFactura(FACTURA, 1);
    assert.equal(estado.emitidas, 2);
    assert.equal(intentos.size, 0);
  });

  test('la huella distingue contenidos y no cambia con el orden de los items', () => {
    const { huellaDe } = require('../src/modules/facturacion/idempotencia');
    for (const cliente of [{ client: 1 }, { clienteId: 1 }]) {
      const a = { ...cliente, date: 'x', items: [{ id: 1, quantity: 1, price: 10 }, { id: 2, quantity: 2, price: 20 }] };
      const b = { ...cliente, date: 'x', items: [{ id: 2, quantity: 2, price: 20 }, { id: 1, quantity: 1, price: 10 }] };
      const c = { ...cliente, date: 'x', items: [{ id: 1, quantity: 9, price: 10 }] };
      assert.equal(huellaDe(a), huellaDe(b), 'el orden de los items no cambia la factura');
      assert.notEqual(huellaDe(a), huellaDe(c), 'otra cantidad es otra factura');
    }
  });

  test('otra semana cambia la huella sin modificar las colas que no tienen ciclo', () => {
    const { huellaDe, huellaAnteriorDe } = require('../src/modules/facturacion/idempotencia');
    const vieja = { ...FACTURA };
    assert.equal(huellaDe(vieja), huellaDe({ ...vieja, cicloId: null }));
    assert.notEqual(huellaDe({ ...vieja, cicloId: 1 }), huellaDe({ ...vieja, cicloId: 2 }));
    assert.notEqual(huellaDe({ ...vieja, cicloId: 1 }), huellaDe(vieja));
    assert.equal(huellaAnteriorDe({ ...vieja, cicloId: 1 }), huellaAnteriorDe(vieja));
  });

  test('un intento anterior sin ciclo no se reutiliza para facturar otra semana', async () => {
    const { servicio, estado } = montar();
    await servicio.crearFactura(FACTURA, 1, { clave: 'zz-sin-ciclo' });
    await assert.rejects(servicio.crearFactura({ ...FACTURA, cicloId: 123 }, 1, { clave: 'zz-sin-ciclo' }), /otro contenido|distinto|misma clave/i);
    assert.equal(estado.emitidas, 1);
  });

  test('la huella del contrato de antes no cambió ni una coma', () => {
    // Es la que tienen guardada los intentos que vienen de producción, y la
    // que se recalcula cuando una tablet reenvía después del corte una
    // factura que armó antes. Si cambia, ese reenvío deja de reconocerse.
    const { huellaDe, huellaAnteriorDe } = require('../src/modules/facturacion/idempotencia');
    const deAntes = { client: 38, date: '2026-09-01', items: [{ id: 983, quantity: 2, price: 1000 }, { id: 12, quantity: 1, price: 55.5 }] };
    const esperada = require('crypto').createHash('sha256')
      .update('38~2026-09-01~12:1:55.5|983:2:1000').digest('hex').slice(0, 64);

    assert.equal(huellaAnteriorDe(deAntes), esperada);
    assert.equal(huellaDe(deAntes), esperada, 'una factura armada antes del corte se sigue reconociendo por su huella de siempre');
  });

  test('un id nuestro y uno de Alegra con el mismo número no dan la misma huella', () => {
    const { huellaDe } = require('../src/modules/facturacion/idempotencia');
    const items = [{ id: 983, productoId: 983, quantity: 2, price: 1000 }];

    assert.notEqual(
      huellaDe({ clienteId: 38, date: '2026-09-01', items }),
      huellaDe({ client: 38, date: '2026-09-01', items })
    );
    // En el contrato propio el producto es `productoId`; `id` solo si falta.
    assert.equal(
      huellaDe({ clienteId: 38, date: 'x', items: [{ id: 5, productoId: 983, quantity: 1, price: 1 }] }),
      huellaDe({ clienteId: '38', date: 'x', items: [{ productoId: '983', quantity: 1, price: 1 }] })
    );
  });
});
