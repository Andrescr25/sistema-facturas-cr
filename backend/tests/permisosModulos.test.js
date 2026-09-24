/**
 * Tests del catálogo de módulos y de la autorización por módulo.
 *
 * POR QUÉ IMPORTAN
 * Esto decide quién ve la deuda de cada cliente, la rentabilidad y el reporte
 * del contador. Un error acá no se nota mirando la pantalla —el menú se ve
 * bien— y solo aparece el día que alguien llama la API a mano.
 *
 * El test que compara las dos listas de módulos (backend y frontend) está
 * para un problema que YA pasó en este sistema: la misma regla escrita en
 * cuatro lugares, arreglada de a uno, con dos idas y vueltas del usuario.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  MODULOS, CLAVES, COMPARTIDAS, porGrupo, clasificarRuta, moduloDeRuta, esCompartida, esRutaAdmin
} = require('../src/modules/usuarios/modulos');

describe('catálogo de módulos', () => {
  test('no hay claves repetidas', () => {
    assert.equal(new Set(CLAVES).size, CLAVES.length);
  });

  test('todo módulo tiene clave, nombre, grupo y ruta', () => {
    for (const m of MODULOS) {
      assert.ok(m.clave && m.nombre && m.grupo && m.ruta, `incompleto: ${JSON.stringify(m)}`);
      assert.ok(Array.isArray(m.rutasApi), `${m.clave} sin rutasApi`);
    }
  });

  test('ningún prefijo de API pertenece a dos módulos', () => {
    const vistos = new Map();
    for (const m of MODULOS) {
      for (const p of m.rutasApi) {
        assert.equal(vistos.has(p), false, `"${p}" está en ${vistos.get(p)} y en ${m.clave}`);
        vistos.set(p, m.clave);
      }
    }
  });

  test('ningún prefijo de módulo termina clasificado como compartido', () => {
    // Un prefijo de módulo PUEDE vivir debajo de uno compartido
    // ('/alegra/catalog' bajo '/alegra'): gana el más específico. Lo que no
    // puede pasar es que el propio prefijo del módulo resuelva a compartida.
    for (const m of MODULOS) {
      for (const p of m.rutasApi) {
        assert.equal(esCompartida(p), false, `"${p}" (${m.clave}) quedaría abierto por estar en COMPARTIDAS`);
      }
    }
  });

  test('porGrupo devuelve todos los módulos, sin perder ninguno', () => {
    const total = porGrupo().reduce((s, g) => s + g.modulos.length, 0);
    assert.equal(total, MODULOS.length);
  });
});

describe('moduloDeRuta — a qué módulo pertenece cada llamada', () => {
  test('encuentra el módulo por su prefijo', () => {
    assert.equal(moduloDeRuta('/rentabilidad'), 'rentabilidad');
    assert.equal(moduloDeRuta('/reporte-contador/resumen'), 'reporte-contador');
    assert.equal(moduloDeRuta('/cuentas-por-cobrar/abonos'), 'cuentas-por-cobrar');
  });

  test('un prefijo no es lo mismo que un prefijo de texto', () => {
    // '/rentabilidad-secreta' NO debe resolver a 'rentabilidad': si lo
    // hiciera, una ruta nueva heredaría permisos sin que nadie lo decida.
    assert.equal(moduloDeRuta('/rentabilidad-secreta'), null);
  });

  test('una ruta sin dueño devuelve null', () => {
    assert.equal(moduloDeRuta('/algo-que-no-existe'), null);
  });

  test('los módulos con datos de plata SÍ están mapeados', () => {
    // Son los que no pueden quedar sin protección por descuido.
    for (const clave of ['rentabilidad', 'reporte-contador', 'cuentas-por-cobrar', 'pagos-proveedores']) {
      const m = MODULOS.find(x => x.clave === clave);
      assert.ok(m.rutasApi.length > 0, `${clave} no tiene rutasApi: quedaría abierto`);
    }
  });
});

describe('rutas compartidas y de administrador', () => {
  test('las compartidas se reconocen, con y sin subruta', () => {
    assert.equal(esCompartida('/alegra'), true);
    assert.equal(esCompartida('/alegra/contactos/buscar'), true);
    assert.equal(esCompartida('/auth/yo'), true);
  });

  test('Gestión de Catálogo es dueña de /alegra/catalog aunque viva debajo de /alegra', () => {
    // El agujero: '/alegra' compartida ganaba primero, y cualquiera con sesión
    // podía borrar productos o cambiar categorías en Alegra en lote.
    assert.equal(esCompartida('/alegra/catalog/productos/1031'), false);
    assert.equal(moduloDeRuta('/alegra/catalog/productos/1031'), 'gestion-catalogo');
    assert.equal(moduloDeRuta('/alegra/catalog/productos/categoria-lote'), 'gestion-catalogo');
    assert.equal(moduloDeRuta('/alegra/catalog/subcategorias/9/mover-categoria'), 'gestion-catalogo');
  });

  test('Facturas en Bodega es dueña de /alegra/bodega aunque viva debajo de /alegra', () => {
    // La pantalla de bodega llama ahí; estaba abierta a cualquiera con sesión.
    assert.equal(moduloDeRuta('/alegra/bodega/facturas'), 'facturas-bodega');
    assert.equal(moduloDeRuta('/alegra/bodega/facturas/123/estado'), 'facturas-bodega');
    assert.equal(moduloDeRuta('/alegra/bodega/facturas/123/estados'), 'facturas-bodega');
  });

  test('lo que otras pantallas leen de /alegra/catalog sigue compartido', () => {
    // Relacionar Productos sugiere fotos, Bodega pinta la foto de cada línea.
    for (const ruta of [
      '/alegra/catalog/search-images',
      '/alegra/catalog/imagenes-por-referencia',
      '/alegra/catalog/image-proxy'
    ]) {
      assert.equal(esCompartida(ruta), true, ruta);
      assert.equal(moduloDeRuta(ruta), null, ruta);
    }
  });

  test('gana el prefijo más específico, sea de módulo o compartido', () => {
    assert.equal(clasificarRuta('/alegra/items').tipo, 'compartida');
    assert.equal(clasificarRuta('/alegra/catalog/arbol').clave, 'gestion-catalogo');
    assert.equal(clasificarRuta('/alegra/catalog/search-images').tipo, 'compartida');
    assert.equal(clasificarRuta('/no-existe'), null);
  });

  test('una ruta parecida a una compartida NO pasa por compartida', () => {
    assert.equal(esCompartida('/alegra-privado'), false);
  });

  test('/usuarios exige administrador', () => {
    assert.equal(esRutaAdmin('/usuarios'), true);
    assert.equal(esRutaAdmin('/usuarios/4'), true);
    assert.equal(esRutaAdmin('/usuariosfalso'), false);
  });

  test('ningún módulo se llama igual que una ruta compartida', () => {
    for (const p of COMPARTIDAS) assert.equal(moduloDeRuta(p), null);
  });
});

describe('el espejo del frontend no se separa del backend', () => {
  const rutaEspejo = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'modulos.js');

  test('las rutas de solo-admin también están en el espejo', () => {
    // Este test nace de un bug real: /usuarios no es un módulo del catálogo,
    // así que puedeVer() lo trataba como ruta interna y CUALQUIER usuario
    // podía abrir la pantalla de gestión de usuarios escribiendo la URL. La
    // API la rechazaba (403), pero la pantalla se abría igual.
    const { RUTAS_ADMIN } = require('../src/modules/usuarios/modulos');
    const fuente = fs.readFileSync(rutaEspejo, 'utf8');

    for (const ruta of RUTAS_ADMIN) {
      assert.ok(
        fuente.includes(`'${ruta}'`),
        `la ruta de administrador "${ruta}" no está en el espejo del frontend: quedaría abierta`
      );
    }
  });

  test('las claves de módulo son las mismas de los dos lados', () => {
    // El frontend necesita íconos y rutas de React, que no pueden viajar
    // desde el backend, así que mantiene su propia lista. Lo que NO puede
    // pasar es que las claves se separen: ahí el menú mostraría módulos que
    // el backend no reconoce, o al revés.
    const ruta = path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'modulos.js');
    const fuente = fs.readFileSync(ruta, 'utf8');

    const delFrontend = [...fuente.matchAll(/clave:\s*'([a-z0-9-]+)'/g)].map(m => m[1]);
    assert.ok(delFrontend.length > 0, 'no se encontró ninguna clave en el espejo del frontend');

    assert.deepEqual(
      [...delFrontend].sort(),
      [...CLAVES].sort(),
      'las listas de módulos del backend y del frontend se separaron'
    );
  });
});

describe('una pantalla solo pide rutas de su módulo o compartidas', () => {
  /**
   * Las rutas que llama un archivo del frontend, hasta el primer `${` o `?`.
   * Alcanza con el prefijo: el dueño de una ruta lo decide el prefijo más
   * largo que calza.
   */
  function rutasQueLlama(archivo) {
    const fuente = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', archivo), 'utf8');
    return [...fuente.matchAll(/api\.(?:get|post|put|patch|delete)\(\s*[`'"](\/[^`'"$?]*)/g)].map((m) => m[1]);
  }

  test('Facturación no depende de tener el módulo Catálogo ni Clientes', () => {
    // Pasó en la rama de la migración: Facturación cargaba los productos de
    // /maestro (Gestión de Catálogo) y los clientes de /clientes (Clientes).
    // Un cajero con solo Facturación —hay uno— recibía 403 y la pantalla se
    // quedaba sin productos que vender. Lo que Facturación lee de otros
    // módulos va por /catalogos, que es compartida.
    const { moduloDeRuta } = require('../src/modules/usuarios/modulos');
    const ajenas = ['services/facturacionService.js', 'hooks/useFacturacion.js']
      .flatMap((a) => rutasQueLlama(a).map((r) => ({ a, r, m: moduloDeRuta(r) })))
      .filter(({ m }) => m && m !== 'facturacion')
      .map(({ a, r, m }) => `${a}: ${r} es del módulo "${m}"`);
    assert.deepEqual(ajenas, []);
  });
});
