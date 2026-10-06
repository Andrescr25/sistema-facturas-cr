const router=require('express').Router();
const s=require('./ordenesCiclo.service');
const envios=require('./ordenesCicloEnvio.service');
const facturas=require('./ordenesCicloFactura.service');
const recepcion=require('./ordenesCicloRecepcion.service');
const cierre=require('./ordenesCicloCierre.service');
const subirPdf=require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:4,fieldSize:2048}}).single('pdf');
// /orden-compra ya pertenece a Reporte Proveedores. La sugerencia es lectura,
// no asigna proveedores ni transforma el borrador GLOBAL anterior.
const responder=(res,p,status=200)=>p.then(data=>res.status(status).json({success:true,data}))
  .catch(e=>res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudo consultar o guardar la orden.'}));
router.get('/sugerencia',(req,res)=>responder(res,s.sugerir(req.query)));
router.get('/',(req,res)=>responder(res,s.listar(req.query)));
router.post('/',(req,res)=>responder(res,s.crear(req.body,req.usuario?.id),201));
router.get('/:id',(req,res)=>responder(res,s.obtener(req.params.id)));
router.put('/:id',(req,res)=>responder(res,s.editar(req.params.id,req.body,req.usuario?.id)));
router.patch('/:id/estado',(req,res)=>responder(res,s.cambiarEstado(req.params.id,req.body,req.usuario?.id)));
router.get('/:id/envios/propuesta',(req,res)=>responder(res,envios.propuesta(req.params.id)));
router.post('/:id/envios',(req,res)=>responder(res,envios.preparar(req.params.id,req.body,req.usuario?.id),201));
router.get('/:id/envios/:copiaId/pdf',async(req,res)=>{
  try{const {pdf,nombreArchivo}=await envios.descargar(req.params.id,req.params.copiaId);
    res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${nombreArchivo}"`,'Cache-Control':'private, no-store'}).send(pdf);
  }catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudo descargar la copia revisada.'})}
});
router.post('/:id/envios/:copiaId/enviar',(req,res)=>responder(res,envios.enviar(req.params.id,req.params.copiaId,req.body,req.usuario?.id)));
router.post('/:id/envios/:copiaId/verificar',(req,res)=>responder(res,envios.confirmarVerificado(req.params.id,req.params.copiaId,req.body,req.usuario?.id)));
router.get('/:id/facturas',(req,res)=>responder(res,facturas.consultar(req.params.id)));
router.get('/:id/facturas/candidatas',(req,res)=>responder(res,facturas.candidatas(req.params.id,req.query)));
router.get('/:id/facturas/propuesta/:facturaId',(req,res)=>responder(res,facturas.proponer(req.params.id,req.params.facturaId)));
router.post('/:id/facturas',(req,res)=>responder(res,facturas.vincular(req.params.id,req.body,req.usuario?.id),201));
router.post('/:id/facturas/:vinculoId/retirar',(req,res)=>responder(res,facturas.retirar(req.params.id,req.params.vinculoId,req.body,req.usuario?.id)));
router.post('/:id/facturas/:vinculoId/pdf',(req,res)=>{
  const guardar=()=>responder(res,facturas.guardarPdf(req.params.id,req.params.vinculoId,req.body,req.file?.buffer,req.usuario?.id),201);
  if(!req.is('multipart/form-data'))return guardar();
  subirPdf(req,res,e=>e?res.status(e.code==='LIMIT_FILE_SIZE'?413:400).json({success:false,message:'Subí un único PDF de hasta 5 MB.'}):guardar());
});
router.get('/:id/facturas/:vinculoId/pdf/:pdfId',async(req,res)=>{
  try{const {pdf,nombreArchivo}=await facturas.descargarPdf(req.params.id,req.params.vinculoId,req.params.pdfId);
    res.set({'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${nombreArchivo}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(pdf);
  }catch(e){res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudo abrir el PDF de la factura.'})}
});
router.get('/:id/recepciones',(req,res)=>responder(res,recepcion.consultar(req.params.id)));
router.post('/:id/recepciones',(req,res)=>responder(res,recepcion.registrar(req.params.id,req.body,req.usuario?.id),201));
router.get('/:id/cierre',(req,res)=>responder(res,cierre.consultar(req.params.id)));
router.post('/:id/cierre',(req,res)=>responder(res,cierre.cerrar(req.params.id,req.body,req.usuario?.id),201));
module.exports=router;
