import { ArrowLeft, Loader, RotateCcw, Send, CheckCircle } from 'lucide-react'
import ProductoRevisionCard from './ProductoRevisionCard'
import Insignia from '../ui/Insignia'

/**
 * Vista de revisión de una factura: header con acciones (volver, devolver),
 * tarjetas de resumen, listado de productos analizados, y botón de envío a
 * Alegra. Extraído de RevisionPrecios.jsx (antes la rama `vista === 'revision'`).
 */
export default function RevisionFactura({
  facturaSeleccionada,
  productos,
  productosAlegra,
  sugerenciasPrecio,
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

  // YA ENVIADA = su factura de compra existe en Alegra.
  // El historial abre esta misma pantalla, y hasta ahora lo hacía con los dos
  // botones activos y el estado escrito a mano como "Listo": desde ahí se
  // podía devolver la factura y mandarla de nuevo, creando una SEGUNDA
  // factura de compra por la misma compra. Con 838 facturas en ese estado,
  // era cuestión de un clic.
  const yaEnviada = facturaSeleccionada?.estado === 'ENVIADA'

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

          {!yaEnviada && (
            <button
              onClick={onDevolver}
              className="btn bg-alerta-500 hover:bg-alerta-600 text-white flex items-center"
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
          )}
        </div>

        <h1 className="text-3xl font-bold text-neutro-900">
          Factura #{facturaSeleccionada?.numeroConsecutivo}
        </h1>
        <p className="text-neutro-600 mt-1">
          {facturaSeleccionada?.proveedorNombre} • {new Date(facturaSeleccionada?.fechaEmision).toLocaleDateString()}
        </p>
      </div>

      {/* Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-neutro-600 mb-1">Total Factura</p>
          <p className="text-2xl font-bold text-primario-600">
            ₡{facturaSeleccionada?.totalFactura?.toLocaleString('es-CR')}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-neutro-600 mb-1">Productos</p>
          <p className="text-2xl font-bold text-neutro-900">{productos.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-neutro-600 mb-1">Precios Ajustados</p>
          <p className="text-2xl font-bold text-alerta-600">{preciosModificados}</p>
        </div>
        <div className="card">
          <p className="text-sm text-neutro-600 mb-1">Estado</p>
          {/* Antes decía "Listo" siempre, incluso abriendo una factura del
              historial que ya estaba en Alegra. */}
          <Insignia tono={yaEnviada ? 'neutro' : 'exito'}>
            {yaEnviada ? 'Ya enviada a Alegra' : 'Lista para enviar'}
          </Insignia>
        </div>
      </div>

      {loading && (
        <div className="card text-center py-8 mb-6">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-neutro-600">Analizando productos...</p>
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
            sugerenciasPrecio={sugerenciasPrecio}
            preciosAjustados={preciosAjustados}
            onAjustarPrecio={onAjustarPrecio}
            onAplicarPrecioSugerido={onAplicarPrecioSugerido}
            onAbrirFactor={onAbrirFactor}
          />
        ))}
      </div>

      {/* Botón Enviar — solo si todavía no se envió */}
      {yaEnviada ? (
        <div className="card border-2 border-neutro-200 bg-neutro-50">
          <div className="flex items-start gap-3">
            <CheckCircle size={22} className="mt-0.5 shrink-0 text-exito-600" />
            <div>
              <h3 className="text-lg font-bold text-neutro-900">Esta factura ya se envió a Alegra</h3>
              <p className="mt-1 text-sm text-neutro-600">
                Su factura de compra ya existe allá. No se puede volver a enviar ni devolver a
                relacionar: se crearía una segunda factura de compra por la misma compra y el
                gasto quedaría contado dos veces. Si de verdad hay que rehacerla, primero
                anulala en Alegra.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card bg-gradient-to-r from-primario-50 to-primario-50 border-2 border-primario-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-neutro-900 mb-1">
                ¿Listo para enviar a Alegra?
              </h3>
              <p className="text-sm text-neutro-600">
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
      )}
    </div>
  )
}
