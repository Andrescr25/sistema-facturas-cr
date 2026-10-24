import { useCallback, useEffect, useRef, useState } from 'react'
import {
  estadoFactura, emitirFactura, reenviarCorreo, estadoNota, emitirNota, reenviarCorreoNota,
  estadoCompra, aceptarCompra, operar, descargar, mensajeError
} from '../integrations/hacienda/api'
import { emitirPasoAPaso, FINALES, pideDatos } from '../utils/emisionPasos'

/**
 * La emisión electrónica de UNA factura, vista desde su pantalla: cómo va,
 * y el botón que la emite de un clic. El orden de los pasos y los textos
 * viven en utils/emisionPasos.js (sin React, con pruebas); acá solo se
 * conectan con el servidor y con el estado de la pantalla. Los componentes
 * que la dibujan (BotonEmitirFactura, PanelEmisionFactura) no llaman al
 * servidor: todo pasa por acá.
 *
 * `activo` apaga todo cuando la factura no se puede emitir desde acá
 * (histórica de Alegra, anulada, o mientras se edita).
 *
 * `origen: 'nota_credito'` hace lo mismo para una nota de crédito: mismos
 * pasos y mismo panel, con sus tres llamadas al servidor.
 *
 * `origen: 'compra'` es la aceptación de una compra ante Hacienda. Sale sola
 * al registrar la compra; acá se sigue cómo va y se termina si quedó a
 * medias. No tiene correo: no hay un cliente a quien entregarle nada.
 */
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** Cada cuánto se relee mientras Hacienda no contesta y nadie toca nada. */
const RELEER_MS = 15000

/** Las tres llamadas que cambian según el documento; lo demás es igual. */
const SERVIDOR = {
  factura: { estado: estadoFactura, emitir: emitirFactura, correo: reenviarCorreo },
  nota_credito: { estado: estadoNota, emitir: emitirNota, correo: reenviarCorreoNota },
  compra: { estado: estadoCompra, emitir: aceptarCompra }
}

