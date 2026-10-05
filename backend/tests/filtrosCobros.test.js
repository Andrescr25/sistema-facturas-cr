const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Filtros y resumen de Cuentas por Cobrar (frontend/src/utils/filtrosCobros.js).
 *
 * Al pasar los cobros a la base propia, la pantalla siguió mandando
 * `search`/`estado`/`dias` a un endpoint que solo entiende `buscar`: el
 * buscador y los chips no hacían nada, el resumen no aparecía, y la mitad de
 * los deudores quedaba fuera por el tope de 30. Ahora se trae la cartera
 * entera y se filtra en el navegador con estas funciones.
 *
 * LA CARTERA VA CON LOS NOMBRES DEL SERVIDOR (`nombre`, `saldoTotal`,
 * `detalle`, `numero`). Hasta el 2026-10-04 el servicio la traducía a otros
 * (`clienteNombre`, `totalSaldo`, `numeroFactura`, y `facturas` era la lista
 * en vez de la cantidad). Lo único que se le agrega es lo que depende de hoy:
 * cuánto falta para que venza cada factura.
 *
 * El módulo es ESM y estas pruebas son CommonJS: se lee el archivo, se le
 * quitan los `export` y se evalúa. Por eso ese archivo no puede tener imports.
 */
const FUENTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'filtrosCobros.js'), 'utf8');
const { estadoFactura, filtrarDeudores, resumenDeudores, diasParaVencer, conVencimiento } = new Function(
  `${FUENTE.replace(/^export /gm, '')}
   return { estadoFactura, filtrarDeudores, resumenDeudores, diasParaVencer, conVencimiento };`
)();

const f = (numero, { total = 1000, saldo = 1000, diasRestantes = 10 } = {}) =>
  ({ numero, total, saldo, diasRestantes });

const CARTERA = [
  { nombre: 'PULPERÍA JOSÉ', identificacion: '111', facturas: 2, saldoTotal: 2000, detalle: [f('A1', { diasRestantes: -3 }), f('A2', { diasRestantes: 5 })] },
  { nombre: 'SUPER EL CRUCE', identificacion: '222', facturas: 1, saldoTotal: 400, detalle: [f('B1', { saldo: 400, diasRestantes: 20 })] },
  { nombre: 'AB MARIO', identificacion: '333', facturas: 1, saldoTotal: 1000, detalle: [f('C1', { diasRestantes: 40 })] }
];

describe('lo que depende de hoy: cuánto falta para vencer', () => {
  // El mediodía de un día cualquiera, en la hora de la máquina que corre la prueba.
  const HOY = new Date('2026-10-04T12:00:00');

  test('cuenta días de calendario: vence mañana es 1, venció ayer es -1, hoy es 0', () => {
    assert.equal(diasParaVencer('2026-10-05', HOY), 1);
    assert.equal(diasParaVencer('2026-10-03', HOY), -1);
    assert.equal(diasParaVencer('2026-10-04', HOY), 0);
    assert.equal(diasParaVencer('2026-09-22', HOY), -12);
  });

  test('lee la fecha aunque llegue con hora, y sin fecha no hay días', () => {
    assert.equal(diasParaVencer('2026-10-05T06:00:00.000Z', HOY), 1);
    assert.equal(diasParaVencer(null, HOY), null);
    assert.equal(diasParaVencer('', HOY), null);
  });

  test('la cartera sale con los nombres del servidor, más los días y el estado de cada factura', () => {
    // Así llega del servidor (medido en la copia local).
    const delServidor = [{
      clienteId: 111, nombre: 'KEPESCA', identificacion: '100000000', telefono: '72366788  KENDALL',
      facturas: 2, saldoTotal: 235634, vencePrimero: '2026-09-08T06:00:00.000Z',
      detalle: [
        { id: 135, numero: '001000014802', fecha: '2026-08-31', fechaVencimiento: '2026-09-22', total: 226402, saldo: 226402 },
        { id: 140, numero: '001000014810', fecha: '2026-10-01', fechaVencimiento: '2026-10-20', total: 10000, saldo: 9232 }
      ]
    }];
    const [cliente] = conVencimiento(delServidor, HOY);

    // Nada se renombra ni se pierde.
    assert.deepEqual(Object.keys(cliente), Object.keys(delServidor[0]));
    assert.equal(cliente.nombre, 'KEPESCA');
    assert.equal(cliente.saldoTotal, 235634);
    assert.equal(cliente.facturas, 2, '`facturas` es la CANTIDAD; la lista es `detalle`');
    assert.deepEqual(cliente.detalle.map((x) => [x.id, x.numero, x.diasRestantes, x.estado]), [
      [135, '001000014802', -12, 'VENCIDA'],
      [140, '001000014810', 16, 'PARCIAL']
    ]);
    // Y no toca lo que recibió.
    assert.equal('estado' in delServidor[0].detalle[0], false);
  });

  test('sin cartera devuelve una lista vacía', () => {
    assert.deepEqual(conVencimiento(undefined), []);
    assert.deepEqual(conVencimiento([{ nombre: 'SIN FACTURAS' }])[0].detalle, []);
  });
});

