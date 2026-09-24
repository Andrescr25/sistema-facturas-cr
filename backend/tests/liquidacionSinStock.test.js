/**
 * Un producto agotado no sigue en liquidación.
 *
 * EL BUG QUE ESTO CUBRE
 * Que una oferta estuviera vigente se decidía contra el stock CONGELADO en
 * el ítem de la tanda: la cantidad que el empacador contó el día que la
 * empacó. Esa foto envejece. El 2026-09-08 había 37 ofertas vivas con stock
 * congelado del 23 de julio y del 16 de agosto, y ALAMBRINA GDE METAL salía
 * con −25% y "AGOTADO" a la vez: se le ofrecía al cliente algo que no había.
 *
 * La salida de la liquidación es el descuento en 0. Se deja la fila viva a
 * propósito: si el producto se vuelve a surtir y se vuelve a quedar quieto,
 * la detección lo agarra otra vez y el descuento arranca desde abajo.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaAlegra = require.resolve('../src/integrations/alegra');
const rutaDescuentos = require.resolve('../src/utils/descuentosExceso');
const rutaServicio = require.resolve('../src/modules/inventario-auditorias/inventario-auditorias.service');

/**
 * Monta el servicio con una base y un Alegra falsos.
 * `vigentes` son las ofertas que devuelve el helper compartido;
 * `stockEnAlegra` es lo que contesta Alegra hoy por cada producto.
 */
function montar({ vigentes = [], stockEnAlegra = {} } = {}) {
  const registro = { escrituras: [], pedidosAAlegra: [], existeFila: false };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        const texto = String(sql);
        if (/SELECT id FROM producto_descuento_exceso WHERE alegra_item_id/.test(texto)) {
          return { rows: registro.existeFila ? [{ id: 1 }] : [] };
        }
        if (/(UPDATE|INSERT INTO) producto_descuento_exceso/.test(texto)) {
          registro.escrituras.push({ sql: texto, params });
        }
        return { rows: [] };
      }
    }
  };

  require.cache[rutaAlegra] = {
    id: rutaAlegra, filename: rutaAlegra, loaded: true,
    exports: {
      getInventoryService: () => ({}),
      getClient: () => ({
        get: async (ruta) => {
          registro.pedidosAAlegra.push(ruta);
          const id = String(ruta).split('/').pop();
          if (!(id in stockEnAlegra)) return { success: false, error: 'no existe' };
          return { success: true, data: { inventory: { availableQuantity: stockEnAlegra[id] } } };
        }
      })
    }
  };

  require.cache[rutaDescuentos] = {
    id: rutaDescuentos, filename: rutaDescuentos, loaded: true,
    exports: {
      listarVigentes: async () => vigentes,
      mapaVigentes: async () => new Map(),
      aplicarDescuento: (p) => p,
      SQL_VIGENTES: ''
    }
  };

  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), registro };
}

const oferta = (o = {}) => ({ id: '8', nombre: 'ALAMBRINA GDE METAL', descuentoPorcentaje: 25, ...o });

describe('sacar de liquidación lo que se agotó', () => {
  test('el producto sin stock en Alegra queda con el descuento en 0', async () => {
    const { servicio, registro } = montar({
      vigentes: [oferta()],
      stockEnAlegra: { 8: 0 }
    });

    const r = await servicio.depurarOfertasSinStock();

    assert.equal(r.sacados.length, 1);
    assert.equal(r.sacados[0].nombre, 'ALAMBRINA GDE METAL');
    assert.equal(r.sacados[0].descuentoAnterior, 25);
    assert.equal(registro.escrituras.length, 1);
    assert.match(registro.escrituras[0].sql, /descuento_porcentaje = 0/);
    assert.deepEqual(registro.escrituras[0].params, [['8']]);
  });

  test('el que todavía tiene stock no se toca', async () => {
    const { servicio, registro } = montar({
      vigentes: [oferta({ id: '1724', nombre: 'MECHA PARA PISO BLANCA KLINTEX' })],
      stockEnAlegra: { 1724: 19 }
    });

    const r = await servicio.depurarOfertasSinStock();

    assert.equal(r.sacados.length, 0);
    assert.equal(r.revisados, 1);
    assert.equal(registro.escrituras.length, 0);
  });

  test('un stock negativo también saca de liquidación', async () => {
    // Alegra deja el inventario en negativo cuando se factura de más; en la
    // práctica significa que no hay nada que entregar.
    const { servicio } = montar({ vigentes: [oferta()], stockEnAlegra: { 8: -3 } });
    const r = await servicio.depurarOfertasSinStock();
    assert.equal(r.sacados.length, 1);
  });

  test('si Alegra no contesta por un producto, se lo deja como está', async () => {
    // Sacarlo de la oferta por un fallo de red sería peor que dejarlo un día
    // más: el cliente vería desaparecer una promoción por un problema
    // nuestro.
    const { servicio, registro } = montar({ vigentes: [oferta()], stockEnAlegra: {} });

    const r = await servicio.depurarOfertasSinStock();

    assert.equal(r.sacados.length, 0);
    assert.equal(registro.escrituras.length, 0);
  });

  test('con el catálogo en vivo en la mano no le pregunta nada a Alegra', async () => {
    // generarTandaDeExcesos ya trajo las 2.000 fichas; volver a pedirlas de a
    // una sería pagar dos veces el minuto que cuesta.
    const { servicio, registro } = montar({
      vigentes: [oferta(), oferta({ id: '974', nombre: 'TINA N-60' })]
    });

    const r = await servicio.depurarOfertasSinStock([
      { id: 8, inventory: { availableQuantity: 0 } },
      { id: 974, inventory: { availableQuantity: 5 } }
    ]);

    assert.equal(registro.pedidosAAlegra.length, 0);
    assert.deepEqual(r.sacados.map(s => s.id), ['8']);
  });

  test('sin ofertas vigentes no consulta ni escribe nada', async () => {
    const { servicio, registro } = montar({ vigentes: [] });
    const r = await servicio.depurarOfertasSinStock();
    assert.equal(r.revisados, 0);
    assert.equal(registro.pedidosAAlegra.length, 0);
    assert.equal(registro.escrituras.length, 0);
  });
});

