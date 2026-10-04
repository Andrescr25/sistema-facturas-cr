/**
 * Tests del servicio de usuarios y del middleware de permisos.
 *
 * Se sustituyen `config/database` y bcrypt por dobles, cargados en
 * require.cache ANTES de pedir el módulo: la base local ES producción y estos
 * tests crean, editan y borran usuarios.
 *
 * Lo que se fija acá son las reglas que, si se rompen, o dejan a alguien ver
 * lo que no debe, o dejan el sistema sin ningún administrador — que no tiene
 * arreglo desde la pantalla.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const rutaDb = require.resolve('../config/database');
const rutaServicio = require.resolve('../src/modules/usuarios/usuarios.service');
const rutaMiddleware = require.resolve('../src/modules/usuarios/permisos.middleware');

let consultas;

/**
 * @param {object} respuestas  mapa de "trozo del SQL" -> filas a devolver.
 *   La primera coincidencia gana; lo que no coincida devuelve [].
 */
function cargarConDobles(respuestas = {}) {
  for (const r of [rutaDb, rutaServicio, rutaMiddleware]) delete require.cache[r];

  consultas = [];
  require.cache[rutaDb] = {
    id: rutaDb, filename: rutaDb, loaded: true, exports: {
      query: async (sql, params) => {
        consultas.push({ sql, params });
        for (const [trozo, filas] of Object.entries(respuestas)) {
          if (sql.includes(trozo)) return { rows: typeof filas === 'function' ? filas(params) : filas };
        }
        return { rows: [] };
      }
    }
  };

  return {
    servicio: require(rutaServicio),
    middleware: require(rutaMiddleware)
  };
}

const USUARIO = (extra = {}) => ({
  id: 4, usuario: 'andres', nombre: 'José Andrés', activo: true,
  es_admin: false, ultimo_ingreso: null, creado_en: new Date(), ...extra
});

describe('permisosDe — qué ve cada quien', () => {
  test('un admin ve todos los módulos sin tener filas de permisos', async () => {
    const { servicio } = cargarConDobles({ 'FROM usuario WHERE id': [USUARIO({ es_admin: true })] });
    const p = await servicio.permisosDe(4);

    assert.equal(p.esAdmin, true);
    assert.ok(p.modulos.has('rentabilidad'));
    assert.ok(p.modulos.has('reporte-contador'));
    // No se consultó usuario_modulo: el rol alcanza.
    assert.equal(consultas.some(c => c.sql.includes('FROM usuario_modulo')), false);
  });

  test('un usuario común ve solo lo que le dieron', async () => {
    const { servicio } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }, { modulo: 'impresion' }]
    });
    const p = await servicio.permisosDe(4);

    assert.equal(p.esAdmin, false);
    assert.deepEqual([...p.modulos].sort(), ['facturacion', 'impresion']);
    assert.equal(p.modulos.has('rentabilidad'), false);
  });

  test('un usuario desactivado no tiene permisos: devuelve null', async () => {
    const { servicio } = cargarConDobles({ 'FROM usuario WHERE id': [USUARIO({ activo: false })] });
    assert.equal(await servicio.permisosDe(4), null);
  });

  test('un usuario que ya no existe devuelve null', async () => {
    const { servicio } = cargarConDobles({});
    assert.equal(await servicio.permisosDe(999), null);
  });
});

describe('no quedarse sin administrador', () => {
  test('nadie puede quitarse a sí mismo el rol de admin', async () => {
    const { servicio } = cargarConDobles({ 'FROM usuario WHERE id': [USUARIO({ es_admin: true })] });
    await assert.rejects(
      () => servicio.actualizar(4, { esAdmin: false }, 4),
      /No puede quitarse a usted mismo el rol/
    );
  });

  test('nadie puede desactivar su propia cuenta', async () => {
    const { servicio } = cargarConDobles({ 'FROM usuario WHERE id': [USUARIO({ es_admin: true })] });
    await assert.rejects(() => servicio.actualizar(4, { activo: false }, 4), /desactivar su propia cuenta/);
  });

  test('degradar al ÚNICO admin activo se bloquea', async () => {
    const { servicio } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO({ id: 7, es_admin: true })],
      'COUNT(*)::int n FROM usuario WHERE es_admin': [{ n: 0 }]   // no queda otro
    });
    await assert.rejects(() => servicio.actualizar(7, { esAdmin: false }, 4), /único administrador activo/);
  });

  test('degradar a un admin cuando hay otro sí se permite', async () => {
    const { servicio } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO({ id: 7, es_admin: true })],
      'COUNT(*)::int n FROM usuario WHERE es_admin': [{ n: 1 }],
      'UPDATE usuario SET nombre': [USUARIO({ id: 7, es_admin: false })]
    });
    const r = await servicio.actualizar(7, { esAdmin: false }, 4);
    assert.equal(r.esAdmin, false);
  });

  test('nadie puede borrar su propia cuenta', async () => {
    const { servicio } = cargarConDobles({});
    await assert.rejects(() => servicio.eliminar(4, 4), /borrar su propia cuenta/);
  });

  test('borrar al último admin se bloquea', async () => {
    const { servicio } = cargarConDobles({ 'COUNT(*)::int n FROM usuario WHERE es_admin': [{ n: 0 }] });
    await assert.rejects(() => servicio.eliminar(7, 4), /único administrador activo/);
  });
});

