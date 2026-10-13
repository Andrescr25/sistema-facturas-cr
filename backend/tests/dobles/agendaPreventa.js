const { randomUUID } = require('node:crypto');
const { sumarDias, hoyEnCostaRica } = require('../../src/utils/fechaCR');

/** Solo para copia desechable y BEGIN/ROLLBACK; sin inventar frecuencias reales. */
async function preparar(c) {
  const zz = randomUUID().slice(0, 8), hoy = hoyEnCostaRica();
  const ruta = async (nombre, activo = true) => (await c.query('INSERT INTO ruta_cliente(nombre,activo) VALUES($1,$2) RETURNING *', [`ZZ ${nombre} ${zz}`, activo])).rows[0];
  const a = await ruta('Agenda sin semanas'), b = await ruta('Otra agenda'), vacia = await ruta('Agenda vacía');
  const inactiva = await ruta('Agenda inactiva', false);
  let orden = 0;
  const cliente = async (nombre, dias, rutaId = a.id, activo = true) => (await c.query(`INSERT INTO cliente(nombre,rotacion_dias,ruta_id,activo,orden_ruta)
    VALUES($1,$2,$3,$4,$5) RETURNING *`, [`ZZ ${nombre} ${zz}`, dias, rutaId, activo, rutaId ? ++orden : null])).rows[0];
  const factura = async (cl, dia, estado = 'emitida') => (await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,total,tipo_documento)
    VALUES($1,$2,$3,$4,$5,6000,'factura') RETURNING *`, [`ZZ-AG-${randomUUID().slice(0, 8)}`, estado, dia, cl.id, cl.nombre])).rows[0];
  const atrasado = await cliente('Atrasado', 7), ahora = await cliente('Hoy', 15);
  const homonimo = await cliente('Mismo nombre', 22), gemelo = await cliente('Mismo nombre', 7);
  const sinFrecuencia = await cliente('Sin frecuencia', null), sinFacturas = await cliente('Sin facturas', 7);
  const sinRuta = await cliente('Sin ruta', 22, null);
  const desactivado = await cliente('Desactivado', 7, a.id, false);
  const otra = await cliente('Otra ruta', 15, b.id), enInactiva = await cliente('Ruta inactiva', 30, inactiva.id);
  const fechas = [[atrasado,-14],[ahora,-15],[homonimo,-3],[gemelo,-3],[sinRuta,-10],[desactivado,0]];
  const facturas = [];
  for (const [cl, dias] of fechas) facturas.push(await factura(cl, sumarDias(hoy, dias)));
  return { hoy, a, b, vacia, inactiva, atrasado, ahora, homonimo, gemelo, sinFrecuencia,
    sinFacturas, sinRuta, desactivado, otra, enInactiva, facturas, cliente, factura };
}

module.exports = { preparar };
