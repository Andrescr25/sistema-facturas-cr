import { useEffect, useMemo, useState } from 'react'
import { Search, X, Loader2, AlertCircle } from 'lucide-react'
import api from '../../services/api'
import Modal from '../ui/Modal'
import Boton from '../ui/Boton'
import { buscarProductos } from '../../utils/buscarCatalogoAgente'

/**
 * Armar una cotización: cliente, productos, validez.
 *
 * Se reutiliza la búsqueda del catálogo del agente (buscarCatalogoAgente):
 * prioriza la referencia exacta y ordena por parecido. Quien cotiza suele
 * tener el código a mano, igual que el agente en la calle.
 *
 * EL CLIENTE SE BUSCA EN EL SERVIDOR, EL PRODUCTO EN EL NAVEGADOR
 * No es una inconsistencia. Los productos del catálogo son ~120 y bajan en
 * medio segundo, así que se filtran acá sin ida y vuelta. Los contactos son
 * más de mil y bajarlos todos tardaba 31 segundos con el modal en blanco:
 * ahora se le pregunta a Alegra conforme se escribe. De paso aparece el
 * cliente dado de alta hoy, que es a quien más se le cotiza.
 *
 * Los precios que se muestran acá son de referencia. El que vale es el que
 * pone el servidor al crear la cotización: este navegador puede tener el
 * catálogo de hace rato, y el precio de una cotización es un compromiso con
 * el cliente.
 *
 * Los precios que se ven acá llevan impuesto incluido, como en el catálogo
 * del cliente y como en el PDF que Alegra genera. El total del pie tiene que
 * coincidir con el de la cotización, o el vendedor lee un número y el cliente
 * recibe otro.
 */

const colones = (n) =>
  // es-CR separa los miles con espacio duro (U+00A0); se escribe el código
  // y no el carácter, que es invisible en el editor.
  `₡${Math.round(Number(n) || 0).toLocaleString('es-CR').replace(/\u00A0/g, '.')}`