describe('validación de los módulos que llegan', () => {
  test('un módulo inventado se rechaza en vez de guardarse', async () => {
    const { servicio } = cargarConDobles({});
    assert.throws(() => servicio.limpiarModulos(['facturacion', 'modulo-que-no-existe']),
      /no existen: modulo-que-no-existe/);
  });

  test('los repetidos se colapsan', async () => {
    const { servicio } = cargarConDobles({});
    assert.deepEqual(servicio.limpiarModulos(['facturacion', 'facturacion']), ['facturacion']);
  });

  test('a un admin no se le guardan filas de permisos', async () => {
    const { servicio } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO({ es_admin: false })],
      'UPDATE usuario SET nombre': [USUARIO({ es_admin: true })]
    });

    await servicio.actualizar(7, { esAdmin: true, modulos: ['facturacion'] }, 4);

    const inserts = consultas.filter(c => c.sql.includes('INSERT INTO usuario_modulo'));
    assert.equal(inserts.length, 0, 'un admin ve todo por su rol; guardar filas duplicaría la verdad');
  });
});

describe('requirePermiso — el middleware que protege de verdad', () => {
  function correr(middleware, { ruta, usuario, metodo = 'GET' }) {
    return new Promise(resolve => {
      const req = { method: metodo, path: ruta, usuario };
      const res = {
        status(codigo) { this._codigo = codigo; return this; },
        json(cuerpo) { resolve({ bloqueado: true, codigo: this._codigo, cuerpo }); }
      };
      middleware.requirePermiso(req, res, () => resolve({ bloqueado: false }));
    });
  }

  test('deja pasar una ruta compartida sin mirar permisos', async () => {
    const { middleware } = cargarConDobles({});
    const r = await correr(middleware, { ruta: '/alegra/reportes/faltantes/notas', usuario: { id: 4 } });
    assert.equal(r.bloqueado, false);
  });

  test('mandarle una orden de compra a un proveedor pide Reporte Proveedores, aunque la ruta cuelgue de /alegra', async () => {
    // '/alegra' es compartida. Hasta el 2026-10-04 esto pasaba con cualquier
    // sesión: el envío sale por WhatsApp a un proveedor de verdad.
    const sinModulo = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }]
    });
    const r = await correr(sinModulo.middleware, { ruta: '/alegra/orden-compra/enviar-whatsapp', metodo: 'POST', usuario: { id: 4 } });
    assert.equal(r.bloqueado, true);
    assert.equal(r.codigo, 403);
    assert.equal(r.cuerpo.modulo, 'reporte-proveedores');

    const conModulo = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'reporte-proveedores' }]
    });
    const ok = await correr(conModulo.middleware, { ruta: '/alegra/orden-compra/enviar-whatsapp', metodo: 'POST', usuario: { id: 4 } });
    assert.equal(ok.bloqueado, false);
  });

  test('cambiar lo que se le entregó a un cliente pide Reporte Clientes', async () => {
    const sinModulo = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }]
    });
    const r = await correr(sinModulo.middleware, { ruta: '/alegra/faltantes/ajustes', metodo: 'POST', usuario: { id: 4 } });
    assert.equal(r.bloqueado, true);
    assert.equal(r.cuerpo.modulo, 'reporte-clientes');

    const conModulo = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'reporte-clientes' }]
    });
    const ok = await correr(conModulo.middleware, { ruta: '/alegra/faltantes/ajustes/33', metodo: 'DELETE', usuario: { id: 4 } });
    assert.equal(ok.bloqueado, false);
  });

  test('Impresión ya no se alcanza por /alegra: solo por su prefijo, que pide el módulo', async () => {
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }]
    });
    const r = await correr(middleware, { ruta: '/reimpresion/facturas/9/procesar', metodo: 'POST', usuario: { id: 4 } });
    assert.equal(r.bloqueado, true);
    assert.equal(r.cuerpo.modulo, 'impresion');
  });

  test('mover productos de categoría en lote pide el permiso de Gestión de Catálogo', async () => {
    // En la Gestión de Catálogo vieja esto vivía debajo de '/alegra', que es
    // compartida: cualquiera con sesión podía cambiar categorías en lote.
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }]
    });
    const r = await correr(middleware, { ruta: '/maestro/lote/categoria', usuario: { id: 4 } });

    assert.equal(r.bloqueado, true);
    assert.equal(r.codigo, 403);
    assert.equal(r.cuerpo.modulo, 'gestion-catalogo');
  });

  test('las fotos que usan otras pantallas siguen abiertas a quien tenga sesión', async () => {
    const { middleware } = cargarConDobles({});
    const r = await correr(middleware, { ruta: '/catalogos/imagenes-sugeridas', usuario: { id: 4 } });
    assert.equal(r.bloqueado, false);
  });

  test('bloquea con 403 un módulo que el usuario no tiene', async () => {
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }]
    });
    const r = await correr(middleware, { ruta: '/rentabilidad', usuario: { id: 4 } });

    assert.equal(r.bloqueado, true);
    assert.equal(r.codigo, 403);
    assert.equal(r.cuerpo.code, 'SIN_PERMISO');
    assert.equal(r.cuerpo.modulo, 'rentabilidad');
  });

  test('deja pasar el módulo que sí tiene', async () => {
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'rentabilidad' }]
    });
    const r = await correr(middleware, { ruta: '/rentabilidad/resumen', usuario: { id: 4 } });
    assert.equal(r.bloqueado, false);
  });

  test('un usuario común NO entra a la gestión de usuarios', async () => {
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': []
    });
    const r = await correr(middleware, { ruta: '/usuarios', usuario: { id: 4 } });

    assert.equal(r.codigo, 403);
    assert.match(r.cuerpo.error, /administrador/);
  });

  test('cambiar mayúsculas en la dirección NO salta el permiso', async () => {
    // Express no distingue mayúsculas; el guardián sí lo hacía. Medido el
    // 2026-10-03: /api/usuarios daba 403 y /api/Usuarios daba 200.
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }]
    });
    for (const ruta of ['/Usuarios', '/USUARIOS/', '/usuarios/', '/Usuarios/4/password']) {
      const r = await correr(middleware, { ruta, usuario: { id: 4 } });
      assert.equal(r.codigo, 403, `${ruta} pasó`);
      assert.match(r.cuerpo.error, /administrador/);
    }
    for (const ruta of ['/Rentabilidad/resumen', '/RENTABILIDAD', '/Reporte-Contador/periodos', '/Maestro/Productos', '/Alegra/Bodega/facturas-propias']) {
      const r = await correr(middleware, { ruta, usuario: { id: 4 } });
      assert.equal(r.codigo, 403, `${ruta} pasó`);
      assert.equal(r.cuerpo.code, 'SIN_PERMISO');
    }
  });

  test('y una cuenta desactivada tampoco pasa cambiando mayúsculas', async () => {
    const { middleware } = cargarConDobles({ 'FROM usuario WHERE id': [USUARIO({ activo: false })] });
    const r = await correr(middleware, { ruta: '/Rentabilidad/resumen', usuario: { id: 4 } });
    assert.equal(r.codigo, 401);
  });

  test('anular una factura o un cobro y reabrir la caja piden administrador aunque se tenga el módulo', async () => {
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }, { modulo: 'cuentas-por-cobrar' }]
    });
    const casos = [
      ['PATCH', '/facturacion/facturas/5482/anular', 'anular-factura', /anular una factura/],
      ['PATCH', '/Facturacion/Facturas/5482/Anular/', 'anular-factura', /anular una factura/],
      ['PATCH', '/cuentas-por-cobrar/propios/abonos/7/anular', 'anular-cobro', /anular un cobro/],
      ['POST', '/cuentas-por-cobrar/propios/caja/reabrir', 'reabrir-caja', /reabrir una caja/]
    ];
    for (const [metodo, ruta, clave, mensaje] of casos) {
      const r = await correr(middleware, { metodo, ruta, usuario: { id: 4 } });
      assert.equal(r.codigo, 403, `${metodo} ${ruta} pasó`);
      assert.equal(r.cuerpo.accion, clave);
      assert.match(r.cuerpo.error, mensaje);
      assert.equal(r.cuerpo.message, r.cuerpo.error, 'la pantalla lee `message`');
    }
  });

  test('con el módulo, todo lo demás sigue igual: facturar, nota de crédito, editar, cobrar y cerrar caja', async () => {
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': [{ modulo: 'facturacion' }, { modulo: 'cuentas-por-cobrar' }]
    });
    for (const [metodo, ruta] of [
      ['POST', '/facturacion/facturas'],
      ['PUT', '/facturacion/facturas/5482'],
      ['POST', '/facturacion/notas-credito'],
      ['PATCH', '/facturacion/notas-credito/3/anular'],
      ['POST', '/cuentas-por-cobrar/propios/abonos'],
      ['POST', '/cuentas-por-cobrar/propios/caja/cerrar'],
      ['GET', '/facturacion/facturas/5482']
    ]) {
      const r = await correr(middleware, { metodo, ruta, usuario: { id: 4 } });
      assert.equal(r.bloqueado, false, `${metodo} ${ruta} quedó bloqueado`);
    }
  });

  test('un administrador sí anula y reabre', async () => {
    const { middleware } = cargarConDobles({ 'FROM usuario WHERE id': [USUARIO({ es_admin: true })] });
    for (const [metodo, ruta] of [
      ['PATCH', '/facturacion/facturas/5482/anular'],
      ['PATCH', '/cuentas-por-cobrar/propios/abonos/7/anular'],
      ['POST', '/cuentas-por-cobrar/propios/caja/reabrir']
    ]) {
      const r = await correr(middleware, { metodo, ruta, usuario: { id: 4 } });
      assert.equal(r.bloqueado, false, `${metodo} ${ruta} bloqueó a un administrador`);
    }
  });

  test('sin el módulo, la acción de administrador tampoco pasa (y lo dice como falta de administrador)', async () => {
    const { middleware } = cargarConDobles({
      'FROM usuario WHERE id': [USUARIO()],
      'FROM usuario_modulo WHERE usuario_id': []
    });
    const r = await correr(middleware, { metodo: 'PATCH', ruta: '/facturacion/facturas/1/anular', usuario: { id: 4 } });
    assert.equal(r.codigo, 403);
  });

  test('una cuenta desactivada recibe 401 aunque su token siga vigente', async () => {
    // Es lo que evita que alguien despedido siga trabajando las 12 horas que
    // le quedan de token.
    const { middleware } = cargarConDobles({ 'FROM usuario WHERE id': [USUARIO({ activo: false })] });
    const r = await correr(middleware, { ruta: '/rentabilidad', usuario: { id: 4 } });

    assert.equal(r.codigo, 401);
    assert.equal(r.cuerpo.code, 'CUENTA_INACTIVA');
  });

  test('sin usuario en la petición (ruta pública) no se autoriza nada', async () => {
    const { middleware } = cargarConDobles({});
    const r = await correr(middleware, { ruta: '/catalogo-clientes/productos', usuario: undefined });
    assert.equal(r.bloqueado, false);
  });
});

