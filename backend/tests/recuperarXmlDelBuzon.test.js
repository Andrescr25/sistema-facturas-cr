const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recuperarUno, recuperarXmlDelBuzon, claveDelContenido } = require('../src/modules/compras/recuperarXmlDelBuzon');

/**
 * Recuperar, del buzón, los XML que ya se recibieron pero nunca se
 * guardaron. Nada de esto abre una conexión IMAP real: `buscarPorArchivo` y
 * `bajarAdjunto` son dobles, y lo que se cuida es la LÓGICA — que no se
 * busque por `email_id` (es un seqno volátil), que la clave desempate un
 * nombre repetido, que nada se recupere dos veces, y que un fallo puntual no
 * detenga el resto.
 */

const XML_DE = (clave) => Buffer.from(`<FacturaElectronica><Clave>${clave}</Clave></FacturaElectronica>`);

function montarAlmacenamiento({ falla = null } = {}) {
  const guardados = [];
  return {
    guardados,
    guardarArchivo: async ({ carpeta, prefijo, buffer, extension }) => {
      if (falla) throw new Error(falla);
      const ruta = `${carpeta}/${prefijo}-${guardados.length}.${extension}`;
      guardados.push({ ruta, bytes: buffer.length });
      return { ruta, bytes: buffer.length };
    }
  };
}

describe('claveDelContenido', () => {
  test('saca la clave de 50 dígitos del XML', () => {
    assert.equal(claveDelContenido(XML_DE('1'.repeat(50))), '1'.repeat(50));
  });
  test('sin <Clave>, da null', () => {
    assert.equal(claveDelContenido(Buffer.from('<Otro/>')), null);
  });
});

describe('recuperarUno', () => {
  const FILA = { id: 'f1', archivo_xml: 'factura.xml', clave: '1'.repeat(50) };

  test('sin archivo_xml, no busca nada', async () => {
    const r = await recuperarUno({ id: 'f2', archivo_xml: null, clave: null }, {
      buscarPorArchivo: async () => { throw new Error('no debería llamarse'); },
      bajarAdjunto: async () => { throw new Error('no debería llamarse'); },
      guardarArchivo: async () => { throw new Error('no debería llamarse'); },
      actualizarRuta: async () => { throw new Error('no debería llamarse'); }
    });
    assert.equal(r.estado, 'sin_nombre_de_archivo');
  });

  test('lo encuentra, la clave coincide, se guarda y se actualiza', async () => {
    const alm = montarAlmacenamiento();
    const actualizadas = [];
    const r = await recuperarUno(FILA, {
      buscarPorArchivo: async (nombre) => { assert.equal(nombre, 'factura.xml'); return [42]; },
      bajarAdjunto: async (uid) => { assert.equal(uid, 42); return [{ filename: 'factura.xml', content: XML_DE(FILA.clave) }]; },
      guardarArchivo: alm.guardarArchivo,
      actualizarRuta: async (id, ruta) => { actualizadas.push({ id, ruta }); }
    });

    assert.equal(r.estado, 'recuperado');
    assert.equal(alm.guardados.length, 1);
    assert.equal(actualizadas.length, 1);
    assert.equal(actualizadas[0].id, 'f1');
    assert.equal(actualizadas[0].ruta, alm.guardados[0].ruta);
  });

  test('el nombre existe pero la clave NO coincide: es de otro proveedor', async () => {
    // Dos proveedores distintos mandando el adjunto como "factura.xml" no es
    // hipotético — es justo el caso que un nombre genérico no distingue.
    const r = await recuperarUno(FILA, {
      buscarPorArchivo: async () => [42],
      bajarAdjunto: async () => [{ filename: 'factura.xml', content: XML_DE('9'.repeat(50)) }],
      guardarArchivo: async () => { throw new Error('no debería guardar algo que no coincide'); },
      actualizarRuta: async () => { throw new Error('no debería actualizar'); }
    });
    assert.equal(r.estado, 'no_coincide_con_clave');
  });

  test('la búsqueda no encuentra nada', async () => {
    const r = await recuperarUno(FILA, {
      buscarPorArchivo: async () => [],
      bajarAdjunto: async () => { throw new Error('no debería llamarse'); },
      guardarArchivo: async () => { throw new Error('no debería llamarse'); },
      actualizarRuta: async () => { throw new Error('no debería llamarse'); }
    });
    assert.equal(r.estado, 'no_encontrado');
  });

  test('un UID que falla al bajar no detiene la búsqueda en el siguiente', async () => {
    const alm = montarAlmacenamiento();
    const r = await recuperarUno(FILA, {
      buscarPorArchivo: async () => [1, 2],
      bajarAdjunto: async (uid) => {
        if (uid === 1) throw new Error('correo corrupto');
        return [{ filename: 'factura.xml', content: XML_DE(FILA.clave) }];
      },
      guardarArchivo: alm.guardarArchivo,
      actualizarRuta: async () => {}
    });
    assert.equal(r.estado, 'recuperado');
  });

  test('sin clave en la fila, no se puede desempatar: se guarda igual', async () => {
    // Pasa con las 69 facturas sin `email_id` — acá sería sin `clave`, un
    // caso más raro pero posible si el parseo original falló.
    const alm = montarAlmacenamiento();
    const r = await recuperarUno({ id: 'f3', archivo_xml: 'factura.xml', clave: null }, {
      buscarPorArchivo: async () => [1],
      bajarAdjunto: async () => [{ filename: 'factura.xml', content: XML_DE('1'.repeat(50)) }],
      guardarArchivo: alm.guardarArchivo,
      actualizarRuta: async () => {}
    });
    assert.equal(r.estado, 'recuperado');
  });

  test('si falla el guardado, se reporta y no se actualiza la base', async () => {
    const alm = montarAlmacenamiento({ falla: 'disco lleno' });
    const r = await recuperarUno(FILA, {
      buscarPorArchivo: async () => [1],
      bajarAdjunto: async () => [{ filename: 'factura.xml', content: XML_DE(FILA.clave) }],
      guardarArchivo: alm.guardarArchivo,
      actualizarRuta: async () => { throw new Error('no debería llegar acá'); }
    });
    assert.equal(r.estado, 'fallo_guardado');
    assert.match(r.motivo, /disco lleno/);
  });
});

