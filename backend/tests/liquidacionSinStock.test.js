const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const servicio = fs.readFileSync(path.join(__dirname,'../src/modules/inventario-auditorias/inventario-auditorias.service.js'),'utf8');
const servidor = fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
test('los excesos y descuentos solo cambian por acción de una persona', () => {
  assert.doesNotMatch(servidor,/generarTandaDeExcesos|iniciarRevisionSemanalExcesos/);
  assert.doesNotMatch(servicio,/DESCUENTO_INCREMENTO|revisionSemanalDeExcesos|generarExcesosSemanales/);
});
test('la aplicación no consulta una API externa para depurar stock', () => {
  assert.doesNotMatch(servicio,/integrations\/alegra|alegra_products_cache|venta_items/);
});
// Reglas reales de stock, empaque, porcentaje 0 y alta sin escalada:
// auditoriasPropias.test.js, con producto propio sin id externo y ROLLBACK.
