import { useEffect, useState } from 'react'
import { AlertTriangle, Banknote, Clock, Shield, Truck, Wallet } from 'lucide-react'
import { usePagosProveedores } from '../hooks/usePagosProveedores'
import ToastContainer from '../components/ToastContainer'
import TarjetasResumen from '../components/pagos/TarjetasResumen'
import FiltrosPagos, { VENCIMIENTOS } from '../components/pagos/FiltrosPagos'
import ListaContrapartes from '../components/pagos/ListaContrapartes'
import DetalleContraparte from '../components/pagos/DetalleContraparte'
import TablaFacturas from '../components/pagos/TablaFacturas'
import SkeletonContraparte from '../components/pagos/SkeletonContraparte'
import ModalDetalleCuenta from '../components/pagos-proveedores/ModalDetalleCuenta'
import ModalPagoVarias from '../components/pagos/ModalPagoVarias'
import BarraSeleccion from '../components/pagos/BarraSeleccion'
import SaldosAFavor from '../components/pagos-proveedores/SaldosAFavor'
import ModalAplicarNota from '../components/pagos-proveedores/ModalAplicarNota'
import { agruparPorContraparte, formatCurrency } from '../utils/pagos'

/**
 * Facturas de proveedores por pagar.
 *
 * EL REDISEÑO, Y QUÉ CAMBIÓ
 * Esta pantalla listaba las facturas sueltas, una tarjeta grande por cada
 * una: la misma cooperativa aparecía cuatro veces seguidas y no había forma
 * de ver cuánto se le debe en total, que es justo lo que uno quiere saber
 * antes de ir a pagarle. Ahora usa la misma estructura que Cuentas por
 * Cobrar —cuadrícula por proveedor, y adentro sus facturas— con los
 * componentes de components/pagos/, compartidos entre las dos.
 *
 * Lo propio de pagar sigue igual: los saldos a favor, aplicar una nota de
 * crédito, y el modal donde se registra el pago.
 */

/**
 * "Todos" es todo lo que queda por pagar, no todo lo que existe: el servidor
 * deja fuera las pagadas, que son la mayoría del histórico y enterraban lo
 * que de verdad hay que atender. Siguen alcanzables con su propio filtro.
 *
 * Se quitó "En seguimiento" (estado PARCIAL): filtraba a una lista vacía
 * siempre —no hay ni una cuenta en ese estado— y ofrecía un camino que no
 * llevaba a ningún lado. Si alguna vez se registra un abono parcial, esa
 * cuenta aparece bajo "Todos", que es donde corresponde.
 */
const ESTADOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'vencida', label: 'Vencidas' },
  // Compras de contado a las que falta anotarles cómo se pagaron (028).
  { value: 'contado', label: 'De contado' },
  { value: 'pagada', label: 'Pagadas' }
]

