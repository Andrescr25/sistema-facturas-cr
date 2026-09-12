import { useState } from 'react'
import {
  Search, FileText, Loader2, Ban, Undo2, ChevronDown, ChevronRight,
  ChevronLeft, Receipt, CalendarDays
} from 'lucide-react'
import Insignia from '../ui/Insignia'
import Vacio from '../ui/Vacio'
import Modal from '../ui/Modal'
import ModalNotaCredito from './ModalNotaCredito'
import { colones } from '../../utils/colones'

/**
 * Las facturas ya emitidas.
 *
 * Hasta ahora se facturaba y el documento desaparecía de la vista: no había
 * dónde volver a verlo, ni reimprimirlo, ni saber quién queda debiendo. Las
 * 5.398 copiadas tampoco se podían consultar sin abrir Alegra.
 *
 * DOS DECISIONES DE LA VISTA
 *   · Abre en "Con saldo", que es la pregunta real frente a esta pantalla
 *     —a quién hay que cobrarle—, no "mostrame todas".
 *   · El SALDO se muestra aparte del total y solo cuando hay: una columna
 *     llena de "₡0" no dice nada, y el número que importa se pierde entre
 *     ellos.
 */

const fecha = (f) => (f ? String(f).slice(0, 10).split('-').reverse().join('/') : '')

function EstadoFactura({ f }) {
  if (f.estado === 'anulada') return <Insignia tono="peligro">Anulada</Insignia>
  if (f.estado === 'borrador') return <Insignia tono="neutro">Borrador</Insignia>
  if (f.saldo > 0) return <Insignia tono="alerta">Debe {colones(f.saldo)}</Insignia>
  return <Insignia tono="exito">Pagada</Insignia>
}

