const { test, after } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Las fotos se migran donde está el disco que las va a servir.
 *
 * 2026-10-10, la noche del corte: con la base de producción ya cargada, lo
 * natural era "migrar las fotos de una vez" desde la computadora. El guion
 * guarda cada foto en el disco de la máquina que lo corre y deja en la base
 * solo la ruta; producción habría quedado apuntando a 1.844 archivos que el
 * servidor no tiene, con todos los catálogos sin foto.
 */
const { pool } = require('../config/database');
const { motivoParaNoCorrer } = require('../scripts/independencia/migrar-fotos');
after(() => pool.end().catch(() => {}));

const REMOTA = 'postgresql://zz:zz@zz-base.example.invalid:6543/postgres';
const LOCAL = 'postgresql://zz:zz@localhost:5434/zz';

test('contra una base remota y sin decir dónde está el disco, no corre', () => {
  assert.match(motivoParaNoCorrer({ DATABASE_URL: REMOTA }), /ALMACENAMIENTO_DIR/);
});

test('en el servidor, con su disco persistente, sí corre', () => {
  assert.equal(motivoParaNoCorrer({ DATABASE_URL: REMOTA, ALMACENAMIENTO_DIR: '/var/data/almacenamiento' }), null);
});

test('contra la copia local sigue corriendo como siempre', () => {
  assert.equal(motivoParaNoCorrer({ DATABASE_URL: LOCAL }), null);
});
