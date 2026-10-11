import {useEffect,useState} from 'react'
import api from '../services/api'

/** Una respuesta tardía nunca reemplaza la semana nueva. Sólo consulta. */
export function useNecesidadesCiclo(filtro){
 const [q,setQ]=useState(''),[pagina,setPagina]=useState(1),[revision,setRevision]=useState(0)
 const [datos,setDatos]=useState(null),[error,setError]=useState(''),[cargando,setCargando]=useState(false)
 const [ambito,setAmbito]=useState(''),actual=`${filtro.rutaId}|${filtro.cicloId}|${q}`
 const vigente=ambito===actual
 useEffect(()=>{setAmbito(actual);setPagina(1);setDatos(null)},[actual])
 useEffect(()=>{
  let vivo=true;setDatos(null);setError('');setCargando(false)
  if(!filtro.cicloId||!vigente)return()=>{vivo=false}
  const timer=setTimeout(()=>{
   setCargando(true)
   api.get('/reportes/faltantes/proveedor/necesidades',{params:{...filtro.params,q,pagina}})
    .then(({data})=>{if(vivo)setDatos(data.data)})
    .catch(e=>{if(vivo)setError(e.response?.data?.message||'No se pudo consultar esta semana.')})
    .finally(()=>{if(vivo)setCargando(false)})
  },q?250:0)
  return()=>{vivo=false;clearTimeout(timer)}
 },[filtro.params,q,pagina,revision,vigente])
 return{datos:vigente?datos:null,error,cargando,q,setQ,pagina,setPagina,actual,actualizar:()=>setRevision(n=>n+1)}
}
