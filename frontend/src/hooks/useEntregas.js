import { useEffect, useState } from 'react'
import api from '../services/api'
import { useFiltroCicloOperacion } from './useFiltroCicloOperacion'

/** Cambiar de semana invalida lecturas anteriores, incluso respuestas lentas. */
export function useEntregas() {
  const filtro=useFiltroCicloOperacion('/entregas/ciclos')
  const ambito=`${filtro.rutaId}|${filtro.cicloId}`
  const [pagina,setPagina]=useState(1),[clave,setClave]=useState(null),[revision,setRevision]=useState(0)
  const [revisionPlan,setRevisionPlan]=useState(0)
  const [plan,setPlan]=useState(null),[detalle,setDetalle]=useState(null)
  const [error,setError]=useState(''),[errorDetalle,setErrorDetalle]=useState('')
  const [cargando,setCargando]=useState(false),[cargandoDetalle,setCargandoDetalle]=useState(false)
  const [contexto,setContexto]=useState(ambito)
  const vigente=contexto===ambito
  useEffect(()=>{setContexto(ambito);setPagina(1);setClave(null);setDetalle(null);setPlan(null)},[ambito])
  useEffect(()=>{
    let vivo=true;setPlan(null);setError('');setCargando(false)
    if(!filtro.cicloId||!vigente)return()=>{vivo=false}
    setCargando(true)
    api.get('/entregas/plan',{params:{...filtro.params,pagina}}).then(({data})=>{if(vivo)setPlan(data.data)})
      .catch(e=>{if(vivo)setError(e.response?.data?.message||'No se pudo consultar la ruta.')})
      .finally(()=>{if(vivo)setCargando(false)})
    return()=>{vivo=false}
  },[filtro.params,pagina,revision,revisionPlan,vigente])
  useEffect(()=>{
    let vivo=true;setDetalle(null);setErrorDetalle('');setCargandoDetalle(false)
    if(!clave||!vigente)return()=>{vivo=false}
    setCargandoDetalle(true)
    api.get('/entregas/paradas/'+clave,{params:filtro.params}).then(({data})=>{if(vivo)setDetalle(data.data)})
      .catch(e=>{if(vivo)setErrorDetalle(e.response?.data?.message||'No se pudo consultar la parada.')})
      .finally(()=>{if(vivo)setCargandoDetalle(false)})
    return()=>{vivo=false}
  },[clave,filtro.params,revision,vigente])
  return{filtro,plan:vigente?plan:null,detalle:vigente?detalle:null,error,errorDetalle,cargando,cargandoDetalle,
    seleccion:vigente?clave:null,pagina,cambiarPagina:setPagina,
    abrir:(p)=>{setClave(p.clave);if(p.pagina)setPagina(p.pagina)},volver:()=>setClave(null),
    actualizar:()=>setRevision(r=>r+1),actualizarPlan:()=>setRevisionPlan(r=>r+1)}
}
