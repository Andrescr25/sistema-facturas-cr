const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * El XML de una factura de proveedor pasa a guardarse: la ruta, no el
 * contenido. Hasta hoy `emailService.js` lo parseaba y lo descartaba —
 * comprobado en las 862/882 facturas ya recibidas: ninguna tiene el XML,
 * solo el nombre del adjunto.
 *
 * Lo que se cuida acá:
 *  - que el archivo se guarde de verdad y se pueda leer de vuelta;
 *  - que un XML duplicado (la misma factura, o la misma nota de crédito,
 *    reprocesada por el correo) no deje un archivo huérfano en disco;
 *  - que si la factura no llega a existir en la base, el XML tampoco se
 *    quede sin ningún registro que lo señale.
 */

describe('almacenamiento privado (no se sirve por HTTP)', () => {
  const RAIZ_PRUEBA = fs.mkdtempSync(path.join(os.tmpdir(), 'almacenamiento-privado-'));
  const rutaModulo = path.join(__dirname, '..', 'src', 'integrations', 'almacenamiento', 'local.js');
  let almacenamiento;

  before(() => {
    process.env.ALMACENAMIENTO_PRIVADO_DIR = RAIZ_PRUEBA;
    delete require.cache[rutaModulo];
    almacenamiento = require(rutaModulo);
  });

  after(() => {
    delete process.env.ALMACENAMIENTO_PRIVADO_DIR;
    delete require.cache[rutaModulo];
    fs.rmSync(RAIZ_PRUEBA, { recursive: true, force: true });
  });

  test('guarda el archivo y la ruta no empieza con "/"', async () => {
    // Es la única defensa contra montar esto con express.static algún día:
    // una ruta pública siempre empieza con "/archivos".
    const { ruta, bytes } = await almacenamiento.guardarArchivo({
      carpeta: 'compras-proveedor', prefijo: 'xml',
      buffer: Buffer.from('<FacturaElectronica>contenido</FacturaElectronica>'),
      extension: 'xml'
    });

    assert.equal(ruta.startsWith('/'), false);
    assert.match(ruta, /^compras-proveedor\/xml-\d+-[a-f0-9]{8}\.xml$/);
    assert.equal(bytes, Buffer.byteLength('<FacturaElectronica>contenido</FacturaElectronica>'));
  });

  test('lo que se guarda se puede leer de vuelta, byte a byte', async () => {
    const contenido = Buffer.from('<FacturaElectronica><Clave>123</Clave></FacturaElectronica>');
    const { ruta } = await almacenamiento.guardarArchivo({
      carpeta: 'compras-proveedor', prefijo: 'xml', buffer: contenido, extension: 'xml'
    });

    const leido = await almacenamiento.leerArchivoPrivado(ruta);
    assert.deepEqual(leido, contenido);
  });

  test('borrarPrivado lo quita, y una segunda vez no revienta', async () => {
    const { ruta } = await almacenamiento.guardarArchivo({
      carpeta: 'compras-proveedor', prefijo: 'xml', buffer: Buffer.from('x'), extension: 'xml'
    });

    assert.equal(await almacenamiento.borrarPrivado(ruta), true);
    assert.equal(await almacenamiento.leerArchivoPrivado(ruta), null);
    assert.equal(await almacenamiento.borrarPrivado(ruta), false, 'borrar lo que ya no existe no debe lanzar');
  });

  test('una ruta que intenta salir de la raíz se rechaza', async () => {
    // Ni para leer ni para borrar: "compra/../../etc/passwd" no puede
    // resolver fuera de RAIZ_PRIVADA.
    assert.equal(await almacenamiento.leerArchivoPrivado('../../etc/passwd'), null);
    assert.equal(await almacenamiento.borrarPrivado('../../etc/passwd'), false);
  });

  test('sin extensión válida, no guarda nada', async () => {
    await assert.rejects(
      () => almacenamiento.guardarArchivo({ carpeta: 'compras-proveedor', prefijo: 'xml', buffer: Buffer.from('x'), extension: '../evil' }),
      /extensión inválida/
    );
  });
});

