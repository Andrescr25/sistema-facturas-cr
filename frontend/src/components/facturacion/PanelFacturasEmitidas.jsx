import { useState } from 'react'
import { Search, Loader2, Ban, ChevronRight, ChevronLeft, Receipt, CalendarDays } from 'lucide-react'
import Insignia from '../ui/Insignia'
import Vacio from '../ui/Vacio'
import Modal from '../ui/Modal'
import ModalNotaCredito from './ModalNotaCredito'
import VistaFactura from './VistaFactura'
import ModalEnviarFacturaCorreo from './ModalEnviarFacturaCorreo'
import ModalEnviarWhatsApp from '../whatsapp/ModalEnviarWhatsApp'
import { mensajeFactura } from '../../utils/mensajesWhatsApp'
import EtiquetaTipoFactura from './EtiquetaTipoFactura'
import { colones } from '../../utils/colones'
import ContextoCicloDocumento from '../ContextoCicloDocumento'

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

export default function PanelFacturasEmitidas({ f }) {
  const [anulando, setAnulando] = useState(null)
  const [nota, setNota] = useState(null)

  // Una factura abierta ocupa la pantalla entera. Es un documento: se entra a
  // él y se vuelve, en vez de empujar la lista hacia abajo.
  if (f.detalleId) {
    if (f.cargandoDetalle || !f.detalle) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-neutro-500">
          <Loader2 size={18} className="animate-spin" /> Abriendo la factura…
        </div>
      )
    }
    return (
      <>
        {/* La confirmación se ve DONDE quedó el usuario: al guardar no se
            vuelve a la lista, así que mostrarla solo allá era no mostrarla. */}
        {f.mensaje && (
          <p className="mb-3 rounded-xl bg-exito-50 px-3 py-2 text-sm text-exito-700">{f.mensaje}</p>
        )}
        {f.error && <p role="alert" className="mb-3 rounded-xl bg-peligro-50 px-3 py-2 text-sm text-peligro-700">{f.error}</p>}
        <VistaFactura
          factura={f.detalle}
          empresa={f.empresa}
          editando={f.editando}
          productos={f.productos}
          clientes={f.clientes}
          onGuardar={f.guardarEdicion}
          onAnularCobro={f.anularCobro}
          onCancelarEdicion={f.cerrarEdicion}
          abriendoPdf={f.abriendoPdf}
          onVolver={f.volver}
          onPdf={f.verPdf}
          onAnular={setAnulando}
          onNotaCredito={setNota}
          onEnviar={f.abrirEnvio}
          onCorreo={f.abrirCorreo}
          cargandoCorreo={f.cargandoCorreo}
          onEditar={f.abrirEdicion}
          onFiscalCambio={() => f.refrescarDetalle(f.detalle.id)}
        />
        {anulando && <ModalAnular factura={anulando} onCerrar={() => setAnulando(null)} onAnular={f.anular} />}
        {f.enviando && (
          <ModalEnviarWhatsApp
            titulo={`Enviar la factura ${f.enviando.numero}`}
            subtitulo={f.enviando.cliente?.nombre}
            telefonos={f.enviando.candidatos}
            telefonosSinReconocer={f.enviando.sinReconocer}
            documento={{ tipo: 'factura', referencia: f.enviando.numero }}
            mensajeInicial={mensajeFactura({
              numero: f.enviando.numero,
              cliente: f.enviando.cliente?.nombre
            })}
            onEnviar={f.enviarPorWhatsApp}
            onCerrar={f.cerrarEnvio}
          />
        )}
        {nota && <ModalNotaCredito factura={f.detalle} onCerrar={() => setNota(null)} onCrear={f.crearNota} />}
        {f.correoAbierto && <ModalEnviarFacturaCorreo datos={f.correoAbierto} onEnviar={f.enviarPorCorreo} onCerrar={f.cerrarCorreo} />}
      </>
    )
  }

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
        <div className="flex flex-col gap-2">
          {f.facturas.map((factura) => (
            <button
              key={factura.id}
              onClick={() => f.abrirDetalle(factura.id)}
              className="card flex items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all hover:border-primario-200 hover:shadow-md"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-neutro-900">{factura.cliente.nombre}</p>
                <p className="truncate text-xs text-neutro-500">
                  {factura.numero} · {fecha(factura.fecha)} · {factura.lineas} {factura.lineas === 1 ? 'línea' : 'líneas'}
                </p>
                <ContextoCicloDocumento documento={factura} />
                <div className="mt-1">
                  <EtiquetaTipoFactura
                    electronica={factura.electronica}
                    tipoDocumento={factura.tipoDocumento}
                    tamano="chico"
                  />
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-bold text-neutro-900">{colones(factura.total)}</p>
                <EstadoFactura f={factura} />
              </div>

              <ChevronRight size={18} className="shrink-0 text-neutro-300" />
            </button>
          ))}
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

    </div>
  )
}
