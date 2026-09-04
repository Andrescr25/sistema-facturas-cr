import { useNavigate } from 'react-router-dom'
import Pestanas from '../ui/Pestanas'
import { DollarSign, RotateCcw, AlertCircle, Package } from 'lucide-react'

/**
 * Vista de listado de facturas por pestaña (pendientes de relacionar,
 * listas para revisión, enviadas), con banner del paso activo y navegación
 * secuencial entre pasos. Extraído de RevisionPrecios.jsx (antes la rama
 * `vista === 'lista'`).
 */
export default function ListaFacturas({
  facturas,
  loading,
  error,
  tabActiva,
  setTabActiva,
  sincronizando,
  onSincronizar,
  onAbrirRevision
}) {
  const navigate = useNavigate()

  // Verificar si todas las facturas en la lista actual están 100% relacionadas
  const todasFacturasRelacionadas = facturas.length > 0 && facturas.every(factura => {
    const total = factura.productos?.length || 0
    const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO').length || 0
    return total > 0 && relacionados === total
  })

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutro-900 flex items-center">
            <DollarSign className="mr-3" size={32} />
            Revisión de Precios
          </h1>
          <p className="text-neutro-600 mt-1">
            Analiza costos, ajusta precios y envía facturas a Alegra
          </p>
        </div>
        <button
          onClick={onSincronizar}
          disabled={sincronizando}
          className="btn btn-secondary flex items-center gap-2"
          title="Sincronizar productos desde Alegra"
        >
          <RotateCcw className={sincronizando ? 'animate-spin' : ''} size={18} />
          {sincronizando ? 'Sincronizando...' : 'Sincronizar Productos'}
        </button>
      </div>

      {/* Los tres pasos, siempre a la vista. Antes la única forma de moverse
          era un botón al final de la lista: con cincuenta facturas en
          pantalla, volver del historial obligaba a bajar hasta el fondo. */}
      <Pestanas
        activa={tabActiva}
        onCambiar={setTabActiva}
        numerada
        className="mb-6"
        pestanas={[
          { clave: 'PENDIENTE_RELACIONAR', texto: 'Relacionar productos' },
          { clave: 'LISTAS_REVISION', texto: 'Revisar precios' },
          { clave: 'ENVIADAS', texto: 'Enviadas a Alegra' }
        ]}
      />

      {/* Paso Activo Indicador */}
      {tabActiva === 'PENDIENTE_RELACIONAR' && (
        <div className="bg-alerta-50 border-2 border-alerta-200 rounded-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold text-alerta-950 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-alerta-500 text-white text-lg font-bold">1</span>
            Paso 1: Relacionar Productos (Facturas Pendientes)
          </h2>
          <p className="text-base text-alerta-800 mt-1">
            Asocia los productos de la factura con tu catálogo de Alegra para poder revisar sus costos.
          </p>
        </div>
      )}

      {tabActiva === 'LISTAS_REVISION' && (
        <div className="bg-primario-50 border-2 border-primario-200 rounded-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold text-primario-950 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primario-600 text-white text-lg font-bold">2</span>
            Paso 2: Revisar Precios de Venta (Listas al 100%)
          </h2>
          <p className="text-base text-primario-800 mt-1">
            Verifica los nuevos costos de los productos y ajusta los precios de venta antes de enviar a Alegra.
          </p>
        </div>
      )}

      {tabActiva === 'ENVIADAS' && (
        <div className="bg-exito-50 border-2 border-exito-200 rounded-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold text-exito-950 flex items-center gap-2">
            Historial de Facturas Enviadas a Alegra
          </h2>
          <p className="text-base text-exito-800 mt-1">
            Facturas que ya fueron procesadas y cargadas en Alegra. Se pueden consultar,
            pero no volver a enviar: su factura de compra ya existe allá.
          </p>
        </div>
      )}

      {error && (
        <div className="card bg-peligro-50 border-peligro-200 mb-6 p-6 rounded-2xl">
          <div className="flex items-center text-peligro-800 text-lg font-semibold">
            <AlertCircle className="mr-3" size={24} />
            {error}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-neutro-600 text-lg">Cargando facturas...</p>
        </div>
      ) : facturas.length === 0 ? (
        <div className="card text-center py-16 rounded-2xl border-2 border-dashed border-neutro-300">
          <Package className="mx-auto text-neutro-400 mb-4 opacity-70" size={64} />
          <h3 className="text-xl font-bold text-neutro-900 mb-2">
            {tabActiva === 'PENDIENTE_RELACIONAR' && 'No hay facturas pendientes de relacionar'}
            {tabActiva === 'LISTAS_REVISION' && 'No hay facturas listas para revisión'}
            {tabActiva === 'ENVIADAS' && 'No hay facturas enviadas'}
          </h3>
          <p className="text-neutro-600 text-base">
            {tabActiva === 'PENDIENTE_RELACIONAR' && '¡Excelente! Todas las facturas están relacionadas.'}
            {tabActiva === 'LISTAS_REVISION' && 'Las facturas aparecerán aquí cuando estén 100% relacionadas.'}
            {tabActiva === 'ENVIADAS' && 'Las facturas que envíes a Alegra se listarán en este historial.'}
          </p>
          {tabActiva === 'PENDIENTE_RELACIONAR' && (
            <button
              onClick={() => setTabActiva('LISTAS_REVISION')}
              className="mt-6 btn btn-primary text-lg px-8 py-3.5 rounded-xl shadow-md inline-flex items-center gap-2"
            >
              Continuar al Paso 2: Revisar Precios →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {facturas.map(factura => {
            const totalProductos = factura.productos?.length || 0
            const relacionados = factura.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO').length || 0
            const porcentajeRelacionado = totalProductos > 0 ? Math.round((relacionados / totalProductos) * 100) : 0
            const es100Relacionada = porcentajeRelacionado === 100

            return (
              <div
                key={factura.id}
                className="card hover:shadow-xl hover:border-primario-400 border-2 border-neutro-200 transition-all cursor-pointer p-6 rounded-2xl bg-white mb-4"
                onClick={() => {
                  if (tabActiva === 'LISTAS_REVISION' && es100Relacionada) {
                    onAbrirRevision(factura)
                  } else if (tabActiva === 'PENDIENTE_RELACIONAR') {
                    navigate(`/relacionar-productos/${factura.id}`)
                  } else if (tabActiva === 'ENVIADAS') {
                    onAbrirRevision(factura)
                  }
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-2xl font-black text-neutro-900">
                        Factura #{factura.numeroConsecutivo}
                      </h3>
                      {tabActiva === 'PENDIENTE_RELACIONAR' && (
                        <span className={`text-sm px-4 py-1.5 rounded-full font-bold text-white shadow-sm ${porcentajeRelacionado === 0 ? 'bg-peligro-500' :
                            porcentajeRelacionado < 100 ? 'bg-alerta-500' :
                              'bg-exito-500'
                          }`}>
                          {porcentajeRelacionado}% Relacionada
                        </span>
                      )}
                      {tabActiva === 'LISTAS_REVISION' && (
                        <span className="text-sm px-4 py-1.5 bg-exito-100 text-exito-800 rounded-full font-bold shadow-sm">
                          Listo para Revisión
                        </span>
                      )}
                      {tabActiva === 'ENVIADAS' && (
                        <span className="text-sm px-4 py-1.5 bg-neutro-100 text-neutro-700 rounded-full font-bold shadow-sm">
                          Enviada a Alegra
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-base">
                      <div>
                        <p className="text-neutro-500 font-semibold text-sm">Proveedor</p>
                        <p className="font-bold text-neutro-900 text-lg leading-tight mt-0.5">{factura.proveedorNombre}</p>
                      </div>
                      <div>
                        <p className="text-neutro-500 font-semibold text-sm">Fecha</p>
                        <p className="font-semibold text-neutro-900 text-lg mt-0.5">
                          {new Date(factura.fechaEmision).toLocaleDateString('es-CR')}
                        </p>
                      </div>
                      <div>
                        <p className="text-neutro-500 font-semibold text-sm">Total Factura</p>
                        <p className="font-extrabold text-exito-600 text-xl mt-0.5">
                          ₡{factura.totalFactura?.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-neutro-500 font-semibold text-sm">Productos</p>
                        <p className="font-bold text-neutro-900 text-lg mt-0.5">
                          {totalProductos} {totalProductos === 1 ? 'producto' : 'productos'}
                          {tabActiva === 'PENDIENTE_RELACIONAR' && (
                            <span className="text-xs text-neutro-500 block font-normal mt-0.5">
                              ({relacionados} relacionados)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0 mt-2 md:mt-0">
                    <button className="btn btn-primary w-full md:w-auto text-lg px-8 py-4 rounded-xl font-bold shadow-md">
                      {tabActiva === 'PENDIENTE_RELACIONAR' && 'Relacionar →'}
                      {tabActiva === 'LISTAS_REVISION' && 'Revisar →'}
                      {tabActiva === 'ENVIADAS' && 'Ver →'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Botones de Navegación Secuencial al Final de la Lista */}
      {!loading && (
        <div className="mt-8 pt-6 border-t-2 border-neutro-200">
          {tabActiva === 'PENDIENTE_RELACIONAR' && todasFacturasRelacionadas && (
            <div className="flex justify-end">
              <button
                onClick={() => setTabActiva('LISTAS_REVISION')}
                className="btn btn-primary text-xl px-10 py-5 rounded-2xl shadow-xl flex items-center gap-3 transition-transform hover:scale-102"
              >
                Continuar al Paso 2: Revisar Precios →
              </button>
            </div>
          )}

          {/* Moverse entre pasos ahora se hace con las pestañas de arriba.
              Acá queda solo el avance natural del paso 1, que es una acción,
              no navegación. */}
        </div>
      )}
    </div>
  )
}
