/**
 * Rotación por cliente: cada uno con su frecuencia, sin ciclos globales.
 *
 * EL PEDIDO (2026-10-13). «Cada cliente debe tener configurada su propia
 * frecuencia de visita […] Cuando se facture a un cliente, el sistema debe
 * tomar automáticamente la fecha de esa factura como la última atención […]
 * Ejemplo: rotación 22 días, última factura 10 de octubre → próxima visita
 * 1 de noviembre.»
 *
 * Acá se cuida la cuenta (la regla pura), cómo se dice en pantalla y, contra
 * la base local, que facturar mueva la próxima visita sin que nadie la guarde.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { sinComentarios } = require('./dobles/sinComentarios');
const { baseEnTransaccion } = require('./dobles/buzonEnTransaccion');
const { ESTADO, ROTACION_MAXIMA, rotacionDe } = require('../src/modules/clientes/rotacion');
const { sumarDias, diasEntre, hoyEnCostaRica } = require('../src/utils/fechaCR');

require('dotenv').config({ quiet: true });

describe('la cuenta de la rotación', () => {
  test('el ejemplo del usuario: 22 días desde el 10 de octubre es el 1 de noviembre', () => {
    const r = rotacionDe({ rotacionDias: 22, ultimaFactura: '2026-10-10', hoy: '2026-10-13' });
    assert.deepEqual(r, { dias: 22, ultimaAtencion: '2026-10-10', proximaVisita: '2026-11-01', faltan: 19, estado: ESTADO.PROXIMO });
  });

  test('hoy, próximo y atrasado se distinguen por el día, no por la hora', () => {
    const con = (hoy) => rotacionDe({ rotacionDias: 22, ultimaFactura: '2026-10-10', hoy });
    assert.deepEqual([con('2026-10-31').estado, con('2026-10-31').faltan], [ESTADO.PROXIMO, 1]);
    assert.deepEqual([con('2026-11-01').estado, con('2026-11-01').faltan], [ESTADO.HOY, 0]);
    assert.deepEqual([con('2026-11-02').estado, con('2026-11-02').faltan], [ESTADO.ATRASADO, -1]);
    assert.equal(con('2027-01-05').faltan, -65, 'cruzando el año');
  });

  test('la fecha llega de la base como un Date a la medianoche local, y se lee bien', () => {
    // Así entrega el driver una columna DATE (ver `diaDeBase`).
    const r = rotacionDe({ rotacionDias: 7, ultimaFactura: new Date(2026, 9, 10), hoy: '2026-10-13' });
    assert.deepEqual([r.ultimaAtencion, r.proximaVisita, r.faltan], ['2026-10-10', '2026-10-17', 4]);
  });

  test('cada cliente con su frecuencia: la misma factura da fechas distintas', () => {
    const proxima = (dias) => rotacionDe({ rotacionDias: dias, ultimaFactura: '2026-10-10', hoy: '2026-10-10' }).proximaVisita;
    assert.deepEqual([7, 15, 22, 30].map(proxima), ['2026-10-17', '2026-10-25', '2026-11-01', '2026-11-09']);
  });

  test('sin frecuencia no se inventa una fecha, aunque tenga facturas', () => {
    for (const vacio of [null, undefined, '', 0, -3, 7.5, 'abc', ROTACION_MAXIMA + 1]) {
      const r = rotacionDe({ rotacionDias: vacio, ultimaFactura: '2026-10-10', hoy: '2026-10-13' });
      assert.deepEqual([r.dias, r.proximaVisita, r.faltan, r.estado], [null, null, null, ESTADO.SIN_ROTACION], String(vacio));
      assert.equal(r.ultimaAtencion, '2026-10-10', 'la última atención se sigue sabiendo');
    }
  });

  test('con frecuencia pero sin facturas todavía no hay desde cuándo contar', () => {
    const r = rotacionDe({ rotacionDias: 15, ultimaFactura: null, hoy: '2026-10-13' });
    assert.deepEqual(r, { dias: 15, ultimaAtencion: null, proximaVisita: null, faltan: null, estado: ESTADO.SIN_FACTURAS });
  });

  test('sumar días cruza bien el fin de mes, de año y el bisiesto', () => {
    assert.equal(sumarDias('2026-01-31', 30), '2026-03-02');
    assert.equal(sumarDias('2026-12-20', 22), '2027-01-11');
    assert.equal(sumarDias('2028-02-28', 1), '2028-02-29');
    assert.equal(diasEntre('2026-10-13', '2026-11-01'), 19);
    assert.equal(diasEntre('2026-11-01', '2026-10-13'), -19);
  });
});

describe('cómo se dice en pantalla', () => {
  let u;
  before(async () => { u = await import('../../frontend/src/utils/rotacionTexto.js'); });

  test('la fecha se escribe en palabras, con el año solo cuando no es el de hoy', () => {
    assert.equal(u.diaEnPalabras('2026-11-01', '2026-10-13'), '1 de noviembre');
    assert.equal(u.diaEnPalabras('2027-01-11', '2026-12-20'), '11 de enero de 2027');
    assert.equal(u.diaEnPalabras('2026-10-10T06:00:00.000Z', '2026-10-13'), '10 de octubre', 'se corta el texto: no se corre un día por la zona');
    assert.equal(u.diaEnPalabras(null), '');
  });

  test('la frecuencia y sus valores de siempre', () => {
    assert.deepEqual(u.ROTACIONES_COMUNES, [7, 15, 22, 30]);
    assert.equal(u.ROTACION_MAXIMA, ROTACION_MAXIMA, 'la pantalla y el servidor aceptan lo mismo');
    assert.equal(u.textoRotacion(22), 'Cada 22 días');
    assert.equal(u.textoRotacion(1), 'Todos los días');
    assert.equal(u.textoRotacion(null), 'Sin rotación definida');
  });

  test('avisa antes de guardar una frecuencia que el servidor va a rechazar', () => {
    for (const bien of ['', '7', '22', '365', ' 30 ']) assert.equal(u.avisoDeRotacion(bien), '', bien);
    for (const mal of ['0', '-7', '366', '7.5', 'abc']) assert.match(u.avisoDeRotacion(mal), /entre 1 y 365/, mal);
  });

  test('hoy, próximos y atrasados se distinguen por tono y por texto', () => {
    const decir = (estado, faltan) => u.visitaEnPalabras({ estado, proximaVisita: '2026-11-01', faltan }, '2026-10-13');
    assert.deepEqual(decir('atrasado', -3), { tono: 'peligro', etiqueta: 'Atrasado', cuando: '1 de noviembre', detalle: 'Le tocaba hace 3 días.' });
    assert.equal(decir('atrasado', -1).detalle, 'Le tocaba hace 1 día.');
    assert.deepEqual(decir('hoy', 0), { tono: 'alerta', etiqueta: 'Le toca hoy', cuando: '1 de noviembre', detalle: 'Hoy se cumple su rotación.' });
    assert.deepEqual(decir('proximo', 19), { tono: 'activo', etiqueta: 'Próximo', cuando: '1 de noviembre', detalle: 'Faltan 19 días.' });
    assert.equal(decir('proximo', 1).detalle, 'Le toca mañana.');
    assert.equal(u.visitaEnPalabras({ estado: 'sin_facturas' }).etiqueta, 'Sin facturas');
    assert.equal(u.visitaEnPalabras({ estado: 'sin_rotacion' }).etiqueta, 'Sin rotación');
    assert.equal(u.visitaEnPalabras(undefined).etiqueta, 'Sin rotación', 'un servidor viejo que no la manda no tumba la ficha');
  });
});

describe('cómo quedó conectado', () => {
  const front = (...p) => sinComentarios(fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', ...p), 'utf8'));
  const back = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

  test('la frecuencia se edita en la ficha, con los valores de siempre a un toque', () => {
    const modal = front('components', 'clientes', 'ModalCliente.jsx');
    assert.match(modal, /'dia_entrega', 'rotacion_dias'\n\]/, 'el formulario no manda la frecuencia');
    assert.match(modal, /NUMERICOS = new Set\(\[[^\]]*'rotacion_dias'\]\)/, 'viajaría como texto');
    assert.match(modal, /<CampoRotacion valor=\{valores\.rotacion_dias\}/);
    const campo = front('components', 'clientes', 'CampoRotacion.jsx');
    assert.match(campo, /ROTACIONES_COMUNES\.map/);
    assert.match(campo, /id="cliente-rotacion_dias" type="number"/);
  });

  test('la ficha muestra última atención y próxima visita tal como las calculó el servidor', () => {
    assert.match(front('components', 'clientes', 'FichaCliente.jsx'), /<RotacionCliente rotacion=\{rotacion\} \/>/);
    const bloque = front('components', 'clientes', 'RotacionCliente.jsx');
    assert.match(bloque, /visitaEnPalabras\(rotacion, hoy\)/);
    // La pantalla no vuelve a sumar fechas: una sola cuenta, la del servidor.
    assert.doesNotMatch(bloque, /new Date|setDate|getTime/);
  });

  test('nada de la rotación se guarda salvo la frecuencia', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', 'independencia', '056_rotacion_por_cliente.sql'), 'utf8');
    assert.match(sql, /ALTER TABLE cliente ADD COLUMN IF NOT EXISTS rotacion_dias SMALLINT/);
    assert.equal((sql.match(/ADD COLUMN/g) || []).length, 1, 'ni la última atención ni la próxima visita son columnas: se calculan');
    // Una sola definición de "última atención": la última factura EMITIDA.
    assert.match(back('modules', 'clientes', 'rotacion.js'), /MAX\(f\.fecha\) FROM factura f WHERE f\.cliente_id = \$\{cliente\} AND f\.estado = 'emitida'/);
    assert.match(back('modules', 'clientes', 'clientes.resumen.service.js'), /\$\{ULTIMA_ATENCION_SQL\('c\.id'\)\} AS ultima_factura/);
  });
});

describe('la rotación de un cliente — contra la base local', { skip: process.env.DATABASE_URL ? false : 'sin DATABASE_URL' }, () => {
  let pool; let conexion; let clientes; let resumen; let facturas; let notas;
  let cliente; let producto; let usuarioId;
  const hoy = hoyEnCostaRica();

  const rotacion = async () => (await resumen.resumenDeCliente(cliente.id)).rotacion;
  /** Una factura emitida de ese cliente, puesta en el día que se pida. */
  const facturar = async (dia, cantidad = 1) => {
    const f = await facturas.crearFactura({
      clienteId: cliente.id, clienteNombre: cliente.nombre,
      items: [{ productoId: producto.id, reference: producto.referencia, name: producto.nombre, quantity: cantidad, price: 1000 }]
    }, usuarioId);
    await conexion.query('UPDATE factura SET fecha = $2::date, fecha_vencimiento = $2::date WHERE id = $1', [f.id, dia]);
    return f.id;
  };

  before(async () => {
    require('../config/aislado').asegurarBaseLocal();
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    conexion = await pool.connect();
    await conexion.query('BEGIN');
    // La columna nueva, dentro de la transacción: el ROLLBACK del final la
    // quita si esta base todavía no tiene aplicada la migración.
    await conexion.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', 'independencia', '056_rotacion_por_cliente.sql'), 'utf8'));
    const rutaDb = require.resolve('../config/database');
    require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: baseEnTransaccion(conexion, 'rotacion') };
    for (const m of ['clientes/clientes.service', 'clientes/clientes.resumen.service', 'facturacion/facturaPropia.service']) {
      delete require.cache[require.resolve(`../src/modules/${m}`)];
    }
    clientes = require('../src/modules/clientes/clientes.service');
    resumen = require('../src/modules/clientes/clientes.resumen.service');
    facturas = require('../src/modules/facturacion/facturaPropia.service');
    notas = require('../src/modules/facturacion/notaCredito.service');

    producto = (await conexion.query(
      `SELECT id, nombre, referencia FROM producto WHERE activo AND coalesce(trim(referencia), '') <> '' AND impuesto_id IS NOT NULL ORDER BY id LIMIT 1`)).rows[0];
    usuarioId = (await conexion.query('SELECT id FROM usuario WHERE activo ORDER BY id LIMIT 1')).rows[0]?.id;
    assert.ok(producto && usuarioId, 'a la base local le falta un producto o un usuario');
    cliente = await clientes.crearCliente({ nombre: 'ZZ CLIENTE DE ROTACION', rotacion_dias: 22 }, usuarioId);
  });

  after(async () => {
    await conexion?.query('ROLLBACK').catch(() => {});
    conexion?.release();
    await pool?.end().catch(() => {});
  });

  test('la frecuencia se guarda en la ficha; sin facturas todavía no hay fecha', async () => {
    assert.equal(cliente.rotacion_dias, 22);
    assert.deepEqual(await rotacion(), { dias: 22, ultimaAtencion: null, proximaVisita: null, faltan: null, estado: ESTADO.SIN_FACTURAS });
  });

  test('al facturarle, esa fecha es su última atención y la próxima visita sale sola', async () => {
    await facturar('2026-10-10');
    const r = await rotacion();
    assert.deepEqual([r.dias, r.ultimaAtencion, r.proximaVisita], [22, '2026-10-10', '2026-11-01']);
    assert.equal(r.faltan, diasEntre(hoy, '2026-11-01'));
  });

  test('una factura más nueva la mueve; una más vieja, un borrador o una anulada no', async () => {
    const nueva = await facturar('2026-10-20');
    assert.deepEqual([(await rotacion()).ultimaAtencion, (await rotacion()).proximaVisita], ['2026-10-20', '2026-11-11']);

    await facturar('2026-09-01');
    assert.equal((await rotacion()).ultimaAtencion, '2026-10-20', 'una factura vieja no es la última atención');

    const borrador = await facturar('2026-10-28');
    await conexion.query("UPDATE factura SET estado = 'borrador' WHERE id = $1", [borrador]);
    assert.equal((await rotacion()).ultimaAtencion, '2026-10-20', 'un borrador no es una venta');

    await conexion.query("UPDATE factura SET estado = 'anulada' WHERE id = $1", [nueva]);
    assert.deepEqual([(await rotacion()).ultimaAtencion, (await rotacion()).proximaVisita], ['2026-10-10', '2026-11-01'], 'anular la última devuelve la fecha a la anterior');
  });

  test('una nota completa devuelve la atención anterior; una parcial no, y anular la nota la restaura', async () => {
    const id = await facturar('2026-10-21', 2);
    const nota = () => notas.crearNotaCredito({ facturaId: id, motivo: 'anulacion',
      motivoTexto: 'ZZ rotación con crédito', lineas: [{ numeroLinea: 1, cantidad: 1 }] }, usuarioId);
    await nota();
    assert.equal((await rotacion()).ultimaAtencion, '2026-10-21', 'la nota parcial conserva la atención');
    const segunda = await nota();
    assert.equal((await conexion.query('SELECT estado FROM factura WHERE id=$1', [id])).rows[0].estado, 'emitida');
    assert.deepEqual([(await rotacion()).ultimaAtencion, (await rotacion()).proximaVisita], ['2026-10-10', '2026-11-01']);
    await notas.anularNotaCredito(segunda.id, { motivo: 'ZZ reversión del crédito' }, usuarioId);
    assert.equal((await rotacion()).ultimaAtencion, '2026-10-21');
    await conexion.query("UPDATE factura SET estado='anulada' WHERE id=$1", [id]);
  });

  test('una factura pagada sigue siendo atención y una factura gratuita sin notas también', async () => {
    const id = await facturar('2026-10-22');
    const { rows: [f] } = await conexion.query('SELECT total FROM factura WHERE id=$1', [id]);
    const { rows: [pago] } = await conexion.query(`INSERT INTO pago(numero,fecha,cliente_nombre,monto,anulado)
      VALUES($1,'2026-10-22','ZZ Rotación',$2,FALSE) RETURNING id`, [`ZZ-ROT-PAGO-${id}`, f.total]);
    await conexion.query('INSERT INTO pago_factura(pago_id,factura_id,monto) VALUES($1,$2,$3)', [pago.id, id, f.total]);
    assert.equal((await rotacion()).ultimaAtencion, '2026-10-22');
    await conexion.query('UPDATE factura SET total=0 WHERE id=$1', [id]);
    assert.equal((await rotacion()).ultimaAtencion, '2026-10-22');
    await conexion.query("UPDATE factura SET estado='anulada' WHERE id=$1", [id]);
  });

  test('cambiarle la frecuencia recalcula desde la misma factura, y queda en la bitácora', async () => {
    const editado = await clientes.editarCliente(cliente.id, { rotacion_dias: 7 }, usuarioId);
    assert.equal(editado.rotacion_dias, 7);
    assert.deepEqual([(await rotacion()).dias, (await rotacion()).proximaVisita], [7, '2026-10-17']);
    const { rows: [cambio] } = await conexion.query(
      `SELECT antes->>'rotacion_dias' AS antes, despues->>'rotacion_dias' AS despues FROM bitacora_cambio
        WHERE entidad = 'cliente' AND entidad_id = $1::text AND accion = 'editar' ORDER BY id DESC LIMIT 1`, [cliente.id]);
    assert.deepEqual([cambio.antes, cambio.despues], ['22', '7']);
  });

  test('atrasado, hoy y próximo salen de comparar con el día de hoy en Costa Rica', async () => {
    await conexion.query("UPDATE factura SET estado = 'anulada' WHERE cliente_id = $1", [cliente.id]);
    await facturar(sumarDias(hoy, -7));
    assert.deepEqual([(await rotacion()).estado, (await rotacion()).faltan], [ESTADO.HOY, 0]);
    await clientes.editarCliente(cliente.id, { rotacion_dias: 5 }, usuarioId);
    assert.deepEqual([(await rotacion()).estado, (await rotacion()).faltan], [ESTADO.ATRASADO, -2]);
    await clientes.editarCliente(cliente.id, { rotacion_dias: 30 }, usuarioId);
    assert.deepEqual([(await rotacion()).estado, (await rotacion()).faltan], [ESTADO.PROXIMO, 23]);
  });

  test('quitarle la frecuencia lo deja sin fecha, sin perder su última atención', async () => {
    await clientes.editarCliente(cliente.id, { rotacion_dias: null }, usuarioId);
    const r = await rotacion();
    assert.deepEqual([r.dias, r.proximaVisita, r.estado], [null, null, ESTADO.SIN_ROTACION]);
    assert.equal(r.ultimaAtencion, sumarDias(hoy, -7));
  });

  test('una frecuencia que no es un número entero de 1 a 365 días no se guarda', async () => {
    for (const mal of [0, -7, 366, 7.5, 'abc']) {
      await assert.rejects(clientes.editarCliente(cliente.id, { rotacion_dias: mal }, usuarioId),
        (e) => e.status === 400 && /^Rotación: /.test(e.message), String(mal));
    }
    assert.equal((await clientes.obtenerCliente(cliente.id)).rotacion_dias, null);
  });

  test('la rotación no toca la ruta: son dos cosas distintas', async () => {
    const antes = await clientes.obtenerCliente(cliente.id);
    await clientes.editarCliente(cliente.id, { rotacion_dias: 15 }, usuarioId);
    const despues = await clientes.obtenerCliente(cliente.id);
    assert.deepEqual([despues.ruta_id, despues.orden_ruta], [antes.ruta_id, antes.orden_ruta]);
  });
});
