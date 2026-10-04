#!/usr/bin/env node
/**
 * Demostración local solicitada por el usuario, ya retirada tras su revisión.
 * Solo recrearla ante un nuevo pedido; NO corre al arrancar ni al migrar.
 * Los borradores no consumen series, no representan ventas ni generan deuda.
 * El manifiesto privado permite retirar exclusivamente este conjunto.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { hoyEnCostaRica } = require('../../src/utils/fechaCR');
const MARCA = 'ZZ-DEMO-PROVEEDORES-20261004';
class ErrorDemo extends Error {}
const PROVEEDORES = [
  { nombre:'ZZ-DEMO Distribuidora Norte [PRUEBA]', clave:'ZZ-DEMO-PROV-NORTE' },
  { nombre:'ZZ-DEMO Ferretería Sur [PRUEBA]', clave:'ZZ-DEMO-PROV-SUR' }
];
const PRODUCTOS = [
  { nombre:'ZZ-DEMO Tornillo zincado', proveedor:0, cantidad:6, nota:'PRUEBA: cabeza Phillips, bolsa cerrada.' },
  { nombre:'ZZ-DEMO Pintura azul 1 L', proveedor:0, cantidad:4, nota:'PRUEBA: únicamente color azul; confirmar tono.' },
  { nombre:'ZZ-DEMO Cinta aislante', proveedor:0, cantidad:12, nota:'PRUEBA: seis negras y seis rojas.' },
  { nombre:'ZZ-DEMO Tubo PVC 1/2', proveedor:1, cantidad:3, nota:'PRUEBA: tubo para agua potable.' },
  { nombre:'ZZ-DEMO Pegamento PVC', proveedor:1, cantidad:2, nota:'PRUEBA: presentación pequeña.' }
];

/** Recibe una conexión EN transacción; el llamador decide COMMIT/ROLLBACK. */
async function crear(db, fecha) {
  // Impide duplicar o apropiarse de registros existentes con estos nombres.
  const { rows:[r] } = await db.query(`SELECT
    EXISTS(SELECT 1 FROM proveedor WHERE nombre=ANY($1::text[])) OR
    EXISTS(SELECT 1 FROM producto WHERE referencia=ANY($2::text[])) OR
    EXISTS(SELECT 1 FROM factura WHERE numero=ANY($3::text[])) AS existe`,
    [PROVEEDORES.map(p=>p.nombre),PRODUCTOS.map((_,i)=>`ZZ-DEMO-PROV-${i+1}`),['ZZ-DEMO-PROV-FACT-1','ZZ-DEMO-PROV-FACT-2']]);
  if(r.existe)throw new ErrorDemo('El conjunto ya existe; no se duplica ni se modifica.');
  const m={version:1,marca:MARCA,fecha,proveedores:[],productos:[],facturas:[],faltantes:[],mapeos:[]};
  for(const p of PROVEEDORES) {
    const {rows:[fila]}=await db.query(`INSERT INTO proveedor
      (nombre,tipo_identificacion,identificacion,observaciones)
      VALUES ($1,'EXTRANJERO',$2,$3) RETURNING id`,[p.nombre,p.clave,MARCA]);
    m.proveedores.push({...p,id:fila.id});
  }
  for(let i=0;i<2;i++) {
    const numero=`ZZ-DEMO-PROV-FACT-${i+1}`;
    const {rows:[fila]}=await db.query(`INSERT INTO factura
      (numero,estado,fecha,cliente_nombre,observaciones,estado_bodega,bodega_observaciones)
      VALUES ($1,'borrador',$2,$3,$4,'procesado',$4) RETURNING id`,
      [numero,fecha,`ZZ-DEMO Cliente ${i+1} [PRUEBA]`,MARCA]);
    m.facturas.push({id:fila.id,numero});
  }
  for(const [i,p] of PRODUCTOS.entries()) {
    const referencia=`ZZ-DEMO-PROV-${i+1}`, proveedor=m.proveedores[p.proveedor];
    const {rows:[producto]}=await db.query(`INSERT INTO producto
      (nombre,referencia,descripcion,precio_sin_iva,costo_con_iva,inventariable)
      VALUES ($1,$2,$3,100,75,false) RETURNING id`,[p.nombre,referencia,MARCA]);
    m.productos.push({id:producto.id,referencia,nombre:p.nombre});
    const {rows:[mapa]}=await db.query(`INSERT INTO supplier_product_mapping
      (supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,
       alegra_reference,alegra_name,producto_id,proveedor_id,origen,factor_conversion)
      VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8,'manual',1) RETURNING id`,
      [proveedor.nombre,proveedor.clave,`ZZ-SKU-${i+1}`,`PRUEBA proveedor: ${p.nombre}`,referencia,p.nombre,producto.id,proveedor.id]);
    m.mapeos.push(mapa.id);
    const factura=m.facturas[p.proveedor];
    await db.query(`INSERT INTO factura_linea
      (factura_id,numero_linea,producto_id,nombre,referencia,descripcion,cantidad,precio_unitario,total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,100,$8)`,[factura.id,i+1,producto.id,p.nombre,referencia,p.nota,p.cantidad,p.cantidad*100]);
    const {rows:[faltante]}=await db.query(`INSERT INTO faltantes
      (factura_propia_id,producto_propio_id,cantidad_faltante,tipo_faltante,estado,
       proveedor_asignado,proveedor_cedula,precio_asignado,asignacion_tipo,mapping_id,observaciones,descripcion_factura)
      VALUES ($1,$2,$3,'total','pendiente',$4,$5,75,'manual',$6,$7,$8) RETURNING id`,
      [factura.id,producto.id,p.cantidad,proveedor.nombre,proveedor.clave,mapa.id,MARCA,p.nota]);
    m.faltantes.push(faltante.id);
  }
  await db.query(`UPDATE factura f SET subtotal=s.total,total=s.total
    FROM (SELECT factura_id,sum(total) AS total FROM factura_linea
      WHERE factura_id=ANY($1::int[]) GROUP BY factura_id) s WHERE f.id=s.factura_id`,[m.facturas.map(f=>f.id)]);
  return m;
}

