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
  MODULOS, CLAVES, COMPARTIDAS, ACCIONES_ADMIN, porGrupo, clasificarRuta, moduloDeRuta, esCompartida, esRutaAdmin,
  accionDeAdmin, normalizarRuta
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
    // ('/reportes/faltantes/cliente/exportar' bajo '/reportes'): gana el más
    // específico. Lo que no puede pasar es que el propio prefijo del módulo
    // resuelva a compartida.
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
    assert.equal(esCompartida('/reportes'), true);
    assert.equal(moduloDeRuta('/reportes/faltantes/notas'), 'reporte-proveedores');
    assert.equal(esCompartida('/auth/yo'), true);
  });

  test('Gestión de Catálogo es dueña de /maestro: editar el catálogo pide su permiso', () => {
    // El catálogo es el maestro propio. La Gestión de Catálogo vieja vivía en
    // '/alegra/catalog' y hubo que blindarla porque '/alegra' es compartida:
    // cualquiera con sesión podía borrar productos o cambiar categorías en
    // Alegra en lote. Ese módulo se retiró el 2026-10-04: no queda nada que
    // blindar ahí (que no se monte está en taxonomiaTablas.test.js).
    assert.equal(esCompartida('/maestro/productos/1031'), false);
    assert.equal(moduloDeRuta('/maestro/productos/1031'), 'gestion-catalogo');
    assert.equal(moduloDeRuta('/maestro/lote/categoria'), 'gestion-catalogo');
    assert.equal(moduloDeRuta('/maestro/subcategorias/9/mover'), 'gestion-catalogo');
    assert.equal(moduloDeRuta('/maestro/productos/siguiente-referencia'), 'gestion-catalogo');
  });

  test('Bodega, los ajustes de entrega y la orden de compra tienen dueño', () => {
    // Las tres colgaron de '/alegra', compartida, y estuvieron abiertas a
    // cualquiera con sesión. Cada una en su prefijo, con el módulo de la
    // pantalla que la usa.
    assert.equal(moduloDeRuta('/bodega/facturas-propias'), 'facturas-bodega');
    assert.equal(moduloDeRuta('/bodega/facturas-propias/123/estado'), 'facturas-bodega');
    assert.equal(moduloDeRuta('/faltantes/ajustes'), 'reporte-clientes');
    assert.equal(moduloDeRuta('/faltantes/ajustes/33'), 'reporte-clientes');
    assert.equal(moduloDeRuta('/orden-compra/enviar-whatsapp'), 'reporte-proveedores');
    assert.equal(moduloDeRuta('/orden-compra/cantidades'), 'reporte-proveedores');
    assert.equal(moduloDeRuta('/reimpresion/facturas/9/procesar'), 'impresion');
  });

  test("'/alegra' ya no es un prefijo de nadie", () => {
    // Era el de un router que juntaba media aplicación, y compartirlo entero
    // dejó sin permiso, en distintos momentos, seis módulos.
    const { COMPARTIDAS } = require('../src/modules/usuarios/modulos');
    assert.equal(COMPARTIDAS.some(p => p.startsWith('/alegra')), false);
    assert.equal(MODULOS.some(m => m.rutasApi.some(p => p.startsWith('/alegra'))), false);
    assert.equal(clasificarRuta('/alegra/bodega/facturas-propias'), null);
  });

  test('las fotos que usan varias pantallas van por /catalogos, compartida', () => {
    // Relacionar Productos y la ficha de producto sugieren fotos; Bodega pinta
    // la foto de cada línea. Solo lecturas, y ninguna es de un módulo.
    for (const ruta of [
      '/catalogos/imagenes-sugeridas',
      '/catalogos/imagen-proxy',
      '/catalogos/imagenes-por-referencia'
    ]) {
      assert.equal(esCompartida(ruta), true, ruta);
      assert.equal(moduloDeRuta(ruta), null, ruta);
    }
  });

  test('gana el prefijo más específico, sea de módulo o compartido', () => {
    assert.equal(clasificarRuta('/reportes/faltantes/notas').clave, 'reporte-proveedores');
    // Un módulo dueño de un pedazo de un prefijo compartido.
    assert.equal(clasificarRuta('/reportes/faltantes/cliente').clave, 'reporte-clientes');
    assert.equal(clasificarRuta('/reportes/faltantes/cliente/exportar').clave, 'reporte-clientes');
    assert.equal(clasificarRuta('/reportes/faltantes/proveedor/exportar').clave, 'reporte-proveedores');
    assert.equal(clasificarRuta('/no-existe'), null);
  });

  test('una ruta parecida a una compartida NO pasa por compartida', () => {
    assert.equal(esCompartida('/reportes-privado'), false);
    assert.equal(esCompartida('/catalogosx'), false);
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

describe('cada prefijo montado en server.js está clasificado', () => {
  // Una ruta sin clasificar pasa para cualquiera con sesión (ver
  // permisos.middleware.js). Eso es una red para no romper pantallas, no una
  // forma de decidir: un módulo nuevo montado sin dueño quedaría abierto a
  // todos sin que nadie lo haya elegido.
  const { PUBLICAS, PUBLICAS_EXACTAS } = require('../src/modules/auth/auth.middleware');
  const servidor = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const montados = [...new Set([...servidor.matchAll(/app\.use\(\s*['"`]\/api(\/[^'"`]+)['"`]/g)].map(m => m[1]))];

  const publica = (ruta) => PUBLICAS.some(p => ruta === p || ruta.startsWith(`${p}/`)) ||
    PUBLICAS_EXACTAS.some(p => p === ruta || p.startsWith(`${ruta}/`));

  test('se encuentran los prefijos (la expresión sigue leyendo server.js)', () => {
    assert.ok(montados.length >= 25, `solo se leyeron ${montados.length} prefijos`);
    assert.ok(montados.includes('/facturacion') && montados.includes('/usuarios'));
  });

  test('cada uno es de un módulo, compartido, de administrador o público', () => {
    const sinClasificar = montados.filter(ruta => !clasificarRuta(ruta) && !esRutaAdmin(ruta) && !publica(ruta));
    assert.deepEqual(sinClasificar, [],
      `montados sin dueño: ${sinClasificar.join(', ')}. Agregalos a un módulo (rutasApi), a COMPARTIDAS o a RUTAS_ADMIN en usuarios/modulos.js.`);
  });

  test('los módulos nuevos de la migración tienen dueño, no pasan por compartidos', () => {
    // Clientes, productos, caja, notas de crédito y configuración (sección 14).
    assert.equal(moduloDeRuta('/clientes/12'), 'clientes');
    assert.equal(moduloDeRuta('/maestro/productos'), 'gestion-catalogo');
    assert.equal(moduloDeRuta('/cuentas-por-cobrar/propios/caja/cerrar'), 'cuentas-por-cobrar');
    assert.equal(moduloDeRuta('/facturacion/notas-credito'), 'facturacion');
    assert.equal(moduloDeRuta('/configuracion/empresa'), 'configuracion');
    assert.equal(moduloDeRuta('/proveedores/fichas'), 'reporte-proveedores');
    assert.equal(moduloDeRuta('/inventario-auditorias/1'), 'inventario-auditoria');
  });

  test('lo que quedó compartido a propósito son solo lecturas de apoyo', () => {
    assert.equal(esCompartida('/envios-whatsapp/historial'), true);
    const rutas = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'envios-whatsapp', 'envios.routes.js'), 'utf8');
    assert.doesNotMatch(rutas, /router\.(post|put|patch|delete)\(/, '/envios-whatsapp es compartida: ahí no puede haber una ruta que escriba');
  });
});

describe('la ruta se clasifica como la entiende Express', () => {
  // Express no distingue mayúsculas y acepta la barra final. El guardián
  // comparaba el texto tal cual: '/Usuarios' no calzaba con '/usuarios', caía
  // en "sin clasificar" y pasaba. Medido el 2026-10-03 con un usuario común:
  // /api/usuarios daba 403 y /api/Usuarios daba 200.
  test('cambiar mayúsculas no saca a una ruta de su módulo ni de administrador', () => {
    for (const ruta of ['/Usuarios', '/USUARIOS', '/usuarios/', '/Usuarios/4/password', '/USUARIOS//bitacora']) {
      assert.equal(esRutaAdmin(ruta), true, `${ruta} dejó de exigir administrador`);
    }
    assert.equal(moduloDeRuta('/Rentabilidad/resumen'), 'rentabilidad');
    assert.equal(moduloDeRuta('/RENTABILIDAD/'), 'rentabilidad');
    assert.equal(moduloDeRuta('/Reporte-Contador/periodos'), 'reporte-contador');
    assert.equal(moduloDeRuta('/Maestro/Productos'), 'gestion-catalogo');
    assert.equal(moduloDeRuta('/Bodega/Facturas-Propias'), 'facturas-bodega');
    assert.equal(moduloDeRuta('/ORDEN-COMPRA/enviar-whatsapp'), 'reporte-proveedores');
    assert.equal(moduloDeRuta('/Cuentas-Por-Cobrar/propios/deudores'), 'cuentas-por-cobrar');
  });

  test('una ruta codificada se clasifica por lo que dice', () => {
    assert.equal(esRutaAdmin('/%55suarios'), true);
    assert.equal(moduloDeRuta('/%72entabilidad/resumen'), 'rentabilidad');
    // Un % suelto no es una codificación válida: no revienta.
    assert.equal(moduloDeRuta('/rentabilidad/%'), 'rentabilidad');
  });

  test('lo compartido sigue compartido, y lo parecido sigue sin serlo', () => {
    assert.equal(moduloDeRuta('/Reportes/Faltantes/notas'), 'reporte-proveedores');
    assert.equal(esCompartida('/Reportes/'), true);
    assert.equal(moduloDeRuta('/usuariosx'), null);
    assert.equal(esRutaAdmin('/usuariosx'), false);
    assert.equal(normalizarRuta('/'), '/');
    assert.equal(normalizarRuta('/Facturacion//Facturas/12/'), '/facturacion/facturas/12');
  });

  test('ningún prefijo del registro tiene mayúsculas: se comparan contra la ruta en minúsculas', () => {
    const todos = [...MODULOS.flatMap(m => m.rutasApi), ...COMPARTIDAS];
    assert.deepEqual(todos.filter(p => p !== p.toLowerCase()), []);
  });
});

describe('acciones que exigen administrador aunque se tenga el módulo', () => {
  // Decisión del usuario, 2026-10-03: anular facturas y cobros, y reabrir una
  // caja ya cerrada. Notas de crédito, editar una factura y cerrar la caja NO.
  test('las acciones de administrador, por su método y su ruta', () => {
    assert.equal(accionDeAdmin('PATCH', '/facturacion/facturas/5482/anular').clave, 'anular-factura');
    assert.equal(accionDeAdmin('PATCH', '/cuentas-por-cobrar/propios/abonos/7/anular').clave, 'anular-cobro');
    assert.equal(accionDeAdmin('POST', '/cuentas-por-cobrar/propios/caja/reabrir').clave, 'reabrir-caja');
    assert.deepEqual(ACCIONES_ADMIN.map(a => a.clave), ['anular-factura', 'anular-cobro', 'reabrir-caja', 'corregir-entrega']);
  });

  test('tampoco se saltan con mayúsculas, la barra final o el método en minúscula', () => {
    assert.equal(accionDeAdmin('patch', '/Facturacion/Facturas/12/ANULAR/').clave, 'anular-factura');
    assert.equal(accionDeAdmin('post', '/Cuentas-Por-Cobrar/propios/caja/REABRIR').clave, 'reabrir-caja');
    assert.equal(accionDeAdmin('PATCH', '/cuentas-por-cobrar/propios/abonos/7/anular/').clave, 'anular-cobro');
  });

  test('lo que el usuario dejó en manos del módulo sigue ahí', () => {
    for (const [metodo, ruta] of [
      ['POST', '/facturacion/notas-credito'],
      ['PATCH', '/facturacion/notas-credito/3/anular'],
      ['PUT', '/facturacion/facturas/12'],
      ['POST', '/cuentas-por-cobrar/propios/caja/cerrar'],
      ['POST', '/cuentas-por-cobrar/propios/abonos'],
      ['GET', '/facturacion/facturas/12'],
      ['GET', '/facturacion/facturas/12/anular'],
      ['POST', '/reimpresion/facturas/12/procesar'],
      ['POST', '/pagos-proveedores/pagos/4/anular']
    ]) {
      assert.equal(accionDeAdmin(metodo, ruta), null, `${metodo} ${ruta} quedó solo para administradores`);
    }
  });

  test('cada acción apunta a una ruta que existe, con ese método', () => {
    // Si alguien renombra la ruta, la acción quedaría protegiendo nada.
    const leer = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', ...p), 'utf8');
    assert.match(leer('facturacion', 'facturacion.routes.js'), /router\.patch\('\/facturas\/:id\/anular'/);
    const cxc = leer('cuentas-por-cobrar', 'cuentas-por-cobrar.routes.js');
    assert.match(cxc, /router\.patch\('\/propios\/abonos\/:id\/anular'/);
    assert.match(cxc, /router\.post\('\/propios\/caja\/reabrir'/);
  });

  test('el espejo del frontend tiene las mismas claves', () => {
    const espejo = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'modulos.js'), 'utf8');
    const lista = espejo.match(/ACCIONES_SOLO_ADMIN = \[([^\]]*)\]/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
    assert.deepEqual(lista, ACCIONES_ADMIN.map(a => a.clave));
  });

  test('las pantallas preguntan antes de dibujar el botón', () => {
    const frente = path.join(__dirname, '..', '..', 'frontend', 'src', 'components');
    assert.match(fs.readFileSync(path.join(frente, 'facturacion', 'VistaFactura.jsx'), 'utf8'), /puedeAccion\(usuario, 'anular-factura'\)/);
    assert.match(fs.readFileSync(path.join(frente, 'cuentas-por-cobrar', 'PanelCierreCaja.jsx'), 'utf8'), /puedeAccion\(usuario, 'reabrir-caja'\)/);
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
