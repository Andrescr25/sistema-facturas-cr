const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Cómo se lee una línea de la bitácora en pantalla.
 *
 * El archivo es un módulo del frontend; se carga acá con `new Function`,
 * igual que `rentabilidadFormato.js`. Por eso no puede tener imports.
 */
const RUTA = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'bitacoraFormato.js');
const FUENTE = fs.readFileSync(RUTA, 'utf8');
const m = new Function(`${FUENTE.replace(/^export /gm, '')}; return { fechaHora, nombreDeCampo, valorLegible, frase, tonoDeAccion };`)();

describe('la fecha de una línea', () => {
  test('se muestra la hora guardada, sin correrla de zona', () => {
    assert.equal(m.fechaHora('2031-03-10 09:15:00'), '10 mar 2031, 9:15 a. m.');
    assert.equal(m.fechaHora('2026-09-29 22:19:58'), '29 sept 2026, 10:19 p. m.');
    // Las 23:40 del 10 son del 10: con `new Date()` en un servidor en UTC
    // esta línea aparecería el 11.
    assert.equal(m.fechaHora('2031-03-10 23:40:00'), '10 mar 2031, 11:40 p. m.');
    assert.equal(m.fechaHora('2031-12-01 00:05:00'), '1 dic 2031, 12:05 a. m.');
    assert.equal(m.fechaHora('2031-06-15 12:00:00'), '15 jun 2031, 12:00 p. m.');
  });

  test('algo que no es una fecha no revienta la pantalla', () => {
    for (const raro of [null, undefined, '', 'ayer', 12]) assert.equal(m.fechaHora(raro), '');
  });
});

describe('los campos y sus valores', () => {
  test('los campos conocidos tienen nombre; los demás se leen de su nombre técnico', () => {
    assert.equal(m.nombreDeCampo('precio_sin_iva'), 'Precio sin IVA');
    assert.equal(m.nombreDeCampo('subcategoria_id'), 'Subcategoría');
    assert.equal(m.nombreDeCampo('otras_senas'), 'Otras senas');
    assert.equal(m.nombreDeCampo('proveedor_id'), 'Proveedor');
    assert.equal(m.nombreDeCampo(''), '');
  });

  test('sí y no en vez de true y false; una raya donde no había nada', () => {
    assert.deepEqual(['true', 'false', null, '', '1200'].map(m.valorLegible), ['Sí', 'No', '—', '—', '1200']);
  });
});

describe('la línea', () => {
  test('dice quién, qué hizo y sobre qué; sin nombre, el número del registro', () => {
    const linea = { usuarioNombre: 'José Andrés', accionVerbo: 'editó', entidadNombre: 'Producto', titulo: 'TUBO PVC 1/2', entidadId: '12' };
    assert.equal(m.frase(linea), 'José Andrés editó · Producto TUBO PVC 1/2');
    assert.equal(m.frase({ ...linea, titulo: null }), 'José Andrés editó · Producto #12');
  });

  test('el tono usa los roles de color del sistema, y anular o borrar se ven distinto', () => {
    assert.match(m.tonoDeAccion('crear'), /exito/);
    assert.match(m.tonoDeAccion('editar'), /primario/);
    for (const a of ['anular', 'borrar', 'desactivar']) assert.match(m.tonoDeAccion(a), /peligro/);
    assert.match(m.tonoDeAccion('algo nuevo'), /neutro/);
  });

  test('el archivo no tiene imports: esta prueba lo carga con new Function', () => {
    assert.doesNotMatch(FUENTE, /^import /m);
  });
});

describe('la pantalla está donde la protege la regla de administradores', () => {
  const frente = path.join(__dirname, '..', '..', 'frontend', 'src');
  const leer = (...p) => fs.readFileSync(path.join(frente, ...p), 'utf8');

  test('la ruta cuelga de /usuarios, en el menú y en las rutas', () => {
    assert.match(leer('App.jsx'), /path="\/usuarios\/bitacora"/);
    assert.match(leer('components', 'Layout.jsx'), /href: '\/usuarios\/bitacora'[^}]*soloAdmin: true/);
    // El espejo del frontend deja fuera de /usuarios a quien no es admin.
    assert.match(leer('utils', 'modulos.js'), /RUTAS_ADMIN = \['\/usuarios'\]/);
  });

  test('la pantalla no escribe: solo pide lecturas', () => {
    for (const archivo of [['hooks', 'useBitacora.js'], ['pages', 'Bitacora.jsx'], ['components', 'bitacora', 'TarjetaLinea.jsx'], ['components', 'bitacora', 'DetalleLinea.jsx']]) {
      assert.doesNotMatch(leer(...archivo), /api\.(post|put|patch|delete)\(/, `${archivo.join('/')} escribe`);
    }
  });
});
