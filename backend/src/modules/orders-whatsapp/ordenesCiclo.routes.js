const router=require('express').Router();
const s=require('./ordenesCiclo.service');
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
module.exports=router;
