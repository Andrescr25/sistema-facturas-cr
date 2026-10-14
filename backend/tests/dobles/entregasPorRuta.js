const { randomUUID } = require('node:crypto');
async function preparar(c) {
  const zz = randomUUID().slice(0,8);
  const ruta = async nombre => (await c.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING *',[`ZZ ${nombre} ${zz}`])).rows[0];
  const a=await ruta('Entrega A'), b=await ruta('Entrega B');
  let orden=0;
  const cliente=async nombre=>(await c.query(`INSERT INTO cliente(nombre,ruta_id,orden_ruta,ubicacion_maps)
    VALUES($1,$2,$3,'https://maps.app.goo.gl/ZZEntrega') RETURNING *`,[`ZZ ${nombre} ${zz}`,a.id,++orden])).rows[0];
  const primero=await cliente('Primero'),segundo=await cliente('Segundo'),gemelo=await cliente('Primero');
  const factura=async (cl,estado='emitida',bodega='procesado')=>{
    const {rows:[f]}=await c.query(`INSERT INTO factura(numero,fecha,estado,estado_bodega,cliente_id,cliente_nombre,total)
      VALUES($1,'2000-01-01',$2,$3,$4,$5,10000) RETURNING *`,[`ZZ-RUTA-${randomUUID().slice(0,8)}`,estado,bodega,cl?.id||null,cl?.nombre||'ZZ Sin ficha']);
    await c.query(`INSERT INTO factura_linea(factura_id,numero_linea,nombre,cantidad,precio_unitario,total)
      VALUES($1,1,'ZZ Producto',10,1000,10000)`,[f.id]);return f;
  };
  const f1=await factura(primero),f2=await factura(segundo),adicional=await factura(primero,'emitida','pendiente');
  const otro=await factura(gemelo),anulada=await factura(primero,'anulada'),borrador=await factura(primero,'borrador'),huerfana=await factura(null);
  const {rows:[u]}=await c.query(`INSERT INTO usuario(usuario,nombre,password_hash,es_admin)
    VALUES($1,'ZZ Entregas','ZZ sin login',true) RETURNING id`,['zz-ruta-'+zz]);
  return {a,b,primero,segundo,gemelo,f1,f2,adicional,otro,anulada,borrador,huerfana,actor:u.id,factura};
}
module.exports={preparar};