export default function useEmisionFactura(facturaId, { activo = true, onCambio, origen = 'factura' } = {}) {
  const servidor = SERVIDOR[origen] || SERVIDOR.factura
  const [estado, setEstado] = useState(null)
  const [fase, setFase] = useState(null)
  const [error, setError] = useState('')
  const [pidiendoDatos, setPidiendoDatos] = useState(false)
  const [enviandoCorreo, setEnviandoCorreo] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [errorDescarga, setErrorDescarga] = useState('')

  // La factura que se está mirando AHORA. Una emisión tarda segundos: si
  // entre tanto se abrió otra factura, lo que llegue de la anterior no se
  // pinta encima.
  const actual = useRef(null)
  const avisar = useRef(onCambio)
  avisar.current = onCambio

  const leer = useCallback(async (id) => {
    const e = await servidor.estado(id)
    if (actual.current === id) setEstado(e)
    return e
  }, [servidor])

  useEffect(() => {
    actual.current = activo ? facturaId : null
    setEstado(null)
    setFase(null)
    setError('')
    setPidiendoDatos(false)
    if (!activo) return undefined
    leer(facturaId).catch(e => { if (actual.current === facturaId) setError(mensajeError(e)) })
    return () => { actual.current = null }
  }, [facturaId, activo, leer])

  // Mientras Hacienda no contesta, el servidor la consulta solo cada minuto
  // (si tiene encendido el seguimiento; `estado.seguimiento` lo dice). Acá se
  // relee lo que el servidor ya sabe (no se llama a Hacienda), para que la
  // aceptación aparezca sin tener que tocar nada.
  const comprobante = estado?.comprobante
  const esperandoSola = Boolean(activo && comprobante && !fase && estado.seguimiento &&
    ['recibida', 'procesando'].includes(comprobante.estado))
  useEffect(() => {
    if (!esperandoSola) return undefined
    const reloj = setInterval(async () => {
      try {
        const e = await leer(facturaId)
        if (FINALES.includes(e.comprobante?.estado)) avisar.current?.()
      } catch { /* se reintenta en la próxima vuelta */ }
    }, RELEER_MS)
    return () => clearInterval(reloj)
  }, [esperandoSola, facturaId, leer])

  /**
   * Emitir, o seguir con el comprobante que quedó a medias. `respuesta`
   * solo viene cuando el documento pidió un dato (descuento, medicamento,
   * con qué paga el cliente, qué hace la nota): ver `respuestaDe`.
   */
  const emitir = async (respuesta = {}) => {
    const contesto = Object.keys(respuesta).length > 0
    if (fase || !estado) return
    const id = facturaId
    const previo = estado.comprobante
    const rechazado = previo?.estado === 'rechazada'
    const continuar = Boolean(previo) && !rechazado
    setError('')
    if (!continuar && estado.motivoNoEmitible) return setError(estado.motivoNoEmitible)
    if (!continuar && pideDatos(estado) && !contesto) return setPidiendoDatos(true)

    const mia = () => actual.current === id
    setPidiendoDatos(false)
    setFase(continuar ? 'enviando' : 'firmando')
    // Al volver a emitir un rechazado, el panel arranca de cero.
    if (rechazado) setEstado(e => ({ ...e, comprobante: null, correo: null }))
    try {
      await emitirPasoAPaso({
        comprobante: continuar ? previo : null,
        firmar: () => servidor.emitir(id, { sustituir: rechazado, ...respuesta }),
        enviar: (c) => operar(c, 'enviar'),
        consultar: (c) => operar(c, 'consultar'),
        esperar,
        sigue: mia,
        alAvanzar: ({ fase: f, comprobante: c }) => {
          if (!mia()) return
          if (f) setFase(f)
          // La consulta que consigue la aceptación trae cómo salió el correo.
          if (c) setEstado(e => ({ ...e, comprobante: c, ...(c.correo ? { correo: c.correo } : {}) }))
        }
      })
    } catch (e) {
      if (!mia()) return
      if (e.response?.data?.code === 'DATOS_FISCALES_PENDIENTES') setPidiendoDatos(true)
      setError(mensajeError(e))
    } finally {
      if (mia()) {
        setFase(null)
        // Lo que quedó de verdad en el servidor, pase lo que pase arriba.
        await leer(id).catch(() => {})
        avisar.current?.()
      }
    }
  }

  /** Mandarle (otra vez) al cliente el PDF con los dos XML. */
  const enviarAlCliente = async () => {
    if (enviandoCorreo) return
    const id = facturaId
    setEnviandoCorreo(true)
    setError('')
    try {
      const correo = await servidor.correo(id)
      if (actual.current === id) setEstado(e => ({ ...e, correo }))
    } catch (e) {
      if (actual.current === id) setError(mensajeError(e))
    } finally {
      setEnviandoCorreo(false)
    }
  }

  /** Bajar el XML firmado, o la respuesta de Hacienda, del comprobante. */
  const bajar = async (respuesta = false) => {
    const c = estado?.comprobante
    if (!c || bajando) return
    setBajando(true)
    setErrorDescarga('')
    try {
      await descargar(c, respuesta)
    } catch {
      setErrorDescarga('No se pudo descargar el archivo.')
    } finally {
      setBajando(false)
    }
  }

  return {
    activo, origen, estado, fase, error, emitir,
    // Volver a preguntarle al servidor cómo va (p. ej. tras subir un XML).
    releer: () => leer(facturaId).catch(e => setError(mensajeError(e))),
    bajar, bajando, errorDescarga,
    pidiendoDatos, cerrarDatos: () => setPidiendoDatos(false),
    // null = este documento no se le manda a nadie (una compra).
    enviarAlCliente: servidor.correo ? enviarAlCliente : null, enviandoCorreo
  }
}