function ModalAnular({ factura, onCerrar, onAnular }) {
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const confirmar = async () => {
    if (!motivo.trim()) return setError('Escribí por qué se anula.')
    setGuardando(true)
    try {
      await onAnular(factura.id, motivo.trim())
      onCerrar()
    } catch (e) {
      setError(e.response?.data?.message || 'No se pudo anular.')
      setGuardando(false)
    }
  }

  return (
    <Modal onCerrar={onCerrar} titulo={`Anular ${factura.numero}`} ancho="md" hoja={false}>
      <div className="flex flex-col gap-4">
        {/* Que quede claro qué hace y qué NO hace. */}
        <p className="text-sm text-neutro-600">
          La factura <strong>no se borra</strong>: conserva su número y queda anulada con el
          motivo escrito. Un número que desaparece hay que explicárselo a Hacienda.
        </p>
        <input
          type="text"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="¿Por qué se anula?"
          className="input w-full"
          autoFocus
        />
        {error && <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onCerrar} className="btn btn-outline flex-1">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={guardando}
            className="btn flex flex-1 items-center justify-center gap-2 bg-peligro-600 text-white hover:bg-peligro-700 disabled:opacity-50"
          >
            {guardando ? <Loader2 size={18} className="animate-spin" /> : <Ban size={18} />}
            Anular
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Detalle({ detalle, cargando }) {
  if (cargando) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 text-sm text-neutro-500">
        <Loader2 size={16} className="animate-spin" /> Trayendo la factura…
      </div>
    )
  }
  if (!detalle) return null

  return (
    <div className="flex flex-col gap-3 border-t border-neutro-100 bg-neutro-50/60 px-4 py-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-neutro-500">
              <th className="pb-1 font-semibold">Producto</th>
              <th className="pb-1 text-center font-semibold">Cant.</th>
              <th className="pb-1 text-right font-semibold">Precio</th>
              <th className="pb-1 text-center font-semibold">IVA</th>
              <th className="pb-1 text-right font-semibold">Importe</th>
            </tr>
          </thead>
          <tbody>
            {detalle.lineas.map(l => (
              <tr key={l.numeroLinea} className="border-t border-neutro-200/70">
                <td className="py-1.5 pr-2">
                  <span className="font-medium text-neutro-800">{l.nombre}</span>
                  {l.referencia && <span className="ml-1.5 text-xs text-neutro-400">{l.referencia}</span>}
                </td>
                <td className="py-1.5 text-center font-semibold">{l.cantidad}</td>
                <td className="py-1.5 text-right text-neutro-600">{colones(l.precioUnitario)}</td>
                <td className="py-1.5 text-center text-xs text-neutro-500">{l.tarifa}%</td>
                <td className="py-1.5 text-right font-semibold">
                  {colones(l.cantidad * l.precioUnitario * (1 - (l.descuentoPorcentaje || 0) / 100))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-neutro-500">Subtotal <strong className="text-neutro-800">{colones(detalle.subtotal)}</strong></span>
        <span className="text-neutro-500">IVA <strong className="text-neutro-800">{colones(detalle.impuesto)}</strong></span>
        <span className="text-neutro-500">Total <strong className="text-neutro-900">{colones(detalle.total)}</strong></span>
        {detalle.cobrado > 0 && (
          <span className="text-neutro-500">Pagado <strong className="text-exito-700">{colones(detalle.cobrado)}</strong></span>
        )}
        {detalle.acreditado > 0 && (
          <span className="text-neutro-500">Acreditado <strong className="text-nota-700">{colones(detalle.acreditado)}</strong></span>
        )}
      </div>

      {detalle.cobros?.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">Cobros</span>
          {detalle.cobros.map(c => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span className="text-neutro-600">{fecha(c.fecha)} · {c.metodo || 'sin método'}</span>
              {c.referencia && <span className="text-xs text-neutro-400">ref. {c.referencia}</span>}
              <span className="font-semibold text-neutro-800">{colones(c.monto)}</span>
              {/* Un cobro anulado se muestra MARCADO, no escondido: el cliente
                  va a preguntar por él y tiene que haber rastro. */}
              {c.anulado && <Insignia tono="peligro">Anulado</Insignia>}
            </div>
          ))}
        </div>
      )}

      {detalle.notasCredito?.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutro-500">Notas de crédito</span>
          {detalle.notasCredito.map(n => (
            <div key={n.id} className="flex items-center gap-2 text-sm">
              <span className="text-neutro-600">{n.numero} · {fecha(n.fecha)} · {n.motivo || 'sin motivo'}</span>
              <span className="font-semibold text-nota-700">{colones(n.monto)}</span>
              {n.estado === 'anulada' && <Insignia tono="peligro">Anulada</Insignia>}
            </div>
          ))}
        </div>
      )}

      {detalle.motivoAnulacion && (
        <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">
          Anulada: {detalle.motivoAnulacion}
        </p>
      )}
    </div>
  )
}

export default function PanelFacturasEmitidas({ f }) {
  const [anulando, setAnulando] = useState(null)
  const [nota, setNota] = useState(null)

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- Filtros ---------- */}
      <div className="card flex flex-col gap-3 rounded-2xl p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutro-400" />
          <input
            type="text"
            value={f.buscar}
            onChange={(e) => f.setBuscar(e.target.value)}
            placeholder="Número, cliente o cédula…"
            className="input w-full pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {f.ESTADOS.map(e => (
            <button
              key={e.clave}
              onClick={() => f.setEstado(e.clave)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                f.estado === e.clave
                  ? 'border-primario-300 bg-primario-50 text-primario-700'
                  : 'border-neutro-200 bg-white text-neutro-600 hover:border-neutro-300'
              }`}
            >
              {e.etiqueta}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-1.5">
            <CalendarDays size={15} className="shrink-0 text-neutro-400" />
            <input type="date" value={f.desde} onChange={(e) => f.setDesde(e.target.value)}
              className="input w-[8.5rem] px-2 py-1.5 text-xs" />
            <span className="text-xs text-neutro-400">a</span>
            <input type="date" value={f.hasta} onChange={(e) => f.setHasta(e.target.value)}
              className="input w-[8.5rem] px-2 py-1.5 text-xs" />
          </div>
        </div>
      </div>

      {f.error && <p className="rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{f.error}</p>}
      {f.mensaje && <p className="rounded-xl bg-exito-50 px-3 py-2 text-sm text-exito-700">{f.mensaje}</p>}

      {/* ---------- Lista ---------- */}
      {f.cargando && f.facturas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-neutro-500">
          <Loader2 size={18} className="animate-spin" /> Buscando…
        </div>
      ) : f.facturas.length === 0 ? (
        <Vacio
          icono={Receipt}
          titulo="No hay facturas con esos filtros"
          descripcion={f.buscar ? `Nada que coincida con "${f.buscar}".` : 'Probá con otro estado o rango de fechas.'}
        />
      ) : (
        <div className="card overflow-hidden rounded-2xl">
          {f.facturas.map((factura) => {
            const abierta = f.detalleId === factura.id
            return (
              <div key={factura.id} className="border-b border-neutro-100 last:border-0">
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-neutro-50">
                  <button
                    onClick={() => f.abrirDetalle(factura.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {abierta ? <ChevronDown size={16} className="shrink-0 text-neutro-400" />
                             : <ChevronRight size={16} className="shrink-0 text-neutro-400" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-neutro-900">{factura.cliente.nombre}</p>
                      <p className="truncate text-xs text-neutro-500">
                        {factura.numero} · {fecha(factura.fecha)} · {factura.lineas} {factura.lineas === 1 ? 'línea' : 'líneas'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-neutro-900">{colones(factura.total)}</p>
                      <EstadoFactura f={factura} />
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => f.verPdf(factura.id)}
                      title="Ver el PDF"
                      className="rounded-xl border border-neutro-200 p-2 text-neutro-600 hover:border-primario-300 hover:text-primario-600"
                    >
                      {f.abriendoPdf === factura.id
                        ? <Loader2 size={16} className="animate-spin" />
                        : <FileText size={16} />}
                    </button>

                    {factura.estado === 'emitida' && (
                      <>
                        <button
                          onClick={() => f.abrirDetalle(factura.id).then(() => setNota(factura.id))}
                          title="Nota de crédito"
                          className="rounded-xl border border-neutro-200 p-2 text-neutro-600 hover:border-nota-300 hover:text-nota-700"
                        >
                          <Undo2 size={16} />
                        </button>
                        <button
                          onClick={() => setAnulando(factura)}
                          title="Anular"
                          className="rounded-xl border border-neutro-200 p-2 text-neutro-600 hover:border-peligro-300 hover:text-peligro-600"
                        >
                          <Ban size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {abierta && <Detalle detalle={f.detalle} cargando={f.cargandoDetalle} />}
              </div>
            )
          })}
        </div>
      )}

      {/* ---------- Paginación ---------- */}
      {f.paginacion.paginas > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-sm text-neutro-500">
            {f.paginacion.total} facturas · página {f.paginacion.pagina} de {f.paginacion.paginas}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => f.setPagina(p => Math.max(1, p - 1))}
              disabled={f.paginacion.pagina <= 1}
              className="btn btn-outline p-2 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => f.setPagina(p => p + 1)}
              disabled={f.paginacion.pagina >= f.paginacion.paginas}
              className="btn btn-outline p-2 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {anulando && (
        <ModalAnular factura={anulando} onCerrar={() => setAnulando(null)} onAnular={f.anular} />
      )}
      {nota && f.detalle?.id === nota && (
        <ModalNotaCredito factura={f.detalle} onCerrar={() => setNota(null)} onCrear={f.crearNota} />
      )}
    </div>
  )
}
