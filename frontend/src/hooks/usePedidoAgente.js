import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import indexedDBService from '../services/indexedDBService'
import { idDispositivo } from '../services/dispositivo'

/**
 * El pedido que el agente arma en la calle, y la cola que lo lleva al
 * servidor cuando aparece la señal.
 *
 * LA REGLA QUE MANDA: NADA SE BORRA SIN CONFIRMACIÓN
 * Un pedido borrado "porque seguro entró" es una venta perdida, y en la calle
 * nunca se sabe si entró. Por eso un pedido sale del dispositivo solo cuando
 * el SERVIDOR dice que lo tiene. Mientras tanto se ve en pantalla, con su
 * estado, para que el agente no tenga que adivinar.
 *
 * LOS ESTADOS SON LOS QUE EL AGENTE VE
 *   en_dispositivo  armado y guardado acá; todavía no llegó
 *   enviando        se está mandando ahora mismo
 *   confirmado      el servidor lo tiene (con su número de pedido)
 *   rechazado       el servidor lo rechazó por una razón concreta
 *
 * No hay estado "quizá": si el envío falla sin respuesta, vuelve a
 * `en_dispositivo` y se reintenta. La clave hace que reintentar sea seguro —
 * si el servidor ya lo tenía, contesta con el mismo pedido en vez de crear
 * otro.
 *
 * EL CARRITO TAMBIÉN SE GUARDA
 * La tablet se puede quedar sin batería con el cliente enfrente. El carrito
 * vive en IndexedDB, no en memoria, así que al volver sigue ahí.
 */


/**
 * El precio con IVA tal como lo muestra la tarjeta del catálogo.
 *
 * En este catálogo `price` es un ARREGLO de listas de precio y el impuesto
 * viene aparte, así que leerlo como número da NaN y el total se ve en ₡0 —
 * que fue exactamente lo que pasó al probarlo. Se replica el mismo cálculo de
 * ProductCard para que el agente vea el mismo número en los dos lados.
 */
function precioConIvaDe(producto) {
  const lista = Array.isArray(producto.price) ? producto.price[0] : null
  const base = lista?.price !== undefined
    ? parseFloat(String(lista.price).replace(/,/g, ''))
    : Number(producto.precio ?? producto.price ?? 0)
  if (!Number.isFinite(base)) return 0

  const iva = (producto.tax || []).reduce((s, t) => s + (parseFloat(t.percentage) || 0), 0)
  const conIva = base * (1 + iva / 100)
  const descuento = Number(producto.descuentoPorcentaje) || 0
  return descuento > 0 ? conIva * (1 - descuento / 100) : conIva
}

const CLAVE_CARRITO = 'carrito_agente'