async function retirar(db,m) {
  if(m?.version!==1 || m.marca!==MARCA || m.facturas?.length!==2 || m.productos?.length!==5 || m.proveedores?.length!==2)
    throw new ErrorDemo('Manifiesto de demostración inválido.');
  const facturas=m.facturas.map(f=>f.id), productos=m.productos.map(p=>p.id), proveedores=m.proveedores.map(p=>p.id);
  // Si se emitió, cobró o reutilizó algo, los controles y FKs abortan TODA
  // la retirada. No hacer CASCADE, ni borrar por un prefijo genérico zz.
  const {rows}=await db.query('SELECT id,estado,observaciones FROM factura WHERE id=ANY($1::int[]) FOR UPDATE',[facturas]);
  if(rows.length!==2 || rows.some(r=>r.estado!=='borrador' || r.observaciones!==MARCA))throw new ErrorDemo('Los borradores de prueba cambiaron; revisar antes de retirar.');
  for(const [tabla,ids,columna] of [['producto',productos,'descripcion'],['proveedor',proveedores,'observaciones']]) {
    const r=await db.query(`SELECT id FROM ${tabla} WHERE id=ANY($1::int[]) AND ${columna}=$2 FOR UPDATE`,[ids,MARCA]);
    if(r.rows.length!==ids.length)throw new ErrorDemo('Una ficha de prueba cambió; revisar antes de retirar.');
  }
  await db.query('DELETE FROM faltantes_ajustes WHERE faltante_id IN (SELECT id FROM faltantes WHERE factura_propia_id=ANY($1::int[]))',[facturas]);
  // La revisión puede mandar un borrador demo a Impresión. Esta fila también
  // pertenece al conjunto: se retira por su FK propio, sin limpiar la cola.
  await db.query('DELETE FROM facturas_reimpresion WHERE factura_propia_id=ANY($1::int[])',[facturas]);
  await db.query('DELETE FROM faltantes WHERE factura_propia_id=ANY($1::int[])',[facturas]);
  await db.query('DELETE FROM factura WHERE id=ANY($1::int[])',[facturas]);
  await db.query('DELETE FROM orden_compra_temporal WHERE proveedor_nombre=ANY($1::text[])',[PROVEEDORES.map(p=>p.nombre)]);
  await db.query('DELETE FROM proveedor_contactos WHERE nombre_proveedor=ANY($1::text[])',[PROVEEDORES.map(p=>p.nombre)]);
  await db.query('DELETE FROM supplier_product_mapping WHERE id=ANY($1::uuid[]) AND producto_id=ANY($2::int[]) AND proveedor_id=ANY($3::int[])',[m.mapeos,productos,proveedores]);
  await db.query('DELETE FROM producto WHERE id=ANY($1::int[])',[productos]);
  await db.query('DELETE FROM proveedor WHERE id=ANY($1::int[])',[proveedores]);
}