describe('la ruta del XML de una factura, pegada por SQL (no por Prisma)', () => {
  const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
  const rutaModulo = path.join(__dirname, '..', 'src', 'utils', 'xmlRutaComprobante.js');

  function montar(respuesta) {
    delete require.cache[rutaDb];
    delete require.cache[rutaModulo];
    const log = [];
    require.cache[rutaDb] = {
      id: rutaDb, filename: rutaDb, loaded: true,
      exports: {
        query: async (sql, params) => {
          log.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
          if (respuesta instanceof Error) throw respuesta;
          return { rows: [] };
        }
      }
    };
    return { modulo: require(rutaModulo), log };
  }

  test('sin xmlRuta, no consulta la base', async () => {
    const { modulo, log } = montar();
    await modulo.guardarXmlRutaDeFactura('factura-1', null);
    assert.equal(log.length, 0);
  });

  test('con xmlRuta, hace el UPDATE con el id y la ruta correctos', async () => {
    const { modulo, log } = montar();
    await modulo.guardarXmlRutaDeFactura('factura-1', 'compras-proveedor/xml-1.xml');

    assert.equal(log.length, 1);
    assert.match(log[0].sql, /UPDATE facturas_proveedores SET xml_ruta = \$1 WHERE id = \$2/);
    assert.deepEqual(log[0].params, ['compras-proveedor/xml-1.xml', 'factura-1']);
  });

  test('si la base falla, no lanza: la factura ya se guardó sin esto', async () => {
    const { modulo } = montar(new Error('la base dijo que no'));
    await assert.doesNotReject(() => modulo.guardarXmlRutaDeFactura('factura-1', 'compras-proveedor/xml-1.xml'));
  });

  test('guardarTotalesDelResumen manda los tres totales y el detalle en JSON', async () => {
    const { modulo, log } = montar();
    await modulo.guardarTotalesDelResumen('factura-1',
      { otrosCargos: 1500, descuentos: 500, ivaDevuelto: 0 },
      [{ tipo: '04', detalle: 'Flete', monto: 1500 }]
    );

    assert.equal(log.length, 1);
    assert.match(log[0].sql, /UPDATE facturas_proveedores/);
    assert.match(log[0].sql, /total_otros_cargos = \$1/);
    assert.match(log[0].sql, /otros_cargos = \$4::jsonb/);
    assert.deepEqual(log[0].params[0], 1500);
    assert.deepEqual(log[0].params[1], 500);
    assert.deepEqual(JSON.parse(log[0].params[3]), [{ tipo: '04', detalle: 'Flete', monto: 1500 }]);
    assert.equal(log[0].params[4], 'factura-1');
  });

  test('guardarTotalesDelResumen sin totales, no consulta la base', async () => {
    const { modulo, log } = montar();
    await modulo.guardarTotalesDelResumen('factura-1', null, []);
    assert.equal(log.length, 0);
  });
});

describe('nota de crédito de proveedor: el XML duplicado no queda huérfano', () => {
  const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
  const rutaAlmacenamiento = path.join(__dirname, '..', 'src', 'integrations', 'almacenamiento', 'index.js');
  const rutaServicio = path.join(__dirname, '..', 'services', 'notasCreditoService.js');

  const NC = {
    clave: '50611082026310249651800100001030000000081',
    claveReferencia: '5061108202631024965180010000101000000242011234',
    numeroConsecutivo: '00100001030000000081',
    emisor: { nombre: 'PROVEEDOR DE PRUEBA', identificacion: { numero: '3101000000' } },
    fechaEmision: { iso: '2026-09-01T00:00:00.000Z' },
    montoTotal: 1000,
    moneda: 'CRC',
    razon: 'Error en la factura',
    codigoReferencia: '02',
    lineas: []
  };

  function montar({ filaDevuelta }) {
    delete require.cache[rutaDb];
    delete require.cache[rutaAlmacenamiento];
    delete require.cache[rutaServicio];

    const sqlEjecutado = [];
    require.cache[rutaDb] = {
      id: rutaDb, filename: rutaDb, loaded: true,
      exports: {
        query: async (sql, params) => {
          sqlEjecutado.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
          return { rows: filaDevuelta ? [{ id: 'nc-1' }] : [] };
        }
      }
    };

    const borrados = [];
    require.cache[rutaAlmacenamiento] = {
      id: rutaAlmacenamiento, filename: rutaAlmacenamiento, loaded: true,
      exports: { borrarPrivado: async (ruta) => { borrados.push(ruta); return true; } }
    };

    return { servicio: require(rutaServicio), sqlEjecutado, borrados };
  }

  test('la ruta del XML viaja en el INSERT', async () => {
    const { servicio, sqlEjecutado } = montar({ filaDevuelta: true });
    await servicio.guardarNotaCredito(NC, 'compras-proveedor/xml-nc.xml');

    const insert = sqlEjecutado.find((s) => /INSERT INTO nota_credito_proveedor/.test(s.sql));
    assert.ok(insert, 'debe haber un INSERT');
    assert.match(insert.sql, /xml_ruta/);
    assert.equal(insert.params.at(-1), 'compras-proveedor/xml-nc.xml');
  });

  test('nota nueva: se guarda y el XML NO se borra', async () => {
    const { servicio, borrados } = montar({ filaDevuelta: true });
    const { guardada } = await servicio.guardarNotaCredito(NC, 'compras-proveedor/xml-nc.xml');

    assert.equal(guardada, true);
    assert.deepEqual(borrados, []);
  });

  test('nota YA existente (ON CONFLICT DO NOTHING): el XML recién guardado se borra', async () => {
    // El correo se relee cada 30 días; si la NC ya estaba, el INSERT no
    // inserta nada y el archivo que se acaba de escribir en disco queda sin
    // ninguna fila que lo señale — por eso se borra acá.
    const { servicio, borrados } = montar({ filaDevuelta: false });
    const { guardada } = await servicio.guardarNotaCredito(NC, 'compras-proveedor/xml-nc.xml');

    assert.equal(guardada, false);
    assert.deepEqual(borrados, ['compras-proveedor/xml-nc.xml']);
  });

  test('sin xmlRuta (no se pudo guardar el archivo), no intenta borrar nada', async () => {
    const { servicio, borrados } = montar({ filaDevuelta: false });
    await servicio.guardarNotaCredito(NC, null);
    assert.deepEqual(borrados, []);
  });
});

