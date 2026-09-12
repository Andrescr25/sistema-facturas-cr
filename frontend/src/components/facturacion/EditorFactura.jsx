import { useState, useMemo } from 'react'
import { Save, X, Trash2, Search, User, Plus, Loader2 } from 'lucide-react'
import { colones } from '../../utils/colones'
import { calcularSubtotal, calcularImpuestos, calcularTotal } from '../../utils/facturacionUtils'

/**
 * Editar una factura ya emitida.
 *
 * QUÉ SE PUEDE CAMBIAR Y QUÉ NO
 *
 *   · El CLIENTE sí. Es el error más caro de una factura: queda a nombre de
 *     quien no compró y la deuda se le reclama a esa persona. Al cambiarlo se
 *     recalculan la condición de venta y el vencimiento, porque el plazo es
 *     del cliente nuevo.
 *   · Los PRODUCTOS, CANTIDADES, PRECIOS y DESCUENTOS sí.
 *   · El IMPUESTO NO se escribe a mano: la tarifa sale del maestro del
 *     producto. Dejarla editable es exactamente el agujero por el que se
 *     facturaron productos al 1 % cobrando 13 %.
 *   · El NÚMERO, la SERIE y la FECHA tampoco. Es el mismo documento con otro
 *     contenido; una fecha que cambia no es una corrección, es otro papel.
 */

const num = (v) => Number(v) || 0