export default function ModalCotizacion({ onCerrar, onCreada, cotizacion = null }) {
  // Con `cotizacion` el modal edita en vez de crear. Es la misma pantalla a
  // propósito: quien edita busca productos igual que quien cotiza, y tener
  // dos formularios casi iguales es tener dos sitios donde arreglar cada cosa.
  const editando = Boolean(cotizacion)

  const [clientes, setClientes] = useState([])
  const [buscandoClientes, setBuscandoClientes] = useState(false)
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)

  const [cliente, setCliente] = useState(
    cotizacion ? { id: cotizacion.clienteId, nombre: cotizacion.clienteNombre } : null)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [lineas, setLineas] = useState([])
  const [validezDias, setValidezDias] = useState(15)
  // Editando se pone la fecha exacta y no "en N días": la cotización ya tiene
  // una fecha de vencimiento y contar días desde hoy la correría sin querer.
  const [vence, setVence] = useState(cotizacion?.vence || '')
  const [observaciones, setObservaciones] = useState(cotizacion?.observaciones || '')

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  // Clave estable: si se toca "Crear" dos veces o la respuesta se pierde, el
  // servidor devuelve la cotización que ya existe en vez de crear otra con
  // número nuevo.
  const [clave] = useState(() =>
    `cot-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`)

  useEffect(() => {
    let vivo = true
    // El catálogo COMPLETO, no la primera página. Con /catalogo-clientes
    // (120 por página) el buscador solo veía 120 de 2.010 productos y una
    // referencia real como "G22" no aparecía: parecía que no existía.
    api.get('/cotizaciones/productos')
      .then(p => {
        if (!vivo) return
        // Se traen con la forma del catálogo del agente para poder usar su
        // búsqueda sin traducir campos en el medio.
        setProductos((p.data?.data || []).map(x => ({
          id: x.id, name: x.nombre, reference: { reference: x.referencia || '' }, precio: x.precio
        })))
      })
      .catch(() => { if (vivo) setProductos([]) })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [])

  // Las líneas de la cotización que se está editando se rellenan con el
  // precio de HOY, no con el cotizado. Es lo que el servidor va a guardar al
  // reemplazar el documento, así que mostrar el viejo sería enseñar un total
  // que no va a quedar. Para sostener el precio viejo se factura sin editar.
  useEffect(() => {
    if (!editando || productos.length === 0) return
    const porIdCatalogo = new Map(productos.map(p => [String(p.id), p]))
    setLineas((cotizacion.lineas || []).map(l => {
      const p = porIdCatalogo.get(String(l.alegraItemId))
      return {
        alegraItemId: String(l.alegraItemId),
        nombre: p?.name || l.nombre,
        precio: p ? Number(p.precio) || 0 : 0,
        cantidad: Number(l.cantidad) || 0,
        // Un producto dado de baja desde que se cotizó: se muestra para que
        // se vea por qué el total bajó, pero el servidor lo deja fuera.
        fueraDeCatalogo: !p
      }
    }))
  }, [editando, productos, cotizacion])

  // Búsqueda de cliente contra el servidor, con una pausa para no disparar
  // una consulta por tecla. La respuesta vieja que llegue tarde se descarta:
  // si no, escribir rápido dejaba en pantalla el resultado de un término que
  // ya no era el que estaba en el input.
  useEffect(() => {
    const t = busquedaCliente.trim()
    if (cliente) return
    if (t.length < 2) { setClientes([]); setBuscandoClientes(false); return }

    let vigente = true
    setBuscandoClientes(true)
    const temporizador = setTimeout(() => {
      api.get('/cotizaciones/clientes', { params: { q: t } })
        .then(r => { if (vigente) setClientes(r.data?.data || []) })
        .catch(() => { if (vigente) setClientes([]) })
        .finally(() => { if (vigente) setBuscandoClientes(false) })
    }, 350)

    return () => { vigente = false; clearTimeout(temporizador) }
  }, [busquedaCliente, cliente])

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return []
    return buscarProductos(productos, busqueda).slice(0, 8)
  }, [productos, busqueda])

  const porId = Object.fromEntries(lineas.map(l => [String(l.alegraItemId), l]))
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precio, 0)

  const cambiar = (producto, cantidad) => {
    const n = Math.max(0, Math.floor(Number(cantidad) || 0))
    setLineas(prev => {
      const otras = prev.filter(l => String(l.alegraItemId) !== String(producto.id))
      return n === 0 ? otras : [...otras, {
        alegraItemId: String(producto.id),
        nombre: producto.name,
        precio: Number(producto.precio) || 0,
        cantidad: n
      }]
    })
  }

  const guardar = async () => {
    setError('')
    if (!cliente) return setError('Elegí el cliente.')
    if (lineas.length === 0) return setError('Agregá al menos un producto.')

    setEnviando(true)
    try {
      const cuerpo = {
        clienteId: cliente.id,
        observaciones: observaciones.trim() || null,
        lineas: lineas.map(l => ({ alegraItemId: l.alegraItemId, cantidad: l.cantidad }))
      }
      // Alegra solo acepta PUT en cotizaciones y reemplaza el documento
      // entero: por eso se mandan siempre todas las líneas, no las que
      // cambiaron.
      const { data } = editando
        ? await api.put(`/cotizaciones/${cotizacion.id}`, { ...cuerpo, vence })
        : await api.post('/cotizaciones', { ...cuerpo, validezDias, claveIdempotencia: clave })

      const noDisp = data.data?.noDisponibles || []
      if (noDisp.length > 0) {
        setError(`Se guardó, pero ${noDisp.length} producto(s) ya no están disponibles y quedaron fuera.`)
      }
      onCreada?.(data.data?.numero || '', editando)
    } catch (e) {
      setError(e.response?.data?.message ||
        (editando ? 'No se pudo guardar la cotización.' : 'No se pudo crear la cotización.'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      onCerrar={onCerrar}
      titulo={editando ? `Cotización ${cotizacion.numero}` : 'Nueva cotización'}
      ancho="xl"
      hoja={false}
      pie={
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-neutro-400">Total</p>
            <p className="text-xl font-extrabold text-neutro-900">{colones(total)}</p>
          </div>
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
            <Boton onClick={guardar} cargando={enviando}>
              {editando ? 'Guardar cambios' : 'Crear cotización'}
            </Boton>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        {cargando ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-neutro-300" /></div>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">Cliente</label>
              {cliente ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-primario-200 bg-primario-50 px-3 py-2.5">
                  <span className="truncate text-sm font-bold text-neutro-900">{cliente.nombre}</span>
                  <button type="button" onClick={() => setCliente(null)} aria-label="Cambiar cliente"
                    className="shrink-0 text-neutro-400 hover:text-neutro-700"><X size={16} /></button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
                    <input
                      type="text" autoFocus value={busquedaCliente}
                      onChange={(e) => setBusquedaCliente(e.target.value)}
                      placeholder="Buscar cliente por nombre..."
                      className="w-full rounded-xl border-2 border-neutro-200 py-2.5 pl-9 pr-9 text-sm font-semibold focus:border-acento-500 focus:outline-none"
                    />
                    {buscandoClientes && (
                      <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-neutro-300" />
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {clientes.map(c => (
                      <button key={c.id} type="button" onClick={() => setCliente(c)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-neutro-100">
                        <span className="min-w-0 flex-1 truncate text-sm text-neutro-700">{c.nombre}</span>
                        {c.identificacion && (
                          <span className="shrink-0 text-[11px] text-neutro-400">{c.identificacion}</span>
                        )}
                      </button>
                    ))}
                    {/* Los tres casos se ven distintos a propósito: no es lo
                        mismo "todavía no escribiste" que "no hay nadie". */}
                    {busquedaCliente.trim().length < 2 ? (
                      <p className="px-3 py-2 text-[12px] text-neutro-400">
                        Escribí al menos dos letras del nombre.
                      </p>
                    ) : !buscandoClientes && clientes.length === 0 ? (
                      <p className="px-3 py-2 text-[12px] text-neutro-400">
                        Ningún cliente con ese nombre.
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
                Productos <span className="font-semibold normal-case text-neutro-300">(por nombre o referencia)</span>
              </label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-300" />
                <input
                  type="text" value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full rounded-xl border-2 border-neutro-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-acento-500 focus:outline-none"
                />
              </div>
              <div className="mt-2 space-y-1">
                {resultados.map(p => (
                  <button key={p.id} type="button" onClick={() => cambiar(p, (porId[String(p.id)]?.cantidad || 0) + 1)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-neutro-100">
                    <span className="min-w-0 flex-1 truncate text-sm text-neutro-700">
                      {p.name}
                      {p.reference?.reference && <span className="ml-2 text-[11px] text-neutro-400">Ref. {p.reference.reference}</span>}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-neutro-900">{colones(p.precio)}</span>
                  </button>
                ))}
              </div>
            </div>

            {lineas.length > 0 && (
              <div className="rounded-2xl border border-neutro-200">
                {lineas.map(l => (
                  <div key={l.alegraItemId} className="flex items-center gap-3 border-b border-neutro-100 px-3 py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutro-900">
                      {l.nombre}
                      {l.fueraDeCatalogo && (
                        <span className="ml-2 text-[11px] font-semibold text-alerta-600">
                          ya no está en el catálogo
                        </span>
                      )}
                    </span>
                    <input
                      type="number" min="0" inputMode="numeric" value={l.cantidad}
                      onChange={(e) => cambiar({ id: l.alegraItemId, name: l.nombre, precio: l.precio }, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Cantidad de ${l.nombre}`}
                      className="w-16 rounded-lg border-2 border-neutro-200 py-1 text-center text-sm font-extrabold focus:border-acento-500 focus:outline-none"
                    />
                    <span className="w-24 shrink-0 text-right text-sm font-extrabold text-neutro-900">
                      {colones(l.cantidad * l.precio)}
                    </span>
                    <button type="button" aria-label={`Quitar ${l.nombre}`}
                      onClick={() => cambiar({ id: l.alegraItemId }, 0)}
                      className="shrink-0 text-neutro-300 hover:text-peligro-600"><X size={15} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
                  {editando ? 'Vale hasta' : 'Vale por'}
                </label>
                {editando ? (
                  <input
                    type="date" value={vence}
                    onChange={(e) => setVence(e.target.value)}
                    aria-label="Fecha hasta la que vale la cotización"
                    className="rounded-xl border-2 border-neutro-200 px-3 py-2 text-sm font-bold focus:border-acento-500 focus:outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min="1" value={validezDias}
                      onChange={(e) => setValidezDias(e.target.value)}
                      className="w-20 rounded-xl border-2 border-neutro-200 py-2 text-center text-sm font-bold focus:border-acento-500 focus:outline-none"
                    />
                    <span className="text-sm text-neutro-500">días</span>
                  </div>
                )}
              </div>
              <div className="min-w-[200px] flex-1">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-neutro-400">
                  Nota <span className="font-semibold normal-case text-neutro-300">(opcional)</span>
                </label>
                <input
                  type="text" value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Condiciones, entrega, forma de pago..."
                  className="w-full rounded-xl border-2 border-neutro-200 px-3 py-2 text-sm font-semibold focus:border-acento-500 focus:outline-none"
                />
              </div>
            </div>

            {/* El precio final lo pone el servidor con el catálogo de hoy: este
                navegador puede tener uno viejo, y una cotización es un
                compromiso de precio con el cliente. */}
            <p className="text-[11px] text-neutro-400">
              {editando
                ? 'Al guardar, los precios se actualizan a los del catálogo de hoy. Para facturar con el precio que se cotizó, facturá sin editar.'
                : 'Los precios definitivos se toman del catálogo al crear la cotización.'}
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-peligro-200 bg-peligro-50 px-3 py-2.5">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-peligro-600" />
                <p className="text-xs font-semibold text-peligro-700">{error}</p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
