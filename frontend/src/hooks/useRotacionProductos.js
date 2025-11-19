import { useCallback, useEffect, useState } from 'react'
import { getRotacionProductos } from '../services/rotacionService'

const DEFAULT_CONFIG = { semanas: 12, limite: 50 }

export function useRotacionProductos(initialConfig = DEFAULT_CONFIG) {
  const [config, setConfig] = useState({ ...DEFAULT_CONFIG, ...initialConfig })
  const [productos, setProductos] = useState([])
  const [resumen, setResumen] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadRotacion = useCallback(async (overrideConfig) => {
    const effectiveConfig = overrideConfig || config
    try {
      setLoading(true)
      setError(null)
      const result = await getRotacionProductos(effectiveConfig)

      if (result?.success === false) {
        setProductos([])
        setResumen(null)
        setInsights(null)
        setError(result.message || 'No se pudo cargar la rotación')
        return
      }

      setProductos(result?.data || [])
      setResumen(result?.resumen || null)
      setInsights(result?.insights || null)
    } catch (err) {
      setProductos([])
      setResumen(null)
      setInsights(null)
      setError(err.message || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    loadRotacion(config)
  }, [config, loadRotacion])

  const updateConfig = (partialConfig) => {
    setConfig((prev) => ({
      ...prev,
      ...partialConfig
    }))
  }

  return {
    productos,
    resumen,
    insights,
    loading,
    error,
    config,
    setConfig: updateConfig,
    reload: () => loadRotacion(config)
  }
}

