const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),sharp=require('sharp');
let directorio,raiz,servicio,original;
before(async()=>{
 directorio=await fs.mkdtemp(path.join(os.tmpdir(),'tachi-fotos-pdf-'));raiz=path.join(directorio,'publico');await fs.mkdir(raiz);
 process.env.ALMACENAMIENTO_DIR=raiz;process.env.ALMACENAMIENTO_PRIVADO_DIR=path.join(directorio,'privado');
 servicio=require('../src/modules/portal-clientes/preventaFotos.service');
 original=await sharp({create:{width:1200,height:800,channels:3,background:'#ed7c25'}}).webp().toBuffer();
 await fs.writeFile(path.join(raiz,'producto.webp'),original);
});
after(async()=>{if(directorio)await fs.rm(directorio,{recursive:true,force:true});});
test('foto WEBP se incluye como JPEG pequeño y conserva el original',async()=>{
 const foto=await servicio.miniatura('/archivos/producto.webp');assert.ok(Buffer.isBuffer(foto));
 const m=await sharp(foto).metadata();assert.equal(m.format,'jpeg');assert.ok(m.width<=480&&m.height<=360);assert.ok(m.width>192,'La foto conserva resolución para la tarjeta grande');assert.ok(foto.length<original.length);
 assert.deepEqual(await fs.readFile(path.join(raiz,'producto.webp')),original);
});
test('ni traversal ni enlace simbólico permiten leer fotos fuera de almacenamiento',async()=>{
 await fs.writeFile(path.join(directorio,'secreto.webp'),original);await fs.symlink(path.join(directorio,'secreto.webp'),path.join(raiz,'enlace.webp'));
 assert.equal(await servicio.miniatura('/archivos/../secreto.webp'),null);assert.equal(await servicio.miniatura('/archivos/enlace.webp'),null);
});
test('ausencia o archivo corrupto devuelve una imagen faltante, sin tumbar el catálogo',async()=>{
 await fs.writeFile(path.join(raiz,'corrupto.png'),'no es una foto');
 for(const url of [null,'','/archivos/ausente.jpg','/archivos/corrupto.png','file:///etc/passwd'])assert.equal(await servicio.miniatura(url),null);
 const modelo={secciones:[{productos:[{imagen:'/archivos/producto.webp'},{imagen:'/archivos/ausente.jpg'}]}]};
 assert.deepEqual(await servicio.incorporarFotos(modelo),{incluidas:1,faltantes:1});assert.ok(modelo.secciones[0].productos[0].foto);assert.equal(modelo.secciones[0].productos[1].foto,null);
});
test('reemplazar una foto cambia la miniatura; repetir sin cambio conserva bytes',async()=>{
 const a=await servicio.miniatura('/archivos/producto.webp');assert.deepEqual(a,await servicio.miniatura('/archivos/producto.webp'));
 const nueva=await sharp({create:{width:700,height:700,channels:3,background:'#222222'}}).png().toBuffer();await fs.writeFile(path.join(raiz,'producto.webp'),nueva);
 const b=await servicio.miniatura('/archivos/producto.webp');assert.notDeepEqual(a,b);
});
test('aislamiento bloquea fotos remotas sin desactivar la guarda de WhatsApp',async()=>{
 const contexto=process.env.NODE_TEST_CONTEXT;delete process.env.NODE_TEST_CONTEXT;
 try{assert.equal(require('../config/aislado').salidasBloqueadas(),true);assert.equal(await servicio.miniatura('https://cdn3.alegra.com/imagen.jpg'),null);}
 finally{if(contexto!==undefined)process.env.NODE_TEST_CONTEXT=contexto;}
});
