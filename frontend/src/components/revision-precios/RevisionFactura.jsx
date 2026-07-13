import { ArrowLeft, Loader, RotateCcw, Send } from 'lucide-react'
import ProductoRevisionCard from './ProductoRevisionCard'

/**
 * Vista de revisión de una factura: header con acciones (volver, devolver),
 * tarjetas de resumen, listado de productos analizados, y botón de envío a
 * Alegra. Extraído de RevisionPrecios.jsx (antes la rama `vista === 'revision'`).
 */
export default function RevisionFactura({
  facturaSeleccionada,
  productos,
  productosAlegra,
  preciosAjustados,
  loading,
  devolviendo,
  enviando,
  onVolver,
  onDevolver,
  onAjustarPrecio,
  onAplicarPrecioSugerido,
  onAbrirFactor,
  onEnviar
}) {
  const preciosModificados = Object.keys(preciosAjustados).filter(
    id => preciosAjustados[id] > 0
  ).length

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onVolver}
            className="btn btn-outline flex items-center"
          >
            <ArrowLeft size={16} className="mr-2" />
            Volver a la lista
          </button>

          <button
            onClick={onDevolver}
            className="btn bg-yellow-500 hover:bg-yellow-600 text-white flex items-center"
            disabled={devolviendo}
          >
            {devolviendo ? (
              <>
                <Loader size={16} className="mr-2 animate-spin" />
                Devolviendo...
              </>
            ) : (
              <>
                <RotateCcw size={16} className="mr-2" />
                Devolver a Relacionar
              </>
            )}
          </button>
        </div>

        <h1 className="text-3xl font-bold text-gray-900">
          Factura #{facturaSeleccionada?.numeroConsecutivo}
        </h1>
        <p className="text-gray-600 mt-1">
          {facturaSeleccionada?.proveedorNombre} • {new Date(facturaSeleccionada?.fechaEmision).toLocaleDateString()}
        </p>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Total Factura</p>
          <p className="text-2xl font-bold text-blue-600">
            ₡{facturaSeleccionada?.totalFactura?.toLocaleString('es-CR')}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Productos</p>
          <p className="text-2xl font-bold text-gray-900">{productos.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Precios Ajustados</p>
          <p className="text-2xl font-bold text-orange-600">{preciosModificados}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-600 mb-1">Estado</p>
          <span className="badge badge-success text-sm">Listo</span>
        </div>
      </div>

      {loading && (
        <div className="card text-center py-8 mb-6">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Analizando productos...</p>
        </div>
      )}

      {/* Productos */}
      <div className="space-y-6 mb-6">
        {productos.map((producto, index) => (
          <ProductoRevisionCard
            key={producto.id}
            producto={producto}
            index={index}
            productosAlegra={productosAlegra}
            preciosAjustados={preciosAjustados}
            onAjustarPrecio={onAjustarPrecio}
            onAplicarPrecioSugerido={onAplicarPrecioSugerido}
            onAbrirFactor={onAbrirFactor}
          />
        ))}
      </div>

      {/* Botón Enviar */}
      <div className="card bg-gradient-to-r from-blue-50 to-green-50 border-2 border-blue-300">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              ¿Listo para enviar a Alegra?
            </h3>
            <p className="text-sm text-gray-600">
              Se actualizarán {productos.length} costos{preciosModificados > 0 && `, ${preciosModificados} precios`} y se creará la factura de proveedor
            </p>
          </div>
          <button
            onClick={onEnviar}
            className="btn btn-primary text-lg px-8 py-4 flex items-center"
            disabled={enviando}
          >
            {enviando ? (
              <>
                <Loader size={24} className="mr-3 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send size={24} className="mr-3" />
                Enviar a Alegra
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
