const {faltanteOperativo,cantidadPendiente}=require('../reports/faltantesCompra.sql');
const {pool}=require('../../../config/database');
const {enTransaccion}=require('../../utils/transaccion');
const {interno:{entero,listarEn}}=require('./ordenesCiclo.service');

/** Una ficha inequívoca, sin decidir por parecido ni por la ruta actual del cliente. */
async function faltantesEn(db,{proveedorId,facturaId}={}) {
  const params=[],where=[faltanteOperativo(),`${cantidadPendiente()}>0`];
  if(proveedorId!=null&&proveedorId!==''){params.push(entero(proveedorId));where.push(`pr.id=$${params.length}`)}
  if(facturaId!=null){params.push(entero(facturaId));where.push(`fa.id=$${params.length}`)}
  const {rows}=await db.query(`SELECT f.id,f.producto_propio_id AS producto_id,${cantidadPendiente()} AS cantidad_faltante,
    f.proveedor_asignado,f.proveedor_cedula,fa.id factura_id,
    p.nombre producto_nombre,p.referencia,pr.id proveedor_id,pr.nombre proveedor_nombre,pr.activo,
    COALESCE(cv.cubierta,0) cubierta,COALESCE(cv.pendiente_enviar,0) pendiente_enviar,
    COALESCE(cv.por_verificar,0) por_verificar,COALESCE(cv.pendiente_recibir,0) pendiente_recibir,COALESCE(cv.recibida,0) recibida
    FROM faltantes f JOIN factura fa ON fa.id=f.factura_propia_id JOIN producto p ON p.id=f.producto_propio_id
    LEFT JOIN LATERAL (SELECT min(id) id FROM proveedor
      WHERE CASE WHEN NULLIF(NULLIF(btrim(f.proveedor_cedula),'SIN_PROVEEDOR'),'') IS NOT NULL
        THEN identificacion=btrim(f.proveedor_cedula)
        ELSE lower(btrim(nombre))=lower(btrim(f.proveedor_asignado)) END HAVING count(*)=1) identidad ON TRUE
    LEFT JOIN proveedor pr ON pr.id=identidad.id
    LEFT JOIN LATERAL (SELECT SUM(c.cobertura) cubierta,
      SUM(CASE WHEN c.estado IN ('borrador','pendiente_enviar') AND o.envio_id IS NULL THEN c.cobertura ELSE 0 END) pendiente_enviar,
      SUM(CASE WHEN c.estado IN ('borrador','pendiente_enviar') AND o.envio_id IS NOT NULL THEN c.cobertura ELSE 0 END) por_verificar,
      SUM(CASE WHEN c.estado IN ('enviada','parcialmente_recibida') THEN GREATEST(c.cobertura-c.cantidad_recibida,0) ELSE 0 END) pendiente_recibir,
      SUM(c.cantidad_recibida) recibida FROM orden_compra_ciclo_cobertura c JOIN orden_compra_ciclo o ON o.id=c.orden_id WHERE c.faltante_id=f.id) cv ON TRUE
    WHERE ${where.join(' AND ')} ORDER BY f.id`,params);
  return rows;
}
async function resumen(filtros={}) {
  return enTransaccion(pool,async db=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const filas=await faltantesEn(db,filtros),ordenes=await listarEn(db,filtros),proveedores=new Map();
    const asegurar=(clave,datos)=>{
      if(!proveedores.has(clave))proveedores.set(clave,{...datos,productos:[],ordenes:[]});
      return proveedores.get(clave);
    };
    for(const f of filas){
      const clave=f.proveedor_id?`p:${f.proveedor_id}`:`sin:${f.proveedor_cedula||f.proveedor_asignado||''}`;
      const p=asegurar(clave,{clave,id:f.proveedor_id,nombre:f.proveedor_nombre||f.proveedor_asignado||'Sin proveedor',activo:f.activo});
      let producto=p.productos.find(p=>p.id===f.producto_id);
      if(!producto){producto={id:f.producto_id,nombre:f.producto_nombre,referencia:f.referencia,faltante:0,sinOrden:0,pendienteEnviar:0,porVerificar:0,pendienteRecibir:0,recibida:0};p.productos.push(producto)}
      producto.faltante+=Number(f.cantidad_faltante);
      producto.sinOrden+=Math.max(Number(f.cantidad_faltante)-Number(f.cubierta),0);
      producto.pendienteEnviar+=Number(f.pendiente_enviar);producto.porVerificar+=Number(f.por_verificar);
      producto.pendienteRecibir+=Number(f.pendiente_recibir);producto.recibida+=Number(f.recibida);
    }
    for(const o of ordenes)asegurar(`p:${o.proveedor_id}`,{clave:`p:${o.proveedor_id}`,id:o.proveedor_id,nombre:o.proveedor_nombre}).ordenes.push(o);
    for(const p of proveedores.values())p.productos=p.productos.filter(p=>p.faltante-p.recibida>0.0000005)
      .map(p=>({...p,necesarias:Number(Math.max(p.faltante-p.recibida,0).toFixed(6))}));
    return [...proveedores.values()].filter(p=>p.productos.length||p.ordenes.length).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
  });
}
module.exports={resumen,faltantesEn};