describe('el login devuelve los permisos, no solo el token', () => {
  test('la respuesta del login trae esAdmin y modulos', async () => {
    // Sin esto el menú quedaba vacío justo después de entrar: el frontend se
    // queda con el usuario del login hasta la primera recarga, y sin permisos
    // no podía abrir ninguna pantalla.
    const rutaAuth = require.resolve('../src/modules/auth/auth.service');
    for (const r of [rutaDb, rutaServicio, rutaAuth]) delete require.cache[r];

    require.cache[rutaDb] = {
      id: rutaDb, filename: rutaDb, loaded: true, exports: {
        query: async (sql) => {
          if (sql.includes('WHERE LOWER(usuario)')) {
            return { rows: [{ ...USUARIO(), password_hash: 'hash-falso' }] };
          }
          if (sql.includes('FROM usuario WHERE id')) return { rows: [USUARIO()] };
          if (sql.includes('FROM usuario_modulo')) return { rows: [{ modulo: 'facturacion' }] };
          return { rows: [] };
        }
      }
    };

    const bcrypt = require('bcryptjs');
    const compararOriginal = bcrypt.compare;
    bcrypt.compare = async () => true;
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(48);

    try {
      const { login } = require(rutaAuth);
      const r = await login({ usuario: 'andres', password: 'lo-que-sea' });

      assert.equal(r.usuario.esAdmin, false);
      assert.deepEqual(r.usuario.modulos, ['facturacion']);
      assert.ok(r.token, 'debe devolver token igual');
    } finally {
      bcrypt.compare = compararOriginal;
    }
  });
});
