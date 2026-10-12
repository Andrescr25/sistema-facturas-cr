import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { rutasService } from '../services/rutasService'
import {
  estadoDe, coincide, alternar, marcarTodos, porMarcar, cambiosDe, marcasVigentes, hechoDe
} from '../utils/asignacionRuta'

/**
 * El estado de "Asignar clientes" de una ruta: la lista, las marcas y guardar.
 *
 * La pantalla (components/clientes/AsignarClientesRuta.jsx) solo dibuja; las
 * cuentas son de utils/asignacionRuta.js. Acá vive lo del medio: qué se
 * cargó, qué se marcó, y las dos preguntas que se hacen antes de perder o de
 * mover algo.
 *
 * NADA SE MANDA HASTA `guardar`. Sacar a un cliente de una ruta le hace
 * perder su puesto en el recorrido, y traerlo de otra lo saca de allá: con
 * guardado inmediato, un toque de más ya hizo ese daño.
 */
export default function useAsignarClientesRuta({ ruta, modelo: m, confirm, onVolver }) {
  const [clientes, setClientes] = useState(null)
  const [error, setError] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState({ estado: 'sin-ruta', dias: 'todos' })
  // id → de qué ruta lo vi al tocarlo, en el orden de los toques.
  const [marcas, setMarcas] = useState(() => new Map())
  const peticion = useRef(0)

  const cargar = useCallback(async ({ conservar = false } = {}) => {
    const mia = ++peticion.current
    setError('')
    try {
      const r = await rutasService.candidatos(ruta.id)
      if (mia !== peticion.current) return
      setClientes(r.clientes)
      setMarcas(prev => (conservar ? marcasVigentes(prev, r.clientes) : new Map()))
      // Sin nadie por ubicar, la lista útil es la de todos.
      if (!conservar && !r.clientes.some(c => estadoDe(c, ruta.id) === 'sin-ruta')) setFiltros({ estado: 'todos', dias: 'todos' })
    } catch (e) {
      if (mia === peticion.current) setError(e.response?.data?.message || 'No se pudo cargar la lista de clientes.')
    }
  }, [ruta.id])
  useEffect(() => { cargar() }, [cargar])

  const cuenta = useMemo(() => {
    const c = { 'sin-ruta': 0, esta: 0, otra: 0 }
    for (const cliente of clientes || []) c[estadoDe(cliente, ruta.id)]++
    return c
  }, [clientes, ruta.id])

  const visibles = useMemo(() => (clientes || []).filter(c =>
    (filtros.estado === 'todos' || estadoDe(c, ruta.id) === filtros.estado) && coincide(c, busqueda)
  ), [clientes, filtros.estado, busqueda, ruta.id])

  const cambios = useMemo(() => cambiosDe(marcas, clientes || [], ruta.id), [marcas, clientes, ruta.id])
  const faltanMarcar = porMarcar(marcas, visibles, ruta.id)

  const volver = async () => {
    if (cambios.total > 0) {
      const ok = await confirm(
        `Hay ${cambios.total} ${cambios.total === 1 ? 'cambio' : 'cambios'} sin guardar en ${ruta.nombre}. Si salís ahora se pierden.`,
        { title: 'Salir sin guardar', confirmLabel: 'Salir sin guardar', variant: 'danger' })
      if (!ok) return
    }
    onVolver()
  }

  const guardar = async () => {
    // Traer a alguien de otra ruta lo saca de allá: eso se dice antes.
    if (cambios.movidos.length > 0) {
      const nombres = cambios.movidos.slice(0, 4).map(c => `${c.nombre} (${c.ruta_nombre})`).join(', ')
      const resto = cambios.movidos.length > 4 ? ` y ${cambios.movidos.length - 4} más` : ''
      const ok = await confirm(
        `${cambios.movidos.length === 1 ? 'Este cliente deja' : `Estos ${cambios.movidos.length} clientes dejan`} la ruta en la que ${cambios.movidos.length === 1 ? 'está' : 'están'} y ${cambios.movidos.length === 1 ? 'pasa' : 'pasan'} a ${ruta.nombre}: ${nombres}${resto}.`,
        { title: 'Cambiar de ruta', confirmLabel: 'Sí, pasarlos' })
      if (!ok) return
    }
    const r = await m.ejecutar(
      () => rutasService.asignar(ruta.id, { agregar: cambios.agregar, quitar: cambios.quitar }),
      `${ruta.nombre}: ${hechoDe(cambios)}`)
    // Si falló (alguien movió a un cliente mientras tanto), se relee y quedan
    // solo las marcas que siguen diciendo lo que se vio.
    await cargar({ conservar: !r })
  }

  return {
    clientes, error, cargar,
    busqueda, setBusqueda, filtros, setFiltros,
    marcas, cuenta, visibles, cambios, faltanMarcar,
    tocar: (c) => setMarcas(prev => alternar(prev, c)),
    marcarVisibles: () => setMarcas(prev => marcarTodos(prev, visibles, ruta.id)),
    descartar: () => setMarcas(new Map()),
    volver, guardar
  }
}
