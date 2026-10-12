import { useCallback, useEffect, useRef, useState } from 'react'
import { bodegaPropiaService } from '../services/bodegaPropiaService'
import { aplicarEstadosGuardados, buildDraftForFactura } from '../utils/facturasBodegaUtils'

/** El borrador se conserva; la vigencia se comprueba en el servidor. */
export function useFacturaBodegaAbierta({ seleccionadaRef, claves, leer, escribir, borrar, setAviso, alInvalidar }) {
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null)
  const [faltantesDraft, setFaltantesDraft] = useState({})
  const [cargandoEstados, setCargandoEstados] = useState(false)
  const facturaRef = useRef(null)
  const consultaRef = useRef(0)

  const cerrarFactura = useCallback(() => {
    ++consultaRef.current
    seleccionadaRef.current = null
    facturaRef.current = null
    setFacturaSeleccionada(null)
    setFaltantesDraft({})
    setCargandoEstados(false)
    borrar(claves.selected)
  }, [seleccionadaRef, borrar, claves])

  const descartarSiNoVigente = useCallback((error, factura) => {
    if (error.response?.data?.code !== 'FACTURA_NO_VIGENTE') return false
    if (seleccionadaRef.current !== factura.factura_id) return true
    cerrarFactura()
    alInvalidar(factura.factura_id)
    setAviso(error.response.data.message)
    return true
  }, [seleccionadaRef, cerrarFactura, alInvalidar, setAviso])

  const consultar = useCallback(async (factura, cargarEstados = false) => {
    const miConsulta = ++consultaRef.current
    setCargandoEstados(true)
    try {
      const estados = await bodegaPropiaService.estados(factura.factura_id)
      if (miConsulta !== consultaRef.current) return
      if (cargarEstados) setFaltantesDraft(aplicarEstadosGuardados(buildDraftForFactura(factura), estados))
    } catch (err) {
      if (miConsulta !== consultaRef.current) return
      if (!descartarSiNoVigente(err, factura)) setAviso('No se pudo comprobar la factura. Lo marcado se conserva; intentá actualizar antes de despachar.')
    } finally {
      if (miConsulta === consultaRef.current) setCargandoEstados(false)
    }
  }, [descartarSiNoVigente, setAviso])

  const abrirFactura = useCallback(async (factura) => {
    seleccionadaRef.current = factura.factura_id
    facturaRef.current = factura
    setFacturaSeleccionada(factura)
    escribir(claves.selected, factura.factura_id)
    const base = buildDraftForFactura(factura)
    const esPendiente = factura.estado_bodega !== 'procesado'
    let enProgreso = null
    if (esPendiente) {
      try { enProgreso = JSON.parse(leer(claves.draft(factura.factura_id)) || 'null') } catch { /* borrador ilegible */ }
    }
    setFaltantesDraft(enProgreso && Object.keys(base).every(k => enProgreso[k]) ? enProgreso : base)
    // También las pendientes cacheadas: una factura pudo anularse mientras
    // esta pestaña estaba cerrada. La validación nunca pisa su borrador.
    await consultar(factura, !esPendiente)
  }, [seleccionadaRef, claves, leer, escribir, consultar])

  const verificarFacturaAbierta = useCallback(() => {
    if (facturaRef.current) return consultar(facturaRef.current)
  }, [consultar])

  useEffect(() => {
    if (!facturaSeleccionada || cargandoEstados || facturaSeleccionada.estado_bodega === 'procesado') return
    if (Object.keys(faltantesDraft).length > 0) escribir(claves.draft(facturaSeleccionada.factura_id), JSON.stringify(faltantesDraft))
  }, [facturaSeleccionada, faltantesDraft, cargandoEstados, claves, escribir])
  useEffect(() => () => { ++consultaRef.current }, [])

  return { facturaSeleccionada, faltantesDraft, setFaltantesDraft, cargandoEstados,
    abrirFactura, cerrarFactura, verificarFacturaAbierta, descartarSiNoVigente }
}
