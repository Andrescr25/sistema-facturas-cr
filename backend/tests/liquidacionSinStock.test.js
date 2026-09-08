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
  const registro = { escrituras: [], pedidosAAlegra: [] };

  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: {
      query: async (sql, params) => {
        const texto = String(sql);
        if (/UPDATE producto_descuento_exceso/.test(texto)) {
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

describe('la tanda de excesos ya no nace sola', () => {
  test('el arranque programa la revisión, no la creación de tandas', async () => {
    const { servicio } = montar({ vigentes: [] });
    // Lo que se exporta define lo que puede correr desatendido.
    assert.equal(typeof servicio.iniciarRevisionSemanalExcesos, 'function');
    assert.equal(typeof servicio.revisionSemanalDeExcesos, 'function');
    assert.equal(typeof servicio.generarTandaDeExcesos, 'function');
    assert.equal(servicio.generarExcesosSemanales, undefined,
      'generarExcesosSemanales ya no existe: se partió en revisión (automática) y tanda (manual)');
  });

  test('nada en el servidor arranca la creación de tandas', () => {
    const fs = require('fs');
    const arranque = fs.readFileSync(require.resolve('../server.js'), 'utf8');
    assert.ok(!/generarTandaDeExcesos/.test(arranque),
      'el servidor no debe crear tandas al arrancar ni por reloj');
    assert.match(arranque, /iniciarRevisionSemanalExcesos/);
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
