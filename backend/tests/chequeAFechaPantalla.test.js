const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { sinComentarios } = require('./dobles/sinComentarios');

/**
 * Cheques a fecha en la pantalla de Pagos a Proveedores (2026-11-03): las
 * reglas puras de utils/chequeAFecha.js y que solo Pagos a Proveedores enciende
 * el cheque a fecha en el modal compartido.
 */

const cargar = () => import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/utils/chequeAFecha.js')));
const leer = (...p) => sinComentarios(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...p), 'utf8'));
const CHEQUE = { clave: 'cheque' };
const EFECTIVO = { clave: 'efectivo' };

test('solo un Cheque con fecha futura es a fecha; con la de hoy es un pago normal', async () => {
  const { esChequeAFecha } = await cargar();
  assert.equal(esChequeAFecha(CHEQUE, '2026-12-03', '2026-11-03'), true);
  assert.equal(esChequeAFecha(CHEQUE, '2026-11-03', '2026-11-03'), false);
  assert.equal(esChequeAFecha(EFECTIVO, '2026-12-03', '2026-11-03'), false);
  assert.equal(esChequeAFecha(null, '2026-12-03', '2026-11-03'), false);
});

test('la fecha máxima: hoy para un pago, 180 días para un cheque (el mismo tope del servidor)', async () => {
  const { fechaMaximaPago, DIAS_MAXIMOS_CHEQUE } = await cargar();
  assert.equal(DIAS_MAXIMOS_CHEQUE, require('../src/modules/pagos-proveedores/chequesProveedor.service').DIAS_MAXIMOS);
  assert.equal(fechaMaximaPago(EFECTIVO, '2026-11-03'), '2026-11-03');
  assert.equal(fechaMaximaPago(CHEQUE, '2026-11-03'), '2027-05-02');
});

test('lo libre para pagar descuenta los cheques; la nota dice número, monto y fecha', async () => {
  const { saldoLibre, notaCheques } = await cargar();
  assert.equal(saldoLibre({ saldoPendiente: 20000, enCheques: 15000 }), 5000);
  assert.equal(saldoLibre({ saldoPendiente: 20000, enCheques: 25000 }), 0);
  assert.equal(saldoLibre({ saldoPendiente: 100.1, enCheques: 0.05 }), 100.05);
  assert.equal(notaCheques([]), null);
  assert.match(notaCheques([{ numero: '1001', monto: 50000, fechaCobro: '2026-12-03' }]),
    /^Cheque #1001 ₡50[\s.,]?000,00 para el 3 dic\.? 2026 · pendiente de confirmación$/);
});

test('al confirmar se propone el día del cheque, u hoy si se cobró antes; y avisa cuando ya llegó la fecha', async () => {
  const { fechaDeCobro, cuandoSeCobra } = await cargar();
  assert.equal(fechaDeCobro({ fechaCobro: '2026-12-03' }, '2026-11-03'), '2026-11-03');
  assert.equal(fechaDeCobro({ fechaCobro: '2026-11-01' }, '2026-11-03'), '2026-11-01');
  assert.equal(cuandoSeCobra({ fechaCobro: '2026-11-03' }, '2026-11-03').porConfirmar, true);
  assert.equal(cuandoSeCobra({ fechaCobro: '2099-01-01' }, '2026-11-03').porConfirmar, false);
});

test('el modal compartido solo deja cheques a fecha si lo pide Pagos a Proveedores', () => {
  assert.match(leer('components', 'pagos', 'ModalPagoVarias.jsx'), /permiteChequeAFecha = false/);
  assert.match(leer('pages', 'PagosProveedores.jsx'), /permiteChequeAFecha\b/);
  for (const otra of ['ClienteDetalle.jsx', 'GastosOperativos.jsx']) {
    const archivo = otra === 'ClienteDetalle.jsx' ? leer('components', 'cuentas-por-cobrar', otra) : leer('pages', otra);
    assert.doesNotMatch(archivo, /permiteChequeAFecha/, `${otra} no anota cheques a fecha`);
  }
});