describe('el exceso ya no corre solo', () => {
  // Antes había un cron intermedio (iniciarRevisionSemanalExcesos) que no
  // creaba tandas pero sí escalaba descuentos cada domingo sin que nadie lo
  // pidiera. El usuario pidió quitarlo del todo (2026-09-20): ya no queda
  // NADA de excesos corriendo desatendido, ni la tanda ni el descuento.
  test('ni el cron ni la revisión semanal existen', async () => {
    const { servicio } = montar({ vigentes: [] });
    assert.equal(servicio.iniciarRevisionSemanalExcesos, undefined,
      'ya no debe quedar ningún cron de excesos');
    assert.equal(servicio.revisionSemanalDeExcesos, undefined,
      'la revisión semanal se fue con el cron: escalaba descuentos sola');
    assert.equal(typeof servicio.generarTandaDeExcesos, 'function');
    assert.equal(servicio.generarExcesosSemanales, undefined);
  });

  test('nada en el servidor arranca la creación de tandas ni ningún cron de excesos', () => {
    const fs = require('fs');
    const arranque = fs.readFileSync(require.resolve('../server.js'), 'utf8');
    assert.ok(!/generarTandaDeExcesos/.test(arranque),
      'el servidor no debe crear tandas al arrancar ni por reloj');
    assert.ok(!/iniciarRevisionSemanalExcesos/.test(arranque),
      'el servidor no debe registrar ningún cron de excesos');
  });

  test('el descuento inicial se pone una sola vez y no vuelve a subir', async () => {
    const { servicio, registro } = montar({ vigentes: [] });
    const candidato = { alegra_id: '99', name: 'PRODUCTO X', reference: 'REF-X' };

    // Primera vez: no existe fila todavía -> se inserta con el inicial.
    await servicio.escalarDescuentosExceso([candidato]);
    const insert = registro.escrituras.find(e => /INSERT INTO producto_descuento_exceso/.test(e.sql));
    assert.ok(insert, 'debería insertar el descuento inicial la primera vez');

    // Segunda vez: ya "existe" fila -> no debe haber ningún UPDATE que le
    // suba el porcentaje ni ninguna consulta de regalo.
    registro.escrituras.length = 0;
    registro.existeFila = true;
    await servicio.escalarDescuentosExceso([candidato]);
    assert.equal(registro.escrituras.length, 0,
      'un producto que ya tiene descuento no debe tocarse de nuevo');
  });

  test('no queda ningún incremento semanal en el código', () => {
    const fs = require('fs');
    const fuente = fs.readFileSync(
      require.resolve('../src/modules/inventario-auditorias/inventario-auditorias.service'), 'utf8'
    );
    assert.ok(!/DESCUENTO_INCREMENTO/.test(fuente),
      'no debe quedar ninguna constante ni lógica de incremento semanal');
  });
});

describe('la regla de qué está vigente', () => {
  test('un descuento en 0 deja de ser oferta', () => {
    delete require.cache[rutaDescuentos];
    delete require.cache[rutaDb];
    require.cache[rutaDb] = {
      id: rutaDb, filename: rutaDb, loaded: true,
      exports: { query: async () => ({ rows: [] }) }
    };
    const { SQL_VIGENTES } = require(rutaDescuentos);
    assert.match(SQL_VIGENTES, /descuento_porcentaje > 0/,
      'sin esto, poner el descuento en 0 no saca al producto del catálogo');
  });
});