describe('factura de proveedor duplicada: el XML recién guardado no queda huérfano', () => {
  const rutaPrisma = path.join(__dirname, '..', 'lib', 'prisma.js');
  const rutaAlmacenamiento = path.join(__dirname, '..', 'src', 'integrations', 'almacenamiento', 'index.js');
  const rutaServicio = path.join(__dirname, '..', 'services', 'databaseService.js');

  function montar({ facturaExistente }) {
    delete require.cache[rutaPrisma];
    delete require.cache[rutaAlmacenamiento];
    delete require.cache[rutaServicio];

    require.cache[rutaPrisma] = {
      id: rutaPrisma, filename: rutaPrisma, loaded: true,
      exports: {
        factura: {
          findUnique: async () => facturaExistente || null
        }
      }
    };

    const borrados = [];
    require.cache[rutaAlmacenamiento] = {
      id: rutaAlmacenamiento, filename: rutaAlmacenamiento, loaded: true,
      exports: { borrarPrivado: async (ruta) => { borrados.push(ruta); return true; } }
    };

    const DatabaseService = require(rutaServicio);
    return { servicio: new DatabaseService(), borrados };
  }

  test('factura ya existe: se devuelve la existente y se borra el XML recién guardado', async () => {
    const existente = { id: 'factura-existente', clave: 'CLAVE-1' };
    const { servicio, borrados } = montar({ facturaExistente: existente });

    const resultado = await servicio.saveFactura(
      { clave: 'CLAVE-1' }, 'archivo.xml', 'email-1', 'compras-proveedor/xml-dup.xml'
    );

    assert.equal(resultado, existente);
    assert.deepEqual(borrados, ['compras-proveedor/xml-dup.xml']);
  });

  test('factura ya existe y no había XML guardado: no intenta borrar nada', async () => {
    const existente = { id: 'factura-existente', clave: 'CLAVE-1' };
    const { servicio, borrados } = montar({ facturaExistente: existente });

    await servicio.saveFactura({ clave: 'CLAVE-1' }, 'archivo.xml', 'email-1', null);
    assert.deepEqual(borrados, []);
  });
});