describe('estadoFactura', () => {
  test('vencida manda sobre "con abono"', () => {
    assert.equal(estadoFactura(f('x', { saldo: 400, diasRestantes: -1 })), 'VENCIDA');
  });
  test('con saldo menor al total y sin vencer: con abono', () => {
    assert.equal(estadoFactura(f('x', { saldo: 400 })), 'PARCIAL');
  });
  test('vence hoy (0 días) no es vencida', () => {
    assert.equal(estadoFactura(f('x', { diasRestantes: 0 })), 'PENDIENTE');
  });
});

describe('filtrarDeudores', () => {
  test('sin filtros devuelve la cartera entera', () => {
    assert.equal(filtrarDeudores(CARTERA, {}).length, 3);
  });

  test('buscar no distingue acentos ni mayúsculas, y busca por identificación', () => {
    assert.deepEqual(filtrarDeudores(CARTERA, { search: 'pulperia jose' }).map((c) => c.identificacion), ['111']);
    assert.deepEqual(filtrarDeudores(CARTERA, { search: '222' }).map((c) => c.identificacion), ['222']);
  });

  test('por estado deja solo las facturas de ese estado, y recalcula el saldo del cliente', () => {
    const vencidas = filtrarDeudores(CARTERA, { estado: 'VENCIDA' });
    assert.equal(vencidas.length, 1);
    assert.deepEqual(vencidas[0].detalle.map((x) => x.numero), ['A1']);
    assert.equal(vencidas[0].saldoTotal, 1000);
    assert.equal(vencidas[0].facturas, 1, 'la cantidad también es la de las que pasaron el filtro');
    // La cartera original no cambia: el resumen de arriba se calcula sobre ella.
    assert.equal(CARTERA[0].detalle.length, 2);
    assert.equal(CARTERA[0].saldoTotal, 2000);
  });

  test('"con abono" encuentra la factura parcial', () => {
    assert.deepEqual(filtrarDeudores(CARTERA, { estado: 'PARCIAL' }).map((c) => c.identificacion), ['222']);
  });

  test('vence en 7 días: de hoy a 7, sin las vencidas', () => {
    const r = filtrarDeudores(CARTERA, { dias: 'vence7' });
    assert.deepEqual(r.flatMap((c) => c.detalle.map((x) => x.numero)), ['A2']);
  });

  test('"todos" no filtra', () => {
    assert.equal(filtrarDeudores(CARTERA, { estado: 'todos', dias: 'todos', search: '' }).length, 3);
  });
});

describe('resumenDeudores', () => {
  test('suma la cartera entera: total, vencido, próximos 7 días y clientes', () => {
    const r = resumenDeudores(CARTERA);
    assert.equal(r.totalPorCobrar, 3400);
    assert.equal(r.totalVencido, 1000);
    assert.equal(r.totalFacturas, 4);
    assert.equal(r.totalClientes, 3);
    assert.deepEqual(r.proximasAVencer, { monto: 1000, cantidad: 1 });
  });
});

describe('la pantalla usa los nombres del servidor, sin traductor', () => {
  const leer = (...partes) => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...partes), 'utf8');

  test('el servicio entrega la cartera como llega', () => {
    const servicio = leer('services', 'cuentasPorCobrarService.js');
    const cuerpo = servicio.slice(servicio.indexOf('export async function getCuentasPorCobrar'), servicio.indexOf('export async function getAbonosFactura'));

    assert.match(cuerpo, /data: response\.data\?\.data \?\? \[\]/);
    assert.equal(/function adaptarDeudor/.test(servicio), false, 'volvió el traductor');
    assert.equal(/\.map\(/.test(cuerpo), false, 'la cartera volvió a transformarse en el servicio');
  });

  test('el detalle del cliente y el modal de abono leen `nombre`, `saldoTotal`, `detalle`, `id` y `numero`', () => {
    const detalle = leer('components', 'cuentas-por-cobrar', 'ClienteDetalle.jsx');
    const modal = leer('components', 'cuentas-por-cobrar', 'ModalAbono.jsx');
    const pagina = leer('pages', 'CuentasPorCobrar.jsx');

    for (const [archivo, fuente] of [['ClienteDetalle', detalle], ['ModalAbono', modal], ['CuentasPorCobrar', pagina]]) {
      assert.equal(/numeroFactura|\.facturaId\b|\.clienteNombre\b|\.totalSaldo\b|cliente\.facturas\b|c\.facturas\b/.test(fuente), false,
        `${archivo} todavía usa un nombre del traductor`);
    }
    assert.match(detalle, /cliente\.detalle\.map/);
    assert.match(detalle, /totalSaldo=\{cliente\.saldoTotal\}/);
    assert.match(modal, /facturaId: factura\.id,/);
    assert.match(modal, /Factura #\$\{factura\.numero\}/);
  });

  test('registrar un abono sigue mandando el id de la factura como `facturaId`', () => {
    // Ese es el nombre del CONTRATO del servidor para el cobro; lo que cambió
    // es de dónde sale (`factura.id`), no cómo se manda.
    const hook = leer('hooks', 'useCuentasPorCobrar.js');
    assert.match(hook, /await registrarAbono\(\{ facturaId, monto, fecha, metodoPagoId, referencia, saldarTotal \}\)/);
    assert.match(hook, /setCartera\(conVencimiento\(result\?\.data \|\| \[\]\)\)/);
  });
});
