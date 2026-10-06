const router=require('express').Router();
const service=require('./entregas.service');
const {listarCiclos}=require('../rutas/operacionCiclo.service');
const responder=(res,resultado)=>resultado.then(data=>res.json({success:true,data}))
  .catch(e=>res.status(e.status||500).json({success:false,message:e.status?e.message:'No se pudo consultar la ruta.'}));
// Todo el prefijo pertenece al permiso Entregas, incluidos Maps y el selector.
// Esta parte solo consulta: no interpreta bodega revisada como entrega real.
router.get('/ciclos',(req,res)=>responder(res,listarCiclos()));
router.get('/plan',(req,res)=>responder(res,service.plan(req.query)));
router.get('/paradas/:clave',(req,res)=>responder(res,service.parada(req.params.clave,req.query)));
module.exports=router;