describe('factura de proveedor nueva: el XML se borra solo si la fila no llegó a existir', () => {
  const rutaPrisma = path.join(__dirname, '..', 'lib', 'prisma.js');
  const rutaAlmacenamiento = path.join(__dirname, '..', 'src', 'integrations', 'almacenamiento', 'index.js');
  const rutaXmlRuta = path.join(__dirname, '..', 'src', 'utils', 'xmlRutaComprobante.js');
  const rutaGastoRecurrente = path.join(__dirname, '..', 'src', 'modules', 'pagos-recurrentes', 'scrapers', 'facturas-recibidas.adapter.js');
  const rutaRelacion = path.join(__dirname, '..', 'src', 'modules', 'productos-revision', 'relacionPropia.js');
  const rutaServicio = path.join(__dirname, '..', 'services', 'databaseService.js');

  const facturaData = {
    clave: 'CLAVE-NUEVA',
    numeroConsecutivo: '0001',
    fechaEmision: { iso: '2026-09-01T10:00:00-06:00' },
    emisor: { nombre: 'Proveedor', identificacion: { numero: '3101000000' } },
    resumen: { totales: { comprobante: 1000 }, moneda: { codigo: 'CRC' } },
    productos: [{ numeroLinea: 1, codigo: 'A1', descripcion: 'Producto', cantidad: 1, precioUnitario: 1000, montoTotalLinea: 1000 }]
  };

  function montar({ falla }) {
    for (const r of [rutaPrisma, rutaAlmacenamiento, rutaXmlRuta, rutaGastoRecurrente, rutaRelacion, rutaServicio]) {
      delete require.cache[r];
    }

    // El buzón busca los mapeos del proveedor y cuelga el producto propio por
    // SQL (relacionPropia.js). Sin este doble esas consultas irían a la base
    // de verdad. Un mapeo existente obliga a pasar por el PASO 3 —contar el
    // uso—, que es DESPUÉS de crear la fila.
    require.cache[rutaRelacion] = {
      id: rutaRelacion, filename: rutaRelacion, loaded: true,
      exports: {
        mapeosDelProveedor: async () => new Map([['A1', {
          id: 'mapeo-1', supplierDesc: 'Producto', confidence: 1, productoId: 7, productoNombre: 'X', alegraId: '99'
        }]]),
        productoDeLineasPorMapeo: async () => 1,
        recalcularAvance: async () => []
      }
    };

    require.cache[rutaPrisma] = {
      id: rutaPrisma, filename: rutaPrisma, loaded: true,
      exports: {
        factura: {
          findUnique: async () => null,
          create: async () => {
            if (falla === 'create') throw new Error('la base se cayó');
            return { id: 'factura-nueva', productos: [{}] };
          },
          update: async () => ({})
        },
        supplierProductMapping: {
          update: async () => {
            if (falla === 'mapeos') throw new Error('falló después de crear la fila');
            return {};
          }
        },
        cuentaPorPagar: { upsert: async () => ({}) }
      }
    };

    const borrados = [];
    require.cache[rutaAlmacenamiento] = {
      id: rutaAlmacenamiento, filename: rutaAlmacenamiento, loaded: true,
      exports: { borrarPrivado: async (ruta) => { borrados.push(ruta); return true; } }
    };
    const rutasGuardadas = [];
    require.cache[rutaXmlRuta] = {
      id: rutaXmlRuta, filename: rutaXmlRuta, loaded: true,
      exports: {
        guardarXmlRutaDeFactura: async (id, ruta) => { rutasGuardadas.push([id, ruta]); },
        guardarTotalesDelResumen: async () => {}
      }
    };
    require.cache[rutaGastoRecurrente] = {
      id: rutaGastoRecurrente, filename: rutaGastoRecurrente, loaded: true,
      exports: { esEmisorDeGastoRecurrente: async () => false, ESTADO_GASTO_RECURRENTE: 'GASTO_RECURRENTE' }
    };

    const DatabaseService = require(rutaServicio);
    return { servicio: new DatabaseService(), borrados, rutasGuardadas };
  }

  after(() => {
    for (const r of [rutaPrisma, rutaAlmacenamiento, rutaXmlRuta, rutaGastoRecurrente, rutaRelacion, rutaServicio]) {
      delete require.cache[r];
    }
  });

  test('si falla la creación de la fila, el XML se borra', async () => {
    const { servicio, borrados } = montar({ falla: 'create' });
    await assert.rejects(
      servicio.saveFactura(facturaData, 'archivo.xml', 'email-1', 'compras-proveedor/xml-nuevo.xml'),
      /la base se cayó/
    );
    assert.deepEqual(borrados, ['compras-proveedor/xml-nuevo.xml']);
  });

  test('si falla algo DESPUÉS de crear la fila, el XML se queda: la fila lo señala', async () => {
    const { servicio, borrados, rutasGuardadas } = montar({ falla: 'mapeos' });
    await assert.rejects(
      servicio.saveFactura(facturaData, 'archivo.xml', 'email-1', 'compras-proveedor/xml-nuevo.xml'),
      /después de crear la fila/
    );
    assert.deepEqual(rutasGuardadas, [['factura-nueva', 'compras-proveedor/xml-nuevo.xml']]);
    assert.deepEqual(borrados, []);
  });
});
