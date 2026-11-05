const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const facturacion = require('../../src/modules/facturacion/facturaPropia.service');
const inventario = require('../../src/modules/inventario/inventario.service');
const { guardarFaltantes } = require('../../src/utils/guardarFaltantes');

/** Datos claramente ZZ, exclusivamente en una base de pruebas desechable. */
async function crearEscenario(db, usuario, { recibidas=3,originales=6,faltan=3,catalogo=null }={}) {
  const u=new URL(process.env.DATABASE_URL);assert.ok(['127.0.0.1','localhost'].includes(u.hostname));assert.match(u.pathname,/^\/tachi_codex_/);
  const AHORA="(now() AT TIME ZONE 'America/Costa_Rica')",tag=randomUUID().slice(0,8);
  const {rows:[cliente]}=await db.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING id',[`ZZ cliente ${tag}`]);
  const productos=catalogo||[];
  if(!catalogo)for(const[nombre,precio,tarifa]of[['KENDA',1000,13],['VINI',2000,1],['OTRO',50,0]]){
    const {rows:[iva]}=await db.query('SELECT id FROM impuesto WHERE tarifa=$1 AND activo LIMIT 1',[tarifa]);
    const {rows:[p]}=await db.query(`INSERT INTO producto(nombre,referencia,cabys,unidad,precio_sin_iva,costo_con_iva,impuesto_id,inventariable)
      VALUES($1,$1,'4294401030100','Unid',$2,$3,$4,true) RETURNING *`,[`ZZ ${nombre} ${tag}`,precio,precio/2,iva.id]);productos.push(p);
  }
  const[a,b,otro]=productos;
  const factura=await facturacion.crearFacturaEnTransaccion(db,{clienteId:cliente.id,items:[
    {productoId:a.id,quantity:originales,price:Number(a.precio_sin_iva)},{productoId:otro.id,quantity:2,price:Number(otro.precio_sin_iva)}
  ]},usuario.id);
  const detectados=[];await guardarFaltantes(factura.id,[{producto_id:a.id,cantidad_faltante:faltan,tipo_faltante:faltan<originales?'parcial':'total'}],usuario.nombre,db,detectados);
  let compraId=null,compraLineaId=null;
  if(recibidas>0){
    const {rows:[proveedor]}=await db.query('INSERT INTO proveedor(nombre,identificacion) VALUES($1,$2) RETURNING id',[`ZZ proveedor ${tag}`,`ZZ${tag}`]);
    const {rows:[compra]}=await db.query(`INSERT INTO compra(proveedor_id,numero_consecutivo,fecha_emision,total,estado,creado_en)
      VALUES($1,$2,${AHORA}::date,100,'registrada',${AHORA}) RETURNING id`,[proveedor.id,`ZZ-${tag}`]);
    const {rows:[cl]}=await db.query(`INSERT INTO compra_linea(compra_id,numero_linea,producto_id,descripcion,cantidad,factor_conversion,precio_unitario,total_linea)
      VALUES($1,1,$2,'ZZ',$3,1,1000,1000) RETURNING id`,[compra.id,b.id,recibidas]);
    await inventario.reconciliarDocumentoEn(db,'compra',compra.id,usuario.id);compraId=compra.id;compraLineaId=cl.id;
  }
  return{a,b,otro,cliente,factura,faltanteId:detectados[0].id,compraId,compraLineaId};
}
module.exports = { crearEscenario };
