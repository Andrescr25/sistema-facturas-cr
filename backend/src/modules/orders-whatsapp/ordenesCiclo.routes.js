const router=require('express').Router();
const s=require('./ordenesCiclo.service');
const envios=require('./ordenesCicloEnvio.service');
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
module.exports=router;
