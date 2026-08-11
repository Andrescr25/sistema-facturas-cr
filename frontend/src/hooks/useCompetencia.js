import { useCallback, useEffect, useState } from 'react'
import {
  getPendientesCompetencia,
  getConfirmadosCompetencia,
  confirmarMatchCompetencia,
  rechazarMatchCompetencia,
  importarManualCompetencia,
  sincronizarCompetencia
} from '../services/rentabilidadService'

function claveSugerencia(s) {
  return `${s.fuente}::${s.skuExterno}`
}

/**
 * Estado de la pestaña Competencia. Los "pendientes" son sugerencias de
 * emparejamiento (nada se auto-confirma, ver
 * backend/src/modules/rentabilidad/competencia/emparejador.js) — confirmar
 * o rechazar quita la fila de la lista de inmediato (optimista) porque el
 * backend ya no la va a devolver en el próximo cálculo.
 */
export function useCompetencia() {
  const [pendientes, setPendientes] = useState([])
  const [loadingPendientes, setLoadingPendientes] = useState(true)
  const [confirmados, setConfirmados] = useState([])
  const [loadingConfirmados, setLoadingConfirmados] = useState(true)
  const [enCurso, setEnCurso] = useState(() => new Set())
  const [error, setError] = useState(null)

  const [sincronizando, setSincronizando] = useState(false)
  const [resultadoSync, setResultadoSync] = useState(null)

  const [importando, setImportando] = useState(false)
  const [resultadoImport, setResultadoImport] = useState(null)

  const cargarPendientes = useCallback(async () => {
    setLoadingPendientes(true)
    try {
      const data = await getPendientesCompetencia()
      setPendientes(data.sugerencias || [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar las sugerencias de competencia')
    } finally {
      setLoadingPendientes(false)
    }
  }, [])

  const cargarConfirmados = useCallback(async () => {
    setLoadingConfirmados(true)
    try {
      const data = await getConfirmadosCompetencia()
      setConfirmados(data.mapeos || [])
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los mapeos confirmados')
    } finally {
      setLoadingConfirmados(false)
    }
  }, [])

  useEffect(() => {
    cargarPendientes()
    cargarConfirmados()
  }, [cargarPendientes, cargarConfirmados])

  const confirmar = useCallback(async (sugerencia) => {
    const clave = claveSugerencia(sugerencia)
    setEnCurso((prev) => new Set(prev).add(clave))
    try {
      await confirmarMatchCompetencia({
        fuente: sugerencia.fuente,
        skuExterno: sugerencia.skuExterno,
        nombreExterno: sugerencia.nombreExterno,
        alegraItemId: sugerencia.sugerido.alegraItemId,
        confianza: sugerencia.sugerido.score
      })
      setPendientes((prev) => prev.filter((s) => claveSugerencia(s) !== clave))
      cargarConfirmados()
    } catch (err) {
      setError(err.message || 'No se pudo confirmar el emparejamiento')
    } finally {
      setEnCurso((prev) => { const next = new Set(prev); next.delete(clave); return next })
    }
  }, [cargarConfirmados])

  const rechazar = useCallback(async (sugerencia) => {
    const clave = claveSugerencia(sugerencia)
    setEnCurso((prev) => new Set(prev).add(clave))
    try {
      await rechazarMatchCompetencia({ fuente: sugerencia.fuente, skuExterno: sugerencia.skuExterno })
      setPendientes((prev) => prev.filter((s) => claveSugerencia(s) !== clave))
    } catch (err) {
      setError(err.message || 'No se pudo rechazar el emparejamiento')
    } finally {
      setEnCurso((prev) => { const next = new Set(prev); next.delete(clave); return next })
    }
  }, [])

  const importar = useCallback(async (fuente, filas) => {
    setImportando(true)
    setResultadoImport(null)
    try {
      const data = await importarManualCompetencia({ fuente, filas })
      setResultadoImport(data)
      await cargarPendientes()
      return data
    } catch (err) {
      setError(err.message || 'No se pudo importar la lista')
      return null
    } finally {
      setImportando(false)
    }
  }, [cargarPendientes])

  const sincronizar = useCallback(async ({ categoria, limite }) => {
    setSincronizando(true)
    setResultadoSync(null)
    try {
      const data = await sincronizarCompetencia({ categoria, limite })
      setResultadoSync(data)
      await cargarPendientes()
      return data
    } catch (err) {
      setError(err.message || 'No se pudo sincronizar contra la competencia')
      return null
    } finally {
      setSincronizando(false)
    }
  }, [cargarPendientes])

  return {
    pendientes,
    loadingPendientes,
    confirmados,
    loadingConfirmados,
    enCurso,
    error,
    confirmar,
    rechazar,
    importar,
    importando,
    resultadoImport,
    sincronizar,
    sincronizando,
    resultadoSync
  }
}