export default function EditorFactura({
  factura, productos, clientes, onGuardar, onCancelar
}) {
  const [items, setItems] = useState(
    factura.lineas.map(l => ({
      productoId: l.productoId,
      name: l.nombre,
      reference: l.referencia,
      quantity: num(l.cantidad),
      price: num(l.precioUnitario),
      discount: num(l.descuentoPorcentaje),
      description: l.descripcion || '',
      tax: [{ percentage: num(l.tarifa) }]
    }))
  )
  const [cliente, setCliente] = useState({ id: factura.cliente.id, name: factura.cliente.nombre })
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [textoCliente, setTextoCliente] = useState('')
  const [textoProducto, setTextoProducto] = useState('')
  const [observaciones, setObservaciones] = useState(factura.observaciones || '')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const clientesEncontrados = useMemo(() => {
    const t = textoCliente.trim().toLowerCase()
    if (t.length < 2) return []
    return clientes.filter(c => `${c.name} ${c.identification || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [textoCliente, clientes])

  const productosEncontrados = useMemo(() => {
    const t = textoProducto.trim().toLowerCase()
    if (t.length < 2) return []
    return productos.filter(p => `${p.name} ${p.reference || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [textoProducto, productos])

  const subtotal = calcularSubtotal(items)
  const impuesto = calcularImpuestos(items, null, [])
  const total = calcularTotal(items, 0, null, [])

  const cambiarItem = (i, campo, valor) =>
    setItems(items.map((it, j) => (j === i ? { ...it, [campo]: valor } : it)))

  const agregarProducto = (p) => {
    setItems([...items, {
      productoId: p.productoId ?? p.id,
      name: p.name,
      reference: p.reference,
      quantity: 1,
      price: num(p.price),
      discount: 0,
      description: '',
      // La tarifa viene del maestro, igual que al facturar.
      tax: p.tax?.length ? [{ percentage: num(p.tax[0].percentage) }] : [{ percentage: 0 }]
    }])
    setTextoProducto('')
  }

  const guardar = async () => {
    setError('')
    if (items.length === 0) return setError('La factura no puede quedar sin líneas.')
    if (items.some(i => num(i.quantity) <= 0)) return setError('Hay una línea con cantidad en cero.')

    setGuardando(true)
    try {
      await onGuardar({
        clienteId: cliente.id,
        items: items.map(i => ({
          productoId: i.productoId,
          quantity: num(i.quantity),
          price: num(i.price),
          discount: num(i.discount),
          description: i.description || ''
        })),
        observaciones,
        motivo: motivo.trim() || null
      })
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo guardar la factura.')
      setGuardando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-alerta-600">Editando</p>
          <p className="truncate font-bold text-neutro-900">{factura.numero}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onCancelar} className="btn btn-outline flex items-center gap-2">
            <X size={16} /> Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={guardando}
            className="btn btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar cambios
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}

      <div className="card flex flex-col gap-5 rounded-2xl p-5">
        {/* ---------- Cliente ---------- */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Cliente</p>
          {!buscandoCliente ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 font-semibold text-neutro-900">
                <User size={16} className="text-neutro-400" /> {cliente.name}
              </span>
              <button
                onClick={() => { setBuscandoCliente(true); setTextoCliente('') }}
                className="text-xs font-semibold text-primario-600 hover:underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
                <input
                  autoFocus
                  value={textoCliente}
                  onChange={(e) => setTextoCliente(e.target.value)}
                  placeholder="Nombre o cédula…"
                  className="input w-full pl-9"
                />
              </div>
              {clientesEncontrados.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCliente({ id: c.id, name: c.name }); setBuscandoCliente(false) }}
                  className="rounded-xl border border-neutro-200 px-3 py-2 text-left text-sm hover:border-primario-300"
                >
                  <span className="font-semibold text-neutro-800">{c.name}</span>
                  {c.identification && <span className="ml-2 text-xs text-neutro-400">{c.identification}</span>}
                </button>
              ))}
              <button onClick={() => setBuscandoCliente(false)} className="self-start text-xs text-neutro-500 hover:underline">
                Dejar el que está
              </button>
            </div>
          )}
        </div>

        {/* ---------- Líneas ---------- */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutro-400">Productos</p>
          <div className="flex flex-col gap-2">
            {items.map((it, i) => (
              <div key={`${it.productoId}-${i}`} className="rounded-xl border border-neutro-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutro-800">{it.name}</p>
                    <p className="text-xs text-neutro-400">
                      {it.reference ? `Ref. ${it.reference} · ` : ''}IVA {num(it.tax?.[0]?.percentage)}%
                    </p>
                  </div>
                  <button
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-neutro-400 hover:bg-peligro-50 hover:text-peligro-600"
                    title="Quitar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
                    Cantidad
                    <input
                      type="number" min="0" step="1" value={it.quantity}
                      onChange={(e) => cambiarItem(i, 'quantity', e.target.value)}
                      className="input mt-0.5 w-full text-center"
                    />
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
                    Precio
                    <input
                      type="number" min="0" step="0.01" value={it.price}
                      onChange={(e) => cambiarItem(i, 'price', e.target.value)}
                      className="input mt-0.5 w-full text-right"
                    />
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
                    Descuento %
                    <input
                      type="number" min="0" max="100" step="1" value={it.discount}
                      onChange={(e) => cambiarItem(i, 'discount', e.target.value)}
                      className="input mt-0.5 w-full text-right"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {/* Agregar producto */}
          <div className="relative mt-2">
            <Plus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
            <input
              value={textoProducto}
              onChange={(e) => setTextoProducto(e.target.value)}
              placeholder="Agregar un producto: nombre o código…"
              className="input w-full pl-9"
            />
          </div>
          {productosEncontrados.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {productosEncontrados.map(p => (
                <button
                  key={p.id}
                  onClick={() => agregarProducto(p)}
                  className="flex items-center justify-between rounded-xl border border-neutro-200 px-3 py-2 text-left text-sm hover:border-primario-300"
                >
                  <span className="min-w-0 truncate font-semibold text-neutro-800">{p.name}</span>
                  <span className="ml-2 shrink-0 text-neutro-500">{colones(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------- Observaciones y motivo ---------- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
            Observaciones
            <textarea
              rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
              className="input mt-0.5 w-full py-2 text-sm font-normal normal-case tracking-normal text-neutro-800"
            />
          </label>
          {/* Queda en la bitácora: dentro de seis meses, "por qué cambió esta
              factura" tiene que poder responderse. */}
          <label className="text-[10px] font-semibold uppercase tracking-wider text-neutro-400">
            ¿Por qué se corrige? (queda en la bitácora)
            <input
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Se facturó de más una unidad…"
              className="input mt-0.5 w-full text-sm font-normal normal-case tracking-normal text-neutro-800"
            />
          </label>
        </div>

        {/* ---------- Totales en vivo ---------- */}
        <div className="flex justify-end border-t border-neutro-200 pt-3">
          <div className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-neutro-600">
              <span>Subtotal</span><span className="font-medium text-neutro-800">{colones(subtotal)}</span>
            </div>
            <div className="flex justify-between text-neutro-600">
              <span>IVA</span><span className="font-medium text-neutro-800">{colones(impuesto)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t-2 border-neutro-200 pt-1.5">
              <span className="font-bold text-neutro-900">Total</span>
              <span className="text-xl font-extrabold text-primario-600">{colones(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