export default function PagosProveedores() {
  const {
    cuentas, resumen, loading, error,
    filters, setFilters, resetFilters,
    proveedoresDisponibles, registrarPago, anularPago, procesandoId, reload,
    toasts, removeToast,
    saldosAFavor, totalAFavor, loadingFavor, cargarSaldosAFavor,
    handleAplicarNota, handleEliminarNota, eliminandoNota
  } = usePagosProveedores()

  const [proveedorActivoId, setProveedorActivoId] = useState(null)
  // Por id, y la cuenta se busca en la lista recién cargada: así, después de
  // pagar o anular, el modal muestra el saldo nuevo y no una copia vieja. Si
  // la factura sale del filtro (se terminó de pagar), el modal se cierra solo.
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState(null)
  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaSeleccionadaId) || null
  const [notaAAplicar, setNotaAAplicar] = useState(null)

  // Varias facturas del mismo proveedor en un solo pago ("este pago cubre A,
  // B y C"): un solo movimiento que sale de Caja General. Lo elegido es de
  // ESE proveedor: al cambiar de proveedor se suelta.
  const [elegidas, setElegidas] = useState(new Set())
  const [pagandoVarias, setPagandoVarias] = useState(false)
  useEffect(() => { setElegidas(new Set()) }, [proveedorActivoId])
  const alternar = (f) => setElegidas((prev) => {
    const nuevo = new Set(prev)
    if (nuevo.has(f.id)) nuevo.delete(f.id); else nuevo.add(f.id)
    return nuevo
  })

  // El servidor manda las facturas una por una; el agrupado por proveedor se
  // hace acá, que es donde ya están los datos.
  const grupos = agruparPorContraparte(
    cuentas,
    (c) => ({ id: c.proveedorCedula || c.proveedorNombre, nombre: c.proveedorNombre, subtitulo: c.proveedorCedula }),
    (c) => c.saldoPendiente
  ).map((g) => ({
    ...g,
    // Una de contado no es un atraso (vence el día que se recibe).
    urgente: g.facturas.some((f) => f.estado === 'VENCIDA' || (f.estado !== 'CONTADO' && f.diasRestantes < 0))
  }))

  const proveedorActivo = grupos.find((g) => g.id === proveedorActivoId)

  const tarjetas = resumen ? [
    {
      clave: 'total', titulo: 'Total pendiente', icono: Wallet, tono: 'neutro',
      valor: formatCurrency(resumen.totalPendiente),
      pie: `${resumen.totalFacturas} factura${resumen.totalFacturas !== 1 ? 's' : ''} abierta${resumen.totalFacturas !== 1 ? 's' : ''}`
    },
    {
      clave: 'vencidas', titulo: 'Vencidas', icono: AlertTriangle, tono: 'peligro',
      valor: formatCurrency(resumen.totalVencidas), filtro: { estado: 'vencida' }
    },
    {
      clave: 'proximos', titulo: 'Próximos 7 días', icono: Clock, tono: 'alerta',
      valor: formatCurrency(resumen.proximasAVencer?.monto || 0),
      filtro: { dias: 'vence7' }
    },
    // Solo cuando hay alguna: es trabajo pendiente, no un dato fijo.
    ...(resumen.deContado?.cantidad > 0 ? [{
      clave: 'contado', titulo: `De contado sin anotar (${resumen.deContado.cantidad})`, icono: Banknote, tono: 'alerta',
      valor: formatCurrency(resumen.deContado.monto),
      filtro: { estado: 'contado' }
    }] : []),
    {
      clave: 'proveedores', titulo: 'Proveedores activos', icono: Shield, tono: 'exito',
      valor: resumen.totalProveedores
    }
  ] : []

  // El estado por defecto no cuenta como filtro activo: si contara, el botón
  // de limpiar estaría visible desde que se abre la pantalla, sin que nadie
  // haya filtrado nada.
  const hayFiltrosActivos =
    filters.estado !== 'todos' || filters.dias !== 'todos' ||
    filters.proveedor !== 'todos' || Boolean(filters.search)

  // La tabla compartida habla de {id, numero, saldo...}; acá se traduce la
  // cuenta como la manda el servidor de pagar.
  const filasDe = (facturas) => facturas.map((c) => ({
    id: c.id,
    numero: c.numeroConsecutivo,
    fechaVencimiento: c.fechaVencimiento,
    diasRestantes: c.diasRestantes,
    estado: c.estado,
    saldo: c.saldoPendiente,
    // El saldo YA viene con el crédito restado. Sin decirlo, una factura de
    // ₡60.000 con saldo ₡30.000 se lee como un error.
    nota: c.creditoAplicado > 0
      ? `Nota de crédito −${formatCurrency(c.creditoAplicado)} (original ${formatCurrency(c.montoTotal)})`
      : null,
    original: c
  }))

  return (
    <div className="max-w-6xl mx-auto pb-24 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutro-900">Pagos a Proveedores</h1>
          <p className="text-neutro-600 mt-1">
            Controla las facturas recibidas, sus fechas de vencimiento y el saldo pendiente a pagar.
          </p>
        </div>
      </div>

      {!proveedorActivo && (
        <>
          <TarjetasResumen tarjetas={tarjetas} filtros={filters} setFiltros={setFilters} />

          <SaldosAFavor
            grupos={saldosAFavor}
            total={totalAFavor}
            loading={loadingFavor}
            onRefrescar={cargarSaldosAFavor}
            onAplicar={setNotaAAplicar}
            onEliminar={handleEliminarNota}
            eliminando={eliminandoNota}
          />

          <FiltrosPagos
            estados={ESTADOS}
            vencimientos={VENCIMIENTOS}
            filtros={filters}
            setFiltros={setFilters}
            placeholderBusqueda="Buscar proveedor o factura..."
            hayFiltrosActivos={hayFiltrosActivos}
            onLimpiar={resetFilters}
            onActualizar={reload}
            actualizando={loading}
            textoActualizar="Actualizar"
            extras={
              <select
                className="input sm:w-64"
                value={filters.proveedor}
                onChange={(e) => setFilters((prev) => ({ ...prev, proveedor: e.target.value }))}
              >
                <option value="todos">Todos los proveedores</option>
                {proveedoresDisponibles.map((prov) => (
                  <option key={prov.cedula} value={prov.cedula}>{prov.nombre}</option>
                ))}
              </select>
            }
          />
        </>
      )}

      {error && (
        <div className="card bg-peligro-50 border-peligro-200 text-peligro-700">
          <p>{error}</p>
        </div>
      )}

      {loading && cuentas.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <SkeletonContraparte />
          <SkeletonContraparte />
          <SkeletonContraparte />
        </div>
      ) : !proveedorActivo ? (
        !error && (
          <ListaContrapartes
            grupos={grupos}
            icono={Truck}
            onSeleccionar={setProveedorActivoId}
            vacioTitulo="No hay facturas que coincidan con los filtros"
            vacioDetalle="Probá con otro estado o limpiá la búsqueda."
          />
        )
      ) : (
        <DetalleContraparte
          nombre={proveedorActivo.nombre}
          subtitulo={proveedorActivo.subtitulo}
          icono={Truck}
          cantidadFacturas={proveedorActivo.facturas.length}
          totalSaldo={proveedorActivo.totalSaldo}
          etiquetaTotal="Saldo a pagar"
          textoVolver="Volver a proveedores"
          onVolver={() => setProveedorActivoId(null)}
        >
          {proveedorActivo.facturas.length > 1 && (
            <BarraSeleccion
              cantidad={elegidas.size}
              total={proveedorActivo.facturas.filter((c) => elegidas.has(c.id)).reduce((s, c) => s + c.saldoPendiente, 0)}
              totalFacturas={proveedorActivo.facturas.length}
              accion="Pagar"
              onElegirTodas={() => setElegidas(new Set(proveedorActivo.facturas.map((c) => c.id)))}
              onQuitar={() => setElegidas(new Set())}
              onAccion={() => setPagandoVarias(true)}
            />
          )}
          <TablaFacturas
            facturas={filasDe(proveedorActivo.facturas)}
            onSeleccionar={(f) => setCuentaSeleccionadaId(f.original.id)}
            vacio="Este proveedor no tiene facturas con saldo."
            seleccionadas={elegidas}
            onAlternar={proveedorActivo.facturas.length > 1 ? alternar : undefined}
          />
        </DetalleContraparte>
      )}

      {pagandoVarias && proveedorActivo && (
        <ModalPagoVarias
          sentido="salida"
          titulo={proveedorActivo.nombre}
          facturas={proveedorActivo.facturas
            .filter((c) => elegidas.has(c.id))
            .map((c) => ({ id: c.id, numero: c.numeroConsecutivo, saldo: c.saldoPendiente }))}
          procesando={procesandoId === 'varias'}
          onRegistrar={async ({ lineas, metodoPagoId, referencia, fecha }) => {
            const ok = await registrarPago('varias', {
              aplicaciones: lineas.map((l) => (l.todo
                ? { cuentaPorPagarId: l.id, pagarTodo: true }
                : { cuentaPorPagarId: l.id, monto: l.monto })),
              metodoPagoId, referencia, fecha
            })
            if (ok) setElegidas(new Set())
            return ok
          }}
          onCerrar={() => setPagandoVarias(false)}
        />
      )}

      {cuentaSeleccionada && (
        <ModalDetalleCuenta
          cuenta={cuentaSeleccionada}
          procesando={procesandoId === cuentaSeleccionada.id}
          onRegistrarPago={registrarPago}
          onAnularPago={anularPago}
          onCerrar={() => setCuentaSeleccionadaId(null)}
        />
      )}

      {notaAAplicar && (
        <ModalAplicarNota
          nota={notaAAplicar}
          onAplicar={async (nota, cuenta) => {
            const ok = await handleAplicarNota(nota, cuenta)
            if (ok) setNotaAAplicar(null)
          }}
          onCerrar={() => setNotaAAplicar(null)}
        />
      )}
    </div>
  )
}
