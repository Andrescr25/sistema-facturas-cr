import { useEffect, useRef } from 'react'
import api from '../services/api'
import facturacionService from '../services/facturacionService'
import { CLAVE_HUELLA, CADA_MS, tocaPreguntar, cambio } from '../utils/catalogoAlDia'

/**
 * Mantiene al día, sola, la copia del catálogo con la que trabaja
 * Facturación. Las reglas están en utils/catalogoAlDia.js; acá se conectan
 * con el servidor y con la pantalla.
 *
 * Pregunta la huella al entrar, al volver a la pestaña, al recuperar la
 * conexión y cada pocos minutos. Si cambió, baja los productos y se los pasa
 * a la pantalla (`alRenovar`), sin tocar la venta que se esté armando: las
 * líneas ya agregadas tienen su propia copia del producto.
 *
 * NUNCA ESTORBA: sin conexión no hace nada, un error se calla (la copia
 * anterior sigue sirviendo, que es para lo que existe) y no corre mientras
 * alguien tocó «Actualizar» (`ocupado`). Cuando esa actualización a mano
 * termina, solo anota la huella nueva: el catálogo ya se bajó.
 *
 * @param {object} o
 * @param {boolean} o.enLinea   hay conexión
 * @param {boolean} o.listo     la pantalla ya cargó su copia
 * @param {boolean} o.ocupado   hay una actualización a mano en curso
 * @param {Function} o.alRenovar recibe los productos recién bajados
 */
export default function useCatalogoAlDia({ enLinea, listo, ocupado, alRenovar }) {
  const ultima = useRef(0)
  const corriendo = useRef(false)
  const estabaOcupado = useRef(false)
  const renovar = useRef(alRenovar)
  renovar.current = alRenovar

  useEffect(() => {
    const guardada = () => { try { return localStorage.getItem(CLAVE_HUELLA) } catch { return null } }
    const guardar = (huella) => { try { localStorage.setItem(CLAVE_HUELLA, huella) } catch { /* sin almacenamiento, se pregunta de nuevo */ } }
    const huellaDelServidor = async () => (await api.get('/catalogos/productos/huella')).data?.data?.huella

    // Terminó una actualización completa (la de «Actualizar», o la primera
    // descarga de un dispositivo nuevo): el catálogo ya está al día, solo
    // falta anotar con qué huella. Se mira aunque la pantalla siga cargando.
    const terminoActualizacion = estabaOcupado.current && !ocupado
    estabaOcupado.current = ocupado
    if (!enLinea) return undefined
    if (terminoActualizacion) {
      huellaDelServidor().then(h => { if (h) guardar(h) }).catch(() => {})
      ultima.current = Date.now()
    }
    if (!listo || ocupado) return undefined

    const revisar = async () => {
      if (corriendo.current || document.hidden || !tocaPreguntar(Date.now(), ultima.current)) return
      corriendo.current = true
      ultima.current = Date.now()
      try {
        const huella = await huellaDelServidor()
        if (!cambio(guardada(), huella)) return
        await facturacionService.actualizarCacheProductos()
        renovar.current?.(await facturacionService.getProductos())
        guardar(huella)
      } catch {
        // Sin red o con el servidor ocupado: se intenta en la próxima vuelta.
      } finally {
        corriendo.current = false
      }
    }

    revisar()
    const reloj = setInterval(revisar, CADA_MS)
    window.addEventListener('focus', revisar)
    document.addEventListener('visibilitychange', revisar)
    return () => {
      clearInterval(reloj)
      window.removeEventListener('focus', revisar)
      document.removeEventListener('visibilitychange', revisar)
    }
  }, [enLinea, listo, ocupado])
}
