import { useState } from 'react'
import { AlertTriangle, ClipboardList, Clock, Users, Wallet } from 'lucide-react'
import { useCuentasPorCobrar } from '../hooks/useCuentasPorCobrar'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import TarjetasResumen from '../components/pagos/TarjetasResumen'
import FiltrosPagos, { VENCIMIENTOS } from '../components/pagos/FiltrosPagos'
import ListaContrapartes from '../components/pagos/ListaContrapartes'
import SkeletonContraparte from '../components/pagos/SkeletonContraparte'
import ClienteDetalle from '../components/cuentas-por-cobrar/ClienteDetalle'
import CuadreCajaDia from '../components/cuentas-por-cobrar/CuadreCajaDia'
import { formatCurrency } from '../utils/pagos'

/**
 * Clientes que deben. La pantalla hermana de Pagos a Proveedores: las dos
 * están armadas con los mismos componentes de components/pagos/, así que lo
 * que se arregle o mejore en una aparece en la otra.
 */

const ESTADOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'PENDIENTE', label: 'Pendientes' },
  { value: 'VENCIDA', label: 'Vencidas' },
  { value: 'PARCIAL', label: 'Con abono' }
]

export default function CuentasPorCobrar() {
  const {
    clientes, resumen, loading, error,
    filters, setFilters, resetFilters,
    actualizando, handleActualizar,
    handleCargarAbonos, handleCargarProductos, registrandoAbono, handleRegistrarAbono, handleRegistrarCobroVarias,
    dialogProps, toasts, removeToast
  } = useCuentasPorCobrar()

  // NAVEGACIÓN: lista de clientes → detalle de cliente (estado local, mismo
  // patrón que ReporteClientes.jsx)
  // `undefined` es "ninguno seleccionado", NO `null`: hay 14 facturas cuyo
  // cliente se borró en Alegra antes de la copia y su `clienteId` es null.
  // Con null como centinela, `null === null` coincidía y la pantalla abría
  // sola ese grupo; peor, "Volver a clientes" lo volvía a encontrar y no se
  // podía salir ni llegar a los otros 54 deudores.
  const [clienteActivoId, setClienteActivoId] = useState(undefined)
  const clienteActivo = clienteActivoId === undefined
    ? null
    : clientes.find((c) => c.clienteId === clienteActivoId)

  const [tab, setTab] = useState('pendientes')
  const tabs = [
    { key: 'pendientes', label: 'Pendientes', icon: ClipboardList },
    { key: 'cobros-dia', label: 'Cobros del día', icon: Wallet }
  ]

  const tarjetas = resumen ? [
    {
      clave: 'total', titulo: 'Total por cobrar', icono: Wallet, tono: 'neutro',
      valor: formatCurrency(resumen.totalPorCobrar),
      pie: `${resumen.totalFacturas} factura${resumen.totalFacturas !== 1 ? 's' : ''} abierta${resumen.totalFacturas !== 1 ? 's' : ''}`
    },
    {
      clave: 'vencido', titulo: 'Vencido', icono: AlertTriangle, tono: 'peligro',
      valor: formatCurrency(resumen.totalVencido), filtro: { estado: 'VENCIDA' }
    },
    {
      clave: 'proximos', titulo: 'Próximos 7 días', icono: Clock, tono: 'alerta',
      valor: formatCurrency(resumen.proximasAVencer?.monto || 0),
      filtro: { dias: 'vence7' }
    },
    {
      clave: 'clientes', titulo: 'Clientes con saldo', icono: Users, tono: 'exito',
      valor: resumen.totalClientes
    }
  ] : []

  // El servidor ya manda los clientes agrupados; solo se marca cuáles tienen
  // alguna factura vencida, que es lo que pinta la tarjeta de rojo. `facturas`
  // y `totalSaldo` son las props de la lista compartida con Pagos a
  // Proveedores (components/pagos), no los nombres del deudor.
  const grupos = clientes.map((c) => ({
    id: c.clienteId,
    nombre: c.nombre,
    facturas: c.detalle,
    totalSaldo: c.saldoTotal,
    urgente: c.detalle.some((f) => f.estado === 'VENCIDA')
  }))

  const hayFiltrosActivos =
    filters.estado !== 'todos' || filters.dias !== 'todos' || Boolean(filters.search)

  return (
    <div className="max-w-6xl mx-auto pb-24 space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmModal {...dialogProps} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutro-900">Cuentas por Cobrar</h1>
          <p className="text-neutro-600 mt-1">Clientes con facturas pendientes de pago y registro de abonos.</p>
        </div>
      </div>

      <div className="flex bg-neutro-100 p-1.5 rounded-2xl max-w-xl">
        {tabs.map((t) => {
          const Icon = t.icon
          const activa = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setClienteActivoId(undefined) }}
              className={`flex-1 py-3 text-center text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all ${
                activa ? 'bg-white text-primario-600 shadow-md ring-1 ring-black/5' : 'text-neutro-600 hover:text-neutro-900'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'pendientes' && (
        <>
          {!clienteActivo && (
            <>
              <TarjetasResumen tarjetas={tarjetas} filtros={filters} setFiltros={setFilters} />
              <FiltrosPagos
                estados={ESTADOS}
                vencimientos={VENCIMIENTOS}
                filtros={filters}
                setFiltros={setFilters}
                placeholderBusqueda="Buscar cliente o factura..."
                hayFiltrosActivos={hayFiltrosActivos}
                onLimpiar={resetFilters}
                onActualizar={handleActualizar}
                actualizando={actualizando}
                textoActualizar="Actualizar"
              />
            </>
          )}

          {error && (
            <div className="card bg-peligro-50 border-peligro-200 text-peligro-700">
              <p>{error}</p>
            </div>
          )}

          {loading && clientes.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <SkeletonContraparte />
              <SkeletonContraparte />
              <SkeletonContraparte />
            </div>
          ) : !clienteActivo ? (
            <ListaContrapartes
              grupos={grupos}
              icono={Users}
              onSeleccionar={setClienteActivoId}
              vacioTitulo="No hay clientes con saldo pendiente"
              vacioDetalle="Cuando haya facturas de venta con saldo, aparecerán acá."
            />
          ) : (
            <ClienteDetalle
              cliente={clienteActivo}
              onVolver={() => setClienteActivoId(undefined)}
              onCargarAbonos={handleCargarAbonos}
              onCargarProductos={handleCargarProductos}
              registrandoAbono={registrandoAbono}
              onRegistrarAbono={handleRegistrarAbono}
              onRegistrarCobroVarias={handleRegistrarCobroVarias}
            />
          )}
        </>
      )}

      {tab === 'cobros-dia' && <CuadreCajaDia />}
    </div>
  )
}
