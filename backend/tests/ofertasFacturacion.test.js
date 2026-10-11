const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/**
 * Las ofertas de exceso en el mostrador.
 *
 * El catálogo del agente y el portal YA le muestran estos descuentos al
 * cliente. La facturación no los conocía, así que quien pidió viendo "−35 %"
 * llegaba a la caja y se le cobraba completo. Lo que se promete y lo que se
 * cobra tienen que ser lo mismo.
 */

const rutaDb = path.join(__dirname, '..', 'config', 'database.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'facturacion', 'ofertas.service.js');

function montar(filas = []) {
  const consultas = [];
  const ejecutar = async (sql, params = []) => {
    consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    return { rows: filas };
  };
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true,
    exports: { pool: { query: ejecutar, connect: async () => ({ query: ejecutar, release: () => {} }) }, query: ejecutar }
  };
  delete require.cache[rutaServicio];
  return { servicio: require(rutaServicio), consultas };
}

beforeEach(() => { for (const r of [rutaDb, rutaServicio]) delete require.cache[r]; });

describe('las ofertas para facturar', () => {
  test('llegan con NUESTRO id de producto', async () => {
    // Inventario y facturación comparten el id propio, incluido un producto nuevo.
    const { servicio } = montar([
      { producto_id: 48, alegra_item_id: '1231', nombre_producto: 'ADAPTADOR MACHO 2 PVC', descuento_porcentaje: 35 }
    ]);
    const r = await servicio.ofertasVigentes();
    assert.deepEqual(r, [{
      productoId: 48, nombre: 'ADAPTADOR MACHO 2 PVC', descuentoPorcentaje: 35
    }]);
  });

  test('no redefine qué es una oferta viva', async () => {
    // Si cada pantalla lo decidiera por su lado, el cliente podría ver una
    // oferta que al facturarla se cobra completa.
    const { servicio, consultas } = montar();
    await servicio.ofertasVigentes();
    const { SQL_VIGENTES } = require('../src/utils/descuentosExceso');
    const nucleo = SQL_VIGENTES.replace(/\s+/g, ' ').trim().replace(/;$/, '');
    assert.ok(consultas[0].sql.includes(nucleo.slice(0, 120)),
      'la consulta dejó de usar la definición compartida de "vigente"');
  });

  test('un producto inactivo no sale en oferta', async () => {
    const { servicio, consultas } = montar();
    await servicio.ofertasVigentes();
    assert.match(consultas[0].sql, /WHERE p\.activo/);
  });

  test('sin ofertas vivas devuelve una lista vacía, no un error', async () => {
    const { servicio } = montar([]);
    assert.deepEqual(await servicio.ofertasVigentes(), []);
  });
});

test('la línea nace con el descuento de la oferta', () => {
  const hook = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'hooks', 'useFacturacion.js'), 'utf8');
  assert.match(hook, /const ofertaExceso = ofertas\.get\(/);
  assert.match(hook, /discount: ofertaExceso/);
  // Y la pantalla dice de dónde salió: si el cajero lo cambia, deja de
  // decirlo, porque ya no es la oferta.
  const linea = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'facturacion', 'LineaFactura.jsx'), 'utf8');
  assert.match(linea, /item\.ofertaExceso > 0 && item\.discount === item\.ofertaExceso/);
});
