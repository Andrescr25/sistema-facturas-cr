import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

const BASE='/orden-compra/por-ciclo'

/** Consultar no crea pedidos ni repone exclusiones de una revisión manual. */
export function useComprasProveedores(filtro) {
  const [proveedores,setProveedores]=useState([]),[cargando,setCargando]=useState(true)
  const [error,setError]=useState(''),[preparando,setPreparando]=useState(false)
  const [revision,setRevision]=useState(0),lectura=useRef(0)
  const ambito=JSON.stringify(filtro.params),actual=useRef(ambito);actual.current=ambito
  useEffect(()=>{
    const n=++lectura.current;setCargando(true);setError('');setProveedores([])
    api.get(BASE+'/resumen',{params:filtro.params}).then(({data})=>{if(n===lectura.current)setProveedores(data.data||[])})
      .catch(e=>{if(n===lectura.current)setError(e.response?.data?.message||'No se pudo consultar la compra por proveedor.')})
      .finally(()=>{if(n===lectura.current)setCargando(false)})
    return()=>{lectura.current++}
  },[ambito,revision])
  const actualizar=useCallback(()=>setRevision(r=>r+1),[])
  useEffect(()=>{window.addEventListener('focus',actualizar);return()=>window.removeEventListener('focus',actualizar)},[actualizar])
  const preparar=async proveedorId=>{
    const contexto=actual.current;setPreparando(true);setError('')
    try{
      await api.post(BASE+'/sincronizar',{...filtro.params,...(proveedorId?{proveedorId}:{})})
      if(contexto===actual.current)actualizar()
    }catch(e){if(contexto===actual.current)setError(e.response?.data?.message||'No se pudieron preparar los faltantes.')}
    finally{setPreparando(false)}
  }
  return{proveedores,cargando,error,preparando,actualizar,preparar}
}
