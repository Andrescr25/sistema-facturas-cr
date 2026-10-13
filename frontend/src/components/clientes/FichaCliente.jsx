import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Pencil, AlertTriangle, Contact, RefreshCw } from 'lucide-react'
import { clientesService } from '../../services/clientesService'
import { colones } from '../../utils/colones'
import Insignia from '../ui/Insignia'
import Boton from '../ui/Boton'
import UbicacionCliente from './UbicacionCliente'
import RotacionCliente from './RotacionCliente'
import ContextoCicloDocumento from '../ContextoCicloDocumento'

/**
 * Todo lo de un cliente en una sola pantalla.
 *
 * POR QUÉ. Para contestar "¿cómo viene este cliente?" había que abrir tres
 * pantallas: Cuentas por Cobrar para el saldo, Reporte de Clientes para lo que
 * compra y el portal para sus pedidos. Cuando alguien llama por teléfono ese
 * recorrido no se hace: se contesta con lo que uno se acuerda.
 *
 * Secciones separan contacto/recorrido de facturas, historia y pedidos online.
 */

const dia = (v) => (v ? new Date(v).toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
/**
 * "8 sept" para lo de este año, "11 oct 2024" para lo de antes. Sin el año,
 * un abono de octubre de 2024 se leía como si fuera de hace un mes y quedaba
 * abajo de todo sin que se entendiera por qué.
 */
const diaCorto = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  const esteAno = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', ...(esteAno ? {} : { year: 'numeric' }) })
}

function Bloque({ titulo, children, pie }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-neutro-200 bg-white">
      <h2 className="border-b border-neutro-100 bg-neutro-50 px-5 py-4 text-base font-bold text-neutro-800">{titulo}</h2>
      <div className="p-5">{children}
        {pie && <p className="mt-3 text-sm text-neutro-500">{pie}</p>}
      </div>
    </section>
  )
}

function Cifra({ etiqueta, valor, tono = 'text-neutro-900' }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-neutro-500">{etiqueta}</p>
      <p className={`mt-2 break-words text-xl sm:text-2xl font-bold ${tono}`}>{valor}</p>
    </div>
  )
}

/** Una tabla que en el teléfono se lee como lista. */
function Filas({ vacio, children, hay }) {
  if (!hay) return <p className="mt-2 text-sm text-neutro-400">{vacio}</p>
  return <ul className="mt-2 divide-y divide-neutro-100">{children}</ul>
}

