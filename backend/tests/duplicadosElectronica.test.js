const test = require('node:test');
const assert = require('node:assert');
const {
  detectarPares,
  motivoRevisionManual
} = require('../src/modules/duplicados-electronica/duplicados.detector');

// Molde tomado de un par real de producción (5201 electrónica / 5202 copia).
function electronica(over = {}) {
  return {
    id: 5201,
    date: '2026-08-11',
    status: 'open',
    total: 7990,
    totalPaid: 0,
    client: { id: 144, name: 'Andrey Rojas' },
    numberTemplate: { fullNumber: '00100001010000002436', isElectronic: true },
    stamp: { legalStatus: 'STAMPED_AND_ACCEPTED' },
    items: [
      { id: 2024, quantity: 1, price: 885 },
      { id: 36, quantity: 2, price: 1950 },
      { id: 75, quantity: 1, price: 2286 }
    ],
    ...over
  };
}

function copia(over = {}) {
  return {
    id: 5202,
    date: '2026-08-11',
    status: 'open',
    total: 7990,
    totalPaid: 0,
    client: { id: 144, name: 'Andrey Rojas' },
    numberTemplate: { fullNumber: '001000014697', isElectronic: false },
    stamp: null,
    items: [
      { id: 75, quantity: 1, price: 2286 },
      { id: 2024, quantity: 1, price: 885 },
      { id: 36, quantity: 2, price: 1950 }
    ],
    ...over
  };
}

test('detecta el par real y marca cuál se anula', () => {
  const pares = detectarPares([electronica(), copia()]);
  assert.strictEqual(pares.length, 1);
  assert.strictEqual(pares[0].duplicadoId, '5202');
  assert.strictEqual(pares[0].electronicaId, '5201');
  assert.strictEqual(pares[0].limpio, true);
});

test('el orden de los ítems no importa', () => {
  // La copia del molde ya trae los ítems en otro orden que la electrónica.
  assert.strictEqual(detectarPares([copia(), electronica()]).length, 1);
});

// ---- Casos que NO se deben tocar. La consecuencia de un falso positivo es
// ---- anular una factura de venta real, así que pesan más que los positivos.

test('NO empareja dos ventas reales al mismo cliente por el mismo monto', () => {
  // Mismo cliente, mismo total, misma fecha, pero productos distintos.
  const otraVenta = copia({ items: [{ id: 999, quantity: 1, price: 7990 }] });
  assert.deepStrictEqual(detectarPares([electronica(), otraVenta]), []);
});

test('NO toca la copia si la electrónica fue rechazada por Hacienda', () => {
  const rechazada = electronica({ stamp: { legalStatus: 'STAMPED_AND_REJECTED' } });
  assert.deepStrictEqual(detectarPares([rechazada, copia()]), []);
});

test('NO toca la copia si el timbre está pendiente', () => {
  const pendiente = electronica({ stamp: { legalStatus: 'PENDING' } });
  assert.deepStrictEqual(detectarPares([pendiente, copia()]), []);
});

test('NO empareja si la copia es ANTERIOR a la electrónica', () => {
  // La copia nace al convertir, siempre después. Una no electrónica más
  // vieja es una venta distinta que nadie convirtió.
  assert.deepStrictEqual(detectarPares([electronica({ id: 5300 }), copia({ id: 5202 })]), []);
});

test('NO empareja si cambia el monto aunque sea por un colón', () => {
  assert.deepStrictEqual(detectarPares([electronica(), copia({ total: 7991 })]), []);
});

test('NO empareja si cambia la cantidad de un ítem', () => {
  const distinta = copia({ items: [
    { id: 2024, quantity: 1, price: 885 },
    { id: 36, quantity: 3, price: 1950 },
    { id: 75, quantity: 1, price: 2286 }
  ] });
  assert.deepStrictEqual(detectarPares([electronica(), distinta]), []);
});

test('NO empareja facturas de clientes distintos', () => {
  assert.deepStrictEqual(detectarPares([electronica(), copia({ client: { id: 200, name: 'Otro' } })]), []);
});

test('NO empareja si son de fechas distintas', () => {
  assert.deepStrictEqual(detectarPares([electronica(), copia({ date: '2026-08-12' })]), []);
});

test('ignora la copia que ya fue anulada', () => {
  assert.deepStrictEqual(detectarPares([electronica(), copia({ status: 'void' })]), []);
});

test('sin ítems no empareja aunque todo lo demás coincida', () => {
  // Una huella vacía coincide con cualquier otra huella vacía; sin esta
  // guarda, dos facturas sin líneas se emparejarían entre sí.
  assert.deepStrictEqual(detectarPares([electronica({ items: [] }), copia({ items: [] })]), []);
});

// ---- Clasificación para el automatismo

test('con cobro en las dos NO es limpio y explica el doble ingreso', () => {
  const pares = detectarPares([electronica({ totalPaid: 7990 }), copia({ totalPaid: 7990 })]);
  assert.strictEqual(pares[0].limpio, false);
  assert.match(motivoRevisionManual(pares[0]), /contado dos veces/);
});

test('con el cobro solo en la copia avisa que hay que mover el pago', () => {
  const pares = detectarPares([electronica(), copia({ totalPaid: 7990 })]);
  assert.strictEqual(pares[0].limpio, false);
  assert.match(motivoRevisionManual(pares[0]), /mover el pago/);
});

test('un par limpio no tiene motivo de revisión', () => {
  assert.strictEqual(motivoRevisionManual(detectarPares([electronica(), copia()])[0]), null);
});

test('una factura normal suelta, sin gemela electrónica, se ignora', () => {
  assert.deepStrictEqual(detectarPares([copia()]), []);
});
