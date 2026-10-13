const { randomUUID } = require('node:crypto');
const { sumarDias, hoyEnCostaRica } = require('../../src/utils/fechaCR');

/** Datos distinguibles solo en una transacción/copia desechable. */
async function preparar(c) {
  const zz = randomUUID().slice(0, 8), hoy = hoyEnCostaRica();
  const ruta = async nombre => (await c.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING *', [`ZZ ${nombre} ${zz}`])).rows[0];
  const a = await ruta('Ruta sin semanas'), b = await ruta('Otra ruta');
  const producto = (await c.query("INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id", [`ZZ Tubo ${zz}`, `ZZ-PVC-${zz}`])).rows[0].id;
  const cliente = async (nombre, dias, rutaId, orden) => (await c.query(`INSERT INTO cliente(nombre,rotacion_dias,ruta_id,orden_ruta)
    VALUES($1,$2,$3,$4) RETURNING *`, [`ZZ ${nombre} ${zz}`, dias, rutaId, orden])).rows[0];
  const homonimo = await cliente('Mismo nombre', 22, a.id, 1);
  const gemelo = await cliente('Mismo nombre', 7, a.id, 2);
  const atrasado = await cliente('Atrasado', 7, a.id, 3);
  const ahora = await cliente('Hoy', 15, a.id, 4);
  const sinFrecuencia = await cliente('Sin frecuencia', null, a.id, 5);
  const sinRuta = await cliente('Sin ruta', 22, null, null);
  const factura = async (cl, dia, faltante = true) => {
    const f = (await c.query(`INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,total,tipo_documento)
      VALUES($1,'emitida',$2,$3,$4,6000,'factura') RETURNING id`, [`ZZ-F-${randomUUID().slice(0, 8)}`, dia, cl?.id || null, cl?.nombre || homonimo.nombre])).rows[0].id;
    await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total)
      VALUES($1,1,$2,'ZZ Tubo',6,1000,6000)`, [f, producto]);
    const falta = faltante ? (await c.query(`INSERT INTO faltantes(factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado)
      VALUES($1,$2,3,'parcial','pendiente') RETURNING id`, [f, producto])).rows[0].id : null;
    return { id: f, faltante: falta };
  };
  const facturas = [await factura(homonimo, '2026-10-10'), await factura(gemelo, '2026-10-10'),
    await factura(atrasado, sumarDias(hoy, -60)), await factura(ahora, sumarDias(hoy, -15)),
    await factura(sinFrecuencia, hoy), await factura(sinRuta, hoy), await factura(null, hoy)];
  await factura(atrasado, sumarDias(hoy, -14), false);
  return { a, b, producto, homonimo, gemelo, atrasado, ahora, sinFrecuencia, sinRuta, facturas, hoy };
}
module.exports = { preparar };