describe('recuperarXmlDelBuzon', () => {
  function montarPool(filas) {
    const consultas = [];
    return {
      consultas,
      query: async (sql, params) => {
        consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
        if (/^SELECT/.test(sql)) return { rows: filas };
        return { rows: [] };
      }
    };
  }

  test('solo pide lo que tiene xml_ruta NULL', async () => {
    const pool = montarPool([]);
    await recuperarXmlDelBuzon({
      pool, buscarPorArchivo: async () => [], bajarAdjunto: async () => [],
      almacenamiento: montarAlmacenamiento()
    });
    assert.match(pool.consultas[0].sql, /xml_ruta IS NULL/);
    assert.match(pool.consultas[0].sql, /archivo_xml IS NOT NULL/);
  });

  test('rechaza una tabla que no está en la lista permitida', async () => {
    await assert.rejects(
      () => recuperarXmlDelBuzon({ pool: montarPool([]), tabla: 'usuario', almacenamiento: montarAlmacenamiento() }),
      /tabla no permitida/
    );
  });

  test('cuenta cada resultado y ninguna fila se procesa dos veces', async () => {
    const filas = [
      { id: 'f1', archivo_xml: 'a.xml', clave: '1'.repeat(50) },
      { id: 'f2', archivo_xml: 'b.xml', clave: '2'.repeat(50) },
      { id: 'f3', archivo_xml: null, clave: null }
    ];
    const pool = montarPool(filas);
    const alm = montarAlmacenamiento();
    const buscadas = [];

    const r = await recuperarXmlDelBuzon({
      pool,
      buscarPorArchivo: async (nombre) => { buscadas.push(nombre); return [1]; },
      bajarAdjunto: async () => [{ filename: buscadas.at(-1), content: XML_DE(filas.find(f => f.archivo_xml === buscadas.at(-1)).clave) }],
      almacenamiento: alm
    });

    assert.equal(r.total, 3);
    assert.equal(r.recuperado, 2);
    assert.equal(r.sin_nombre_de_archivo, 1);
    assert.deepEqual(buscadas, ['a.xml', 'b.xml']);
    assert.equal(alm.guardados.length, 2);
  });
});