async function main() {
  const [accion,entrada,...resto]=process.argv.slice(2);
  if(!['crear','retirar'].includes(accion) || !path.isAbsolute(entrada||'') || resto.length)
    throw new ErrorDemo('Uso: demo-reporte-proveedores.js crear|retirar /ruta/privada/manifiesto.json');
  const ruta=path.resolve(entrada),repo=await fs.realpath(path.resolve(__dirname,'../../..'));
  const carpeta=await fs.realpath(path.dirname(ruta));
  if(carpeta===repo || carpeta.startsWith(repo+path.sep))throw new ErrorDemo('El manifiesto debe quedar fuera del repositorio.');
  require('dotenv').config({path:path.resolve(__dirname,'../../.env'),quiet:true});
  const a=require('../../config/aislado');a.asegurarBaseLocal();
  // Asegurar también las propiedades reales, aunque haya llaves de escape.
  if(!a.esBaseLocal(process.env.DATABASE_URL) || !a.salidasBloqueadas() || process.env.NODE_TEST_CONTEXT)
    throw new ErrorDemo('La demostración requiere una base local y las salidas bloqueadas.');
  const {Client}=require('pg'),db=new Client({connectionString:process.env.DATABASE_URL});
  let archivo,transaccion=false,commitIntentado=false;
  try {
    if(accion==='crear')archivo=await fs.open(ruta,'wx',0o600);
    const m=accion==='retirar'?JSON.parse(await fs.readFile(ruta,'utf8')):null;
    await db.connect();await db.query('BEGIN');transaccion=true;
    await db.query("SET LOCAL TIME ZONE 'America/Costa_Rica'");
    await db.query('SELECT pg_advisory_xact_lock(20261004,510)');
    if(accion==='crear') {
      const creado=await crear(db,hoyEnCostaRica());
      await archivo.writeFile(JSON.stringify(creado,null,2)+'\n');await archivo.sync();
    }else await retirar(db,m);
    // Si se pierde la respuesta de COMMIT, conservar los ids para revisar
    // el resultado. Borrar el manifiesto podría dejar la demo sin retirada.
    commitIntentado=true;await db.query('COMMIT');transaccion=false;
    console.log(accion==='crear'?'Demostración creada: 2 proveedores, 5 productos, 2 borradores y 5 faltantes.':'Conjunto de demostración retirado.');
  }catch(e){if(transaccion)await db.query('ROLLBACK').catch(()=>{});throw e;}
  finally{
    await db.end();
    if(archivo){await archivo.close();if(!commitIntentado)await fs.unlink(ruta);}
  }
}
if(require.main===module)main().catch(e=>{console.error('Demostración no completada:',e instanceof ErrorDemo ? e.message : e.code || 'Error de lectura o escritura; no se muestran datos de conexión.');process.exitCode=1;});
module.exports={crear,retirar,MARCA,PROVEEDORES,PRODUCTOS};
