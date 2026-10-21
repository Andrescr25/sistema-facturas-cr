const {randomUUID}=require('node:crypto');
const zz=n=>`ZZ automático ${n} ${randomUUID().slice(0,8)}`;

async function sembrar(db){
 const p=(await db.query("INSERT INTO proveedor(nombre,identificacion,telefono_whatsapp) VALUES($1,$2,'88888888') RETURNING *",[zz('proveedor'),randomUUID().slice(0,18)])).rows[0];
 const r=(await db.query('INSERT INTO ruta_cliente(nombre) VALUES($1) RETURNING *',[zz('ruta')])).rows[0];
 const cl=(await db.query('INSERT INTO cliente(nombre) VALUES($1) RETURNING *',[zz('cliente')])).rows[0];
 const productos=[],facturas=[];
 for(const nombre of ['A','B','C']){
  const id=(await db.query('INSERT INTO producto(nombre,referencia) VALUES($1,$2) RETURNING id',[zz(nombre),zz(nombre)])).rows[0].id;productos.push(id);
  await db.query(`INSERT INTO supplier_product_mapping(supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
   VALUES($1,$2,$3::text,$3::text,'','',$4,$5,1)`,[p.nombre,p.identificacion,`ZZ-${nombre}`,id,p.id]);
 }
 for(let n=0;n<2;n++){
  const id=(await db.query("INSERT INTO factura(numero,estado,fecha,cliente_id,cliente_nombre,total) VALUES($1,'emitida','2026-10-13',$2,$3,100) RETURNING id",[zz('FAC'),cl.id,cl.nombre])).rows[0].id;facturas.push(id);
  for(const [i,p] of productos.entries())await db.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,$2,$3,'ZZ',20,1,20)",[id,i+1,p]);
 }
 return{p,productos,facturas,cliente:cl,ruta:r};
}
module.exports={sembrar};
