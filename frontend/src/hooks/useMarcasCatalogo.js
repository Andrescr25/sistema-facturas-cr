import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { normalizarTexto } from '../utils/catalogoAgentePersonalizacion'
import { compararPresentaciones } from '../utils/marcasCatalogo'

const mensajeDe = e => e.response?.data?.message || 'No se pudo guardar la marca.'

export function useMarcasCatalogo(subcategoriaId) {
  const [datos, setDatos] = useState({ marcas: [], productos: [] })
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [edicion, setEdicion] = useState(null)
  const [nombre, setNombre] = useState('')
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async signal => {
    const { data } = await api.get(`/maestro/subcategorias/${subcategoriaId}/marcas`, { signal })
    setDatos(data.data)
    return data.data
  }, [subcategoriaId])

  useEffect(() => {
    const abortar = new AbortController()
    setCargando(true)
    cargar(abortar.signal).catch(e => { if (!abortar.signal.aborted) setError(mensajeDe(e)) })
      .finally(() => { if (!abortar.signal.aborted) setCargando(false) })
    return () => abortar.abort()
  }, [cargar])

  function editar(marca) {
    setEdicion(marca || { id: null, imagen: null })
    setNombre(marca?.nombre || '')
    setSeleccionados(new Set(datos.productos.filter(p => p.marca_catalogo_id === marca?.id).map(p => p.id)))
    setBusqueda(''); setError(''); setAviso('')
  }

  async function ejecutar(trabajo) {
    setOcupado(true); setError(''); setAviso('')
    try { await trabajo() } catch (e) { setError(mensajeDe(e)) }
    finally { setOcupado(false) }
  }

  const guardar = () => ejecutar(async () => {
    const url = `/maestro/subcategorias/${subcategoriaId}/marcas`
    const cuerpo = { nombre, productoIds: [...seleccionados] }
    const { data } = edicion.id ? await api.put(`${url}/${edicion.id}`, cuerpo) : await api.post(url, cuerpo)
    setEdicion(data.data)
    await cargar()
    setAviso('Marca guardada. Podés asignarle su foto general.')
  })

  const subirImagen = archivo => ejecutar(async () => {
    if (!archivo) return
    const cuerpo = new FormData()
    cuerpo.append('imagen', archivo)
    const { data } = await api.post(`/maestro/marcas/${edicion.id}/imagen`, cuerpo, { headers: { 'Content-Type': 'multipart/form-data' } })
    setEdicion(m => ({ ...m, imagen: data.data.imagen }))
    await cargar()
    setAviso('Foto general guardada. Las fotos de los productos se conservan.')
  })

  const quitarImagen = () => ejecutar(async () => {
    await api.delete(`/maestro/marcas/${edicion.id}/imagen`)
    setEdicion(m => ({ ...m, imagen: null }))
    await cargar()
  })

  const eliminar = () => ejecutar(async () => {
    await api.delete(`/maestro/marcas/${edicion.id}`)
    setEdicion(null)
    await cargar()
    setAviso('Marca retirada; sus productos siguen en la subcategoría.')
  })

  const visibles = useMemo(() => {
    const t = normalizarTexto(busqueda)
    return datos.productos.filter(p => !t || normalizarTexto(`${p.nombre} ${p.referencia || ''}`).includes(t)).sort(compararPresentaciones)
  }, [datos.productos, busqueda])

  const alternar = id => setSeleccionados(prev => {
    const siguiente = new Set(prev)
    if (siguiente.has(id)) siguiente.delete(id)
    else siguiente.add(id)
    return siguiente
  })

  return { ...datos, cargando, ocupado, error, aviso, edicion, nombre, setNombre, busqueda, setBusqueda,
    seleccionados, visibles, alternar, editar, guardar, subirImagen, quitarImagen, eliminar,
    volver: () => { setEdicion(null); setError(''); setAviso('') } }
}
