const test = require('node:test');
const assert = require('node:assert');
const { registrarCambio, diferencias } = require('../src/utils/bitacora');

/**
 * La bitácora reemplaza el historial que hoy lleva Alegra. Tiene que decir
 * la verdad: solo lo que cambió, y nada cuando no cambió nada.
 */

function ejecutorDoble() {
  const consultas = [];
  return {
    consultas,
    query: async (sql, params) => { consultas.push({ sql, params }); return { rows: [{ id: '17' }] }; }
  };
}

test('diferencias devuelve solo los campos que cambiaron', () => {
  const antes = { nombre: 'TORNILLO 3/4', precio: 800, categoria: 'Ferretería', updated_at: '2026-09-01' };
  const despues = { nombre: 'TORNILLO 3/4', precio: 900, categoria: 'Ferretería', updated_at: '2026-09-11' };
  assert.deepEqual(diferencias(antes, despues), { precio: [800, 900] });
});

test('un campo que aparece o desaparece cuenta como cambio', () => {
  assert.deepEqual(diferencias({ correo: null }, { correo: 'a@b.cr' }), { correo: [null, 'a@b.cr'] });
  assert.deepEqual(diferencias({ telefono: '8888' }, {}), { telefono: ['8888', null] });
});

test('una edición que no cambia nada no deja línea', async () => {
  const db = ejecutorDoble();
  const id = await registrarCambio(db, {
    entidad: 'producto', entidadId: 1183, accion: 'editar',
    antes: { precio: 800, updated_at: 'a' }, despues: { precio: 800, updated_at: 'b' }, usuarioId: 4
  });
  assert.equal(id, null);
  assert.equal(db.consultas.length, 0);
});

test('una edición real guarda antes, después y solo lo cambiado', async () => {
  const db = ejecutorDoble();
  const id = await registrarCambio(db, {
    entidad: 'producto', entidadId: 1183, accion: 'editar',
    antes: { precio: 800, impuesto: 0 }, despues: { precio: 800, impuesto: 13 }, usuarioId: 4, motivo: 'faltaba el IVA'
  });
  assert.equal(id, 17);
  const [entidad, entidadId, accion, antes, despues, cambios, usuario, motivo] = db.consultas[0].params;
  assert.deepEqual([entidad, entidadId, accion, usuario, motivo], ['producto', '1183', 'editar', 4, 'faltaba el IVA']);
  assert.deepEqual(JSON.parse(cambios), { impuesto: [0, 13] });
  assert.deepEqual(JSON.parse(antes), { precio: 800, impuesto: 0 });
  assert.deepEqual(JSON.parse(despues), { precio: 800, impuesto: 13 });
});

test('crear y anular se registran siempre, sin calcular diferencias', async () => {
  const db = ejecutorDoble();
  await registrarCambio(db, { entidad: 'cliente', entidadId: 'c-9', accion: 'crear', despues: { nombre: 'Pulpería' } });
  await registrarCambio(db, { entidad: 'factura', entidadId: 55, accion: 'anular', antes: { total: 1000 }, motivo: 'error' });
  assert.equal(db.consultas.length, 2);
  assert.equal(db.consultas[0].params[5], null, 'crear no calcula cambios');
  assert.equal(db.consultas[1].params[7], 'error');
});

test('usa el ejecutor que le pasan, para quedar dentro de la transacción', async () => {
  const transaccion = ejecutorDoble();
  await registrarCambio(transaccion, { entidad: 'pago', entidadId: 3, accion: 'crear', despues: { monto: 5 } });
  assert.equal(transaccion.consultas.length, 1);
});

test('sin entidad, id o acción no se inventa una línea', async () => {
  const db = ejecutorDoble();
  for (const faltante of [{ entidadId: 1, accion: 'crear' }, { entidad: 'x', accion: 'crear' }, { entidad: 'x', entidadId: 1 }, { entidad: 'x', entidadId: '', accion: 'crear' }]) {
    await assert.rejects(registrarCambio(db, faltante), /hacen falta/);
  }
  assert.equal(db.consultas.length, 0);
});

test('el usuario del token llega como texto y se guarda como número', async () => {
  // req.usuario.id sale del `sub` del JWT: es "4", no 4.
  const db = ejecutorDoble();
  await registrarCambio(db, { entidad: 'cliente', entidadId: 1, accion: 'crear', despues: {}, usuarioId: '4' });
  assert.strictEqual(db.consultas[0].params[6], 4);
  for (const malo of ['andres', '4.5', '-1', '0']) {
    await assert.rejects(
      registrarCambio(db, { entidad: 'cliente', entidadId: 1, accion: 'crear', usuarioId: malo }),
      /usuarioId inválido/, malo
    );
  }
  assert.equal(db.consultas.length, 1, 'con un usuario inválido no se escribe nada');
});

test('guarda de verdad contra la base local', { skip: !process.env.PROBAR_BASE_LOCAL }, async () => {
  const { pool } = require('../config/database');
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const id = await registrarCambio(cliente, {
      entidad: 'producto', entidadId: 'prueba', accion: 'editar', antes: { precio: 1 }, despues: { precio: 2 }
    });
    const r = await cliente.query('SELECT cambios FROM bitacora_cambio WHERE id = $1', [id]);
    assert.deepEqual(r.rows[0].cambios, { precio: [1, 2] });
  } finally {
    await cliente.query('ROLLBACK');
    cliente.release();
  }
});