export default function FichaCliente({ clienteId, revision, onVolver, onEditar, textoVolver = 'Volver a Clientes' }) {
  const [pestana, setPestana] = useState('general')
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)
  const volver = <button type="button" onClick={onVolver} className="inline-flex min-h-12 items-center gap-2 text-base font-semibold text-neutro-600 hover:text-primario-700"><ArrowLeft size={20} />{textoVolver}</button>

  useEffect(() => {
    let vigente = true
    setCargando(true); setError(null)
    clientesService.resumen(clienteId)
      .then(r => { if (vigente) setDatos(r) })
      .catch(e => { if (vigente) setError(e?.response?.data?.message || 'No se pudo cargar la ficha.') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [clienteId, revision, intento])

  // Volver y reintentar permanecen disponibles aunque la ficha no cargue.
  if (cargando) return <div className="space-y-4">{volver}<div className="flex min-h-64 items-center justify-center gap-3 text-neutro-500" role="status"><Loader2 className="animate-spin" size={25} />Cargando ficha…</div></div>
  if (error) return <div className="space-y-4">{volver}<div className="rounded-2xl border border-peligro-200 bg-white p-8" role="alert"><p className="text-base font-semibold text-peligro-700">{error}</p><Boton variante="secundario" className="mt-4" onClick={() => setIntento(n => n + 1)}><RefreshCw size={17} />Reintentar</Boton></div></div>
  if (!datos) return null

  const { cliente, saldo, compras, facturas, abonos, productos, pedidos, facturasPendientes = [], rotacion } = datos
  const dias = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
  const sobregirado = saldo.disponible !== null && saldo.disponible < 0

  return (
    <div className="space-y-4">
      {volver}
      <header className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-neutro-200 bg-white p-5 sm:p-6">
        <div className="flex min-w-0 w-full items-start gap-4 sm:flex-1">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primario-50 text-primario-800"><Contact size={31} /></span>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold leading-tight text-neutro-900 sm:text-3xl">{cliente.nombre}</h1>
            <p className="mt-2 text-base text-neutro-500">{cliente.identificacion || 'Sin identificación'}{cliente.plazo && ` · ${cliente.plazo}`}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Insignia tono={cliente.activo ? 'exito' : 'neutro'}>{cliente.activo ? 'Cliente activo' : 'Cliente inactivo'}</Insignia>
              <span className="rounded-full bg-neutro-100 px-3 py-1 text-sm text-neutro-600">{cliente.ruta_nombre || 'Sin ruta asignada'}</span>
            </div>
          </div>
        </div>
        <Boton variante="secundario" tamano="lg" onClick={() => onEditar(cliente)}><Pencil size={18} />Editar ficha</Boton>
      </header>

      <Bloque titulo="Lo que debe hoy">
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Cifra etiqueta="Saldo" valor={colones(saldo.total)} tono={saldo.total > 0 ? 'text-neutro-900' : 'text-exito-700'} />
          <Cifra etiqueta="Vencido" valor={colones(saldo.vencido)} tono={saldo.vencido > 0 ? 'text-peligro-600' : 'text-neutro-400'} />
          <Cifra etiqueta="Facturas" valor={`${saldo.facturas}${saldo.vencidas ? ` · ${saldo.vencidas} vencida${saldo.vencidas === 1 ? '' : 's'}` : ''}`} />
          {/* Sin límite de crédito puesto no se inventa un porcentaje: decir
              "0 %" haría creer que no tiene crédito, y es que no está escrito. */}
          <Cifra
            etiqueta="Crédito disponible"
            valor={saldo.limite === null ? 'Sin límite puesto' : colones(saldo.disponible)}
            tono={sobregirado ? 'text-peligro-600' : 'text-neutro-900'}
          />
        </div>
        {sobregirado && (
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-peligro-700">
            <AlertTriangle size={12} />Debe {colones(saldo.total)} y su límite es {colones(saldo.limite)}.
          </p>
        )}
      </Bloque>


      <nav className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Secciones de la ficha">
        {[['general','Información'],['facturas','Facturas y abonos'],['historial','Historial de compras'],['pedidos','Pedidos en línea']].map(([id, titulo]) =>
          <button key={id} onClick={() => setPestana(id)} aria-pressed={pestana === id} className={`rounded-xl min-h-12 px-4 py-3 font-bold text-sm ${pestana === id ? 'bg-primario-800 text-white' : 'border border-neutro-200 bg-white text-neutro-600'}`}>{titulo}</button>)}
      </nav>
      {pestana === 'general' && <>
        <div className="grid gap-4 lg:grid-cols-2">
          <Bloque titulo="Información general">
            <p className="text-sm text-neutro-600">{cliente.tipo_identificacion || 'Sin tipo'} · {cliente.identificacion || 'Sin identificación'}</p>
            <p className="mt-2 text-sm text-neutro-500">Actividad económica: {cliente.actividad_economica || 'Sin definir'}</p>
            <div className="mt-3"><Insignia tono={cliente.activo ? 'exito' : 'neutro'}>{cliente.activo ? 'Activo' : 'Inactivo'}</Insignia></div>
          </Bloque>
          <Bloque titulo="Contacto">
            <p className="break-words text-base">Correo: {cliente.correo || 'Sin correo'}</p>
            {(cliente.correos_adicionales || []).map(c => <p key={c} className="text-sm break-all">{c}</p>)}
            <p className="mt-3 text-base">Celular: {cliente.celular || 'Sin celular'}</p>
            <p className="text-sm">Teléfono: {cliente.telefono || 'Sin teléfono'}{cliente.telefono_secundario && ` · ${cliente.telefono_secundario}`}</p>
          </Bloque>
          <Bloque titulo="Ruta y visitas">
            <p className="mt-3 font-bold">{cliente.ruta_nombre || 'Sin ruta'}{cliente.orden_ruta && ` · visita ${cliente.orden_ruta}`}</p>
            <p className="mt-2 text-sm text-neutro-500">Visita: {dias[cliente.dia_visita - 1] || 'Sin día definido'}</p>
            <p className="text-sm text-neutro-500">Entrega: {dias[cliente.dia_entrega - 1] || 'Sin día definido'}</p>
            <RotacionCliente rotacion={rotacion} />
          </Bloque>
          <Bloque titulo="Ubicación">
            <p className="text-base">{[cliente.provincia, cliente.canton, cliente.distrito, cliente.barrio].filter(Boolean).join(', ') || 'Sin dirección'}</p>
            {cliente.otras_senas && <p className="mt-2 break-words text-base whitespace-pre-wrap">{cliente.otras_senas}</p>}
            <div className="mt-3"><UbicacionCliente enlace={cliente.ubicacion_maps} /></div>
          </Bloque>
        </div>
        <Bloque titulo="Notas"><p className="mt-3 break-words text-base whitespace-pre-wrap">{cliente.observaciones || 'Sin notas.'}</p></Bloque>
      </>}

      {pestana === 'historial' &&
      <Bloque
        titulo={`Cómo viene comprando · últimos ${compras.meses} meses`}
        pie={compras.ultima ? `Última compra el ${dia(compras.ultima)}.` : null}
      >
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Cifra etiqueta="Facturado" valor={colones(compras.total)} />
          <Cifra etiqueta="Facturas" valor={compras.facturas} />
          <Cifra etiqueta="Promedio por factura" valor={colones(compras.promedio)} />
        </div>
      </Bloque>
      }

      {pestana === 'facturas' && <>
      <Bloque titulo="Facturas pendientes">
        <Filas hay={facturasPendientes.length} vacio="No hay facturas pendientes.">
          {facturasPendientes.map(f => <li key={f.id} className="flex justify-between items-center gap-4 py-4 text-base">
            <div><p className="font-bold">{f.numero}</p><p className="text-xs text-neutro-500">{dia(f.fecha)}{f.vencimiento && ` · vence ${dia(f.vencimiento)}`}</p><ContextoCicloDocumento documento={f} /></div>
            <span className="font-bold text-peligro-600">{colones(f.saldo)}</span>
          </li>)}
        </Filas>
      </Bloque>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Últimas facturas">
          <Filas hay={facturas.length} vacio="Todavía no se le ha facturado.">
            {facturas.map(f => (
              <li key={f.id} className="flex items-center justify-between gap-4 py-4 text-base">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-neutro-800">{f.numero}</p>
                  <p className="text-xs text-neutro-500">
                    {diaCorto(f.fecha)}
                    {f.estado === 'anulada' && ' · anulada'}
                    {!f.electronica && f.estado !== 'anulada' && ' · de venta'}
                  </p>
                  <ContextoCicloDocumento documento={f} />
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-neutro-800">{colones(f.total)}</p>
                  {f.saldo > 0 && <p className="text-xs font-semibold text-peligro-600">debe {colones(f.saldo)}</p>}
                </div>
              </li>
            ))}
          </Filas>
        </Bloque>

        <Bloque titulo="Últimos abonos">
          <Filas hay={abonos.length} vacio="Todavía no ha abonado.">
            {abonos.map(a => (
              <li key={a.id} className="flex items-center justify-between gap-4 py-4 text-base">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-neutro-800">
                    {diaCorto(a.fecha)} · {a.metodo || 'sin método'}
                  </p>
                  {a.referencia && <p className="truncate text-xs text-neutro-500">ref. {a.referencia}</p>}
                </div>
                <div className="shrink-0 text-right">
                  {/* Los anulados van, marcados: esconderlos haría que el
                      cliente pregunte por un pago que sí existió. */}
                  <p className={`font-semibold ${a.anulado ? 'text-neutro-400 line-through' : 'text-exito-700'}`}>
                    {colones(a.monto)}
                  </p>
                  {a.anulado && <Insignia tono="neutro">Anulado</Insignia>}
                </div>
              </li>
            ))}
          </Filas>
        </Bloque>
      </div>
      </>}

      {pestana === 'historial' &&
      <Bloque titulo={`Qué se lleva · últimos ${compras.meses} meses`}>
        <Filas hay={productos.length} vacio="Sin compras en el período.">
          {productos.map(p => (
            <li key={p.clave} className="flex items-center justify-between gap-4 py-4 text-base">
              <div className="min-w-0">
                <p className="truncate font-semibold text-neutro-800">{p.nombre}</p>
                <p className="text-xs text-neutro-500">
                  {p.cantidad} en {p.veces} {p.veces === 1 ? 'factura' : 'facturas'} · última {diaCorto(p.ultima)}
                </p>
              </div>
              <p className="shrink-0 font-semibold text-neutro-800">{colones(p.total)}</p>
            </li>
          ))}
        </Filas>
      </Bloque>
      }

      {['historial','pedidos'].includes(pestana) && (
        <Bloque titulo={pestana === 'pedidos' ? 'Pedidos en línea · entre los 10 más recientes' : 'Pedidos recientes · portal y agente'}>
          <Filas hay={pedidos.filter(p => pestana === 'historial' || p.origen === 'portal').length} vacio="Sin pedidos en esta sección.">
            {pedidos.filter(p => pestana === 'historial' || p.origen === 'portal').map(p => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-4 text-base">
                <div className="min-w-0"><p className="text-neutro-700">#{p.id} · {diaCorto(p.fecha)} · {p.estado}{p.origen && ` · ${p.origen === 'agente' ? 'Agente' : 'En línea'}`}</p><ContextoCicloDocumento documento={p} /></div>
                <p className="font-semibold text-neutro-800">{colones(p.total)}</p>
              </li>
            ))}
          </Filas>
        </Bloque>
      )}
    </div>
  )
}