export function usePedidoAgente(clienteActivo) {
  const [lineas, setLineas] = useState([])
  const [cola, setCola] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(false)
  const sincronizando = useRef(false)
  const sincronizarRef = useRef(null)

  // --- Carrito ---------------------------------------------------------

  const leerCarrito = useCallback(async () => {
    const guardado = await indexedDBService.getConfig(CLAVE_CARRITO)
    // El carrito es de UN cliente. Si el agente cambió de cliente, lo que
    // había era de otra visita y no debe mezclarse con esta.
    if (guardado?.alegraContactId && clienteActivo?.id &&
        String(guardado.alegraContactId) !== String(clienteActivo.id)) {
      setLineas([])
      return
    }
    setLineas(guardado?.lineas || [])
  }, [clienteActivo?.id])

  const guardarCarrito = useCallback(async (nuevasLineas) => {
    await indexedDBService.setConfig(CLAVE_CARRITO, {
      alegraContactId: clienteActivo?.id || null,
      clienteNombre: clienteActivo?.nombre || null,
      lineas: nuevasLineas
    })
  }, [clienteActivo])

  const cambiarCantidad = useCallback(async (producto, cantidad) => {
    const n = Math.max(0, Math.floor(Number(cantidad) || 0))
    setLineas(prev => {
      const otras = prev.filter(l => String(l.alegraItemId) !== String(producto.id))
      const nuevas = n === 0
        ? otras
        : [...otras, {
            alegraItemId: String(producto.id),
            nombre: producto.name || producto.nombre,
            // El precio es SOLO para que el agente vea un total mientras arma
            // el pedido. El que vale es el que pone el servidor al recibirlo:
            // este dispositivo puede tener el catálogo de hace días.
            precioReferencia: precioConIvaDe(producto),
            cantidad: n
          }]
      guardarCarrito(nuevas)
      return nuevas
    })
  }, [guardarCarrito])

  const vaciarCarrito = useCallback(async () => {
    setLineas([])
    await guardarCarrito([])
  }, [guardarCarrito])

  // --- Cola ------------------------------------------------------------

  const leerCola = useCallback(async () => {
    const todos = await indexedDBService.getPedidosAgente()
    setCola(todos.sort((a, b) => b.creadoEn - a.creadoEn))
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      await indexedDBService.init()
      if (!vivo) return

      // Un pedido que quedó en "enviando" es uno que se cortó a mitad de
      // camino: la señal se fue, la tablet se apagó, la aplicación se cerró.
      // Nadie va a resolverlo solo, y sin esto se queda ahí para siempre
      // mostrando "Enviando..." mientras el cliente espera un pedido que
      // nunca llegó. Vuelve a la cola para reintentarse.
      //
      // Reintentar es seguro: si el servidor SÍ lo había recibido, la clave
      // hace que conteste con el mismo pedido en vez de crear otro.
      const todos = await indexedDBService.getPedidosAgente()
      for (const p of todos.filter(p => p.estado === 'enviando')) {
        await indexedDBService.actualizarPedidoAgente(p.clave, {
          estado: 'en_dispositivo',
          detalle: 'El envío anterior se cortó. Se reintenta.'
        })
      }

      await leerCarrito()
      await leerCola()
      setListo(true)

      // Si hay señal, lo pendiente sale de una: el agente no tiene por qué
      // acordarse de apretar nada.
      if (navigator.onLine) sincronizarRef.current?.()
    })()
    return () => { vivo = false }
  }, [leerCarrito, leerCola])

  /**
   * Manda un pedido concreto. Devuelve el estado en que quedó.
   *
   * Lo importante está en el catch: si el servidor RESPONDIÓ con un rechazo,
   * el pedido es inválido y reintentarlo sería inútil. Si NO respondió, el
   * pedido pudo haber entrado igual, así que vuelve a la cola — y la clave
   * garantiza que el reintento no cree un segundo.
   */
  const enviarUno = useCallback(async (pedido) => {
    await indexedDBService.actualizarPedidoAgente(pedido.clave, { estado: 'enviando' })
    await leerCola()

    try {
      const { data } = await api.post('/catalogo-agente/pedidos', {
        alegraContactId: pedido.alegraContactId,
        clienteNombre: pedido.clienteNombre,
        observaciones: pedido.observaciones || null,
        claveIdempotencia: pedido.clave,
        lineas: pedido.lineas.map(l => ({ alegraItemId: l.alegraItemId, cantidad: l.cantidad }))
      })
      await indexedDBService.actualizarPedidoAgente(pedido.clave, {
        estado: 'confirmado',
        pedidoId: data?.data?.pedidoId ?? null,
        totalServidor: data?.data?.total ?? null,
        noDisponibles: data?.data?.noDisponibles || [],
        confirmadoEn: Date.now()
      })
      await leerCola()
      return 'confirmado'
    } catch (error) {
      const respondio = Boolean(error.response)
      if (respondio) {
        await indexedDBService.actualizarPedidoAgente(pedido.clave, {
          estado: 'rechazado',
          detalle: error.response?.data?.message || error.message
        })
      } else {
        // Sin respuesta: pudo haber entrado. Se deja listo para reintentar,
        // que con la clave no puede duplicarlo.
        await indexedDBService.actualizarPedidoAgente(pedido.clave, {
          estado: 'en_dispositivo',
          detalle: 'No se pudo contactar el servidor. Se reintenta solo.',
          intentos: (pedido.intentos || 0) + 1
        })
      }
      await leerCola()
      return respondio ? 'rechazado' : 'en_dispositivo'
    }
  }, [leerCola])

  /**
   * Manda lo que haya pendiente, DE A UNO.
   *
   * En serie a propósito: en paralelo, media docena de pedidos sobre una
   * señal débil se atropellan y terminan todos sin respuesta, dejando media
   * docena de dudas en vez de una. De a uno, cada pedido se resuelve antes de
   * empezar el siguiente.
   */
  const sincronizar = useCallback(async () => {
    if (sincronizando.current || !navigator.onLine) return { enviados: 0 }
    sincronizando.current = true
    try {
      const todos = await indexedDBService.getPedidosAgente()
      const pendientes = todos.filter(p => p.estado === 'en_dispositivo')
      let enviados = 0
      for (const pedido of pendientes) {
        const estado = await enviarUno(pedido)
        if (estado === 'confirmado') enviados++
      }
      return { enviados, total: pendientes.length }
    } finally {
      sincronizando.current = false
    }
  }, [enviarUno])

  // Se guarda en una referencia para que el arranque pueda dispararla sin
  // depender de ella y volver a montar el efecto en cada render.
  useEffect(() => { sincronizarRef.current = sincronizar }, [sincronizar])

  /** Pasa el carrito a la cola. Devuelve la clave del pedido. */
  const enviarPedido = useCallback(async ({ observaciones } = {}) => {
    if (lineas.length === 0) throw new Error('El pedido está vacío.')
    if (!clienteActivo?.id) throw new Error('Elegí el cliente antes de enviar el pedido.')

    setEnviando(true)
    try {
      const dispositivo = await idDispositivo()
      const unico = (globalThis.crypto?.randomUUID?.() ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

      const pedido = {
        clave: `ag-${dispositivo}-${unico}`,
        estado: 'en_dispositivo',
        alegraContactId: String(clienteActivo.id),
        clienteNombre: clienteActivo.nombre || null,
        observaciones: observaciones || null,
        lineas,
        totalReferencia: lineas.reduce((s, l) => s + l.cantidad * l.precioReferencia, 0),
        creadoEn: Date.now(),
        intentos: 0
      }

      // Primero se GUARDA, después se intenta mandar. Si el orden fuera al
      // revés y la aplicación se cerrara en el medio, el pedido se perdería
      // entero: el cliente se quedó esperando algo que nunca existió.
      await indexedDBService.guardarPedidoAgente(pedido)
      await vaciarCarrito()
      await leerCola()

      if (navigator.onLine) await enviarUno(pedido)
      return pedido.clave
    } finally {
      setEnviando(false)
    }
  }, [lineas, clienteActivo, vaciarCarrito, leerCola, enviarUno])

  /** Quita de la vista un pedido ya confirmado. */
  const archivar = useCallback(async (clave) => {
    await indexedDBService.borrarPedidoAgenteConfirmado(clave)
    await leerCola()
  }, [leerCola])

  // Al recuperar la conexión se manda solo lo que quedó pendiente.
  useEffect(() => {
    const alVolver = () => { sincronizar() }
    window.addEventListener('online', alVolver)
    return () => window.removeEventListener('online', alVolver)
  }, [sincronizar])

  // El carrito se relee al cambiar de cliente.
  useEffect(() => { if (listo) leerCarrito() }, [clienteActivo?.id, listo, leerCarrito])

  const porId = Object.fromEntries(lineas.map(l => [l.alegraItemId, l]))
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0)
  const totalReferencia = lineas.reduce((s, l) => s + l.cantidad * l.precioReferencia, 0)
  const sinEnviar = cola.filter(p => p.estado === 'en_dispositivo' || p.estado === 'enviando').length

  return {
    lineas, porId, unidades, totalReferencia,
    cambiarCantidad, vaciarCarrito,
    cola, sinEnviar, enviando, listo,
    enviarPedido, sincronizar, archivar
  }
}
