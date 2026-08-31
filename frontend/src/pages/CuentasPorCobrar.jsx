import { useState } from 'react'
import { useCuentasPorCobrar } from '../hooks/useCuentasPorCobrar'
import ToastContainer from '../components/ToastContainer'
import ConfirmModal from '../components/ConfirmModal'
import ResumenCards from '../components/cuentas-por-cobrar/ResumenCards'
import FiltrosCuentas from '../components/cuentas-por-cobrar/FiltrosCuentas'
import ListaClientes from '../components/cuentas-por-cobrar/ListaClientes'
import ClienteDetalle from '../components/cuentas-por-cobrar/ClienteDetalle'
import SkeletonClienteCard from '../components/cuentas-por-cobrar/SkeletonClienteCard'
import CuadreCajaDia from '../components/cuentas-por-cobrar/CuadreCajaDia'
import { ClipboardList, Wallet } from 'lucide-react'

export default function CuentasPorCobrar() {
  const {
    clientes,
    resumen,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    sincronizando,
    handleSincronizar,
    handleCargarAbonos,
    registrandoAbono,
    handleRegistrarAbono,
    dialogProps,
    toasts,
    removeToast
  } = useCuentasPorCobrar()

  // NAVEGACIÓN: lista de clientes → detalle de cliente (estado local, mismo
  // patrón que ReporteClientes.jsx)
  const [clienteActivoId, setClienteActivoId] = useState(null)
  const clienteActivo = clientes.find((c) => c.clienteId === clienteActivoId)

  // TABS: Pendientes (existente) | Cobros del día (nuevo)
  const [tab, setTab] = useState('pendientes')

  const tabs = [
    { key: 'pendientes', label: 'Pendientes', icon: ClipboardList },
    { key: 'cobros-dia', label: 'Cobros del día', icon: Wallet }
  ]

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

      {/* Tabs */}
      <div className="flex bg-neutro-100 p-1.5 rounded-2xl max-w-md">
        {tabs.map(t => {
          const Icon = t.icon
          const activa = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setClienteActivoId(null) }}
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

      {/* Tab: Pendientes (contenido original) */}
      {tab === 'pendientes' && (
        <>
          {!clienteActivo && (
            <>
              <ResumenCards resumen={resumen} filters={filters} setFilters={setFilters} />
              <FiltrosCuentas
                filters={filters}
                setFilters={setFilters}
                onLimpiar={resetFilters}
                onSincronizar={handleSincronizar}
                sincronizando={sincronizando}
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
              <SkeletonClienteCard />
              <SkeletonClienteCard />
              <SkeletonClienteCard />
            </div>
          ) : !clienteActivo ? (
            <ListaClientes clientes={clientes} onSelectCliente={setClienteActivoId} />
          ) : (
            <ClienteDetalle
              cliente={clienteActivo}
              onVolver={() => setClienteActivoId(null)}
              onCargarAbonos={handleCargarAbonos}
              registrandoAbono={registrandoAbono}
              onRegistrarAbono={handleRegistrarAbono}
            />
          )}
        </>
      )}

      {/* Tab: Cobros del día (nuevo) */}
      {tab === 'cobros-dia' && (
        <CuadreCajaDia />
      )}
    </div>
  )
}

