/**
 * La búsqueda de Facturación no puede esconder resultados en silencio.
 *
 * EL BUG
 * Mostraba los primeros 10 y nada más. En un catálogo de 2.009 productos eso
 * significaba que buscar "anzuelo" —que tiene 26— devolvía diez y los otros
 * dieciséis simplemente no existían para quien facturaba. No había ninguna
 * señal de que faltaran: la lista terminaba y ya.
 *
 * Se sube el tope a 100 y, cuando sobra, se dice. No se quita del todo
 * porque los términos de dos letras son masivos ("an" cae en 565 productos)
 * y pintarlos en cada tecla arrastra la tableta del mostrador.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const hook = fs.readFileSync(path.join(FRONT, 'hooks', 'useFacturacion.js'), 'utf8');
const productos = fs.readFileSync(path.join(FRONT, 'components', 'facturacion', 'AgregarProductos.jsx'), 'utf8');
const cliente = fs.readFileSync(path.join(FRONT, 'components', 'facturacion', 'PasoCliente.jsx'), 'utf8');

describe('el tope de resultados', () => {
  test('existe y está muy por encima de los 10 de antes', () => {
    const m = hook.match(/const MAX_RESULTADOS = (\d+)/);
    assert.ok(m, 'debe haber una constante con el tope, no un número suelto');
    const tope = Number(m[1]);
    assert.ok(tope >= 100,
      `el tope es ${tope}; con 81 productos en la búsqueda real más grande ("bolsa"), por debajo de 100 vuelve a recortar`);
  });

  test('ya no queda ningún slice(0, 10) en las búsquedas', () => {
    assert.ok(!/slice\(0,\s*10\)/.test(hook),
      'el recorte a diez era el bug; debe usarse MAX_RESULTADOS');
  });

  test('las dos búsquedas usan el mismo tope', () => {
    const usos = hook.match(/slice\(0, MAX_RESULTADOS\)/g) || [];
    assert.equal(usos.length, 2, 'productos y clientes, los dos');
  });
});

describe('cuando sobran resultados, se dice', () => {
  test('el hook publica cuántos hay de verdad', () => {
    // Sin el total no hay forma de saber que el tope recortó.
    assert.match(hook, /setTotalProductosEncontrados\(encontrados\.length\)/);
    assert.match(hook, /setTotalClientesEncontrados\(encontrados\.length\)/);
    assert.match(hook, /^\s*totalProductosEncontrados,$/m);
    assert.match(hook, /^\s*totalClientesEncontrados,$/m);
  });

  // Una escribe el aviso con plantilla de texto y la otra con llaves JSX;
  // lo que importa es que diga cuántos hay y use el total, no la sintaxis.
  test('la pantalla de productos avisa que hay más', () => {
    assert.match(productos, /Mostrando/);
    assert.match(productos, /totalProductosEncontrados/);
    assert.match(productos, /const ocultos = Math\.max\(0, totalProductosEncontrados - productosEncontrados\.length\)/);
  });

  test('la de clientes también', () => {
    assert.match(cliente, /Mostrando/);
    assert.match(cliente, /totalClientesEncontrados/);
    assert.match(cliente, /const ocultos = Math\.max\(0, totalClientesEncontrados - clientesEncontrados\.length\)/);
  });
});

describe('la lista se puede recorrer', () => {
  test('los resultados tienen su propia caja con desplazamiento', () => {
    // La queja fue "solo me deja hacer scroll con como 10 productos": la
    // lista tiene que desplazarse dentro de sí misma, no empujar la página.
    for (const [nombre, texto] of [['productos', productos], ['clientes', cliente]]) {
      assert.match(texto, /overflow-y-auto/, `${nombre}: la lista debe desplazarse sola`);
      assert.match(texto, /max-h-\[60vh\]/, `${nombre}: y estar acotada en alto`);
    }
  });
});
