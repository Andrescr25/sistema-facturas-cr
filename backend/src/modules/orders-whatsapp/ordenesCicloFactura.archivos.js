const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const almacen=require('../../integrations/almacenamiento/local');
const {httpError}=require('../../utils/validacion');
const CARPETA='ordenes-facturas',MAX=5*1024*1024;
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
function validarPdf(buffer){
  if(!Buffer.isBuffer(buffer)||buffer.length<5||buffer.subarray(0,5).toString()!=='%PDF-'||!buffer.subarray(-1024).includes(Buffer.from('%%EOF')))
    throw httpError(400,'Subí un archivo PDF válido.');
  if(buffer.length>MAX)throw httpError(413,'El PDF supera 5 MB.');
}
async function carpetaSegura(){
  await fs.mkdir(path.join(almacen.RAIZ_PRIVADA,CARPETA),{recursive:true,mode:0o700});
  const raiz=await fs.realpath(almacen.RAIZ_PRIVADA),carpeta=await fs.realpath(path.join(almacen.RAIZ_PRIVADA,CARPETA));
  if(carpeta!==path.join(raiz,CARPETA))throw httpError(409,'El almacenamiento privado no está disponible.');
}
async function guardar(buffer,id){
  validarPdf(buffer);await carpetaSegura();
  const a=await almacen.guardarArchivo({carpeta:CARPETA,prefijo:id,extension:'pdf',buffer,maximoBytes:MAX});
  await fs.chmod(path.join(almacen.RAIZ_PRIVADA,a.ruta),0o600);
  return {...a,sha256:sha(buffer)};
}
async function leer(a){
  if(!/^ordenes-facturas\/[a-z0-9-]+\.pdf$/.test(a.ruta))throw httpError(409,'La ruta privada del PDF no es válida.');
  await carpetaSegura();const destino=path.join(almacen.RAIZ_PRIVADA,a.ruta);let estado;
  try{estado=await fs.lstat(destino)}catch(e){if(e.code==='ENOENT')throw httpError(404,'El PDF guardado no está disponible; no se regeneró.');throw e}
  if(!estado.isFile()||estado.isSymbolicLink()||estado.size>MAX)throw httpError(409,'El archivo privado del PDF no es válido.');
  const buffer=await fs.readFile(destino);validarPdf(buffer);
  if(buffer.length!==a.bytes||sha(buffer)!==a.sha256)throw httpError(409,'El PDF guardado cambió; no coincide con la copia vinculada.');
  return buffer;
}
module.exports={guardar,leer,validarPdf,sha,borrar:almacen.borrarPrivado};
