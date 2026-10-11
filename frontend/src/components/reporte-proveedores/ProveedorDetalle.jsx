import ProcedenciaFaltante from './ProcedenciaFaltante'
import Boton from '../ui/Boton'
import PanelSeccion from '../ui/PanelSeccion'
import { Users, Package, RefreshCw, FileText, Download, Trash2, ArrowLeft } from 'lucide-react'
import { getCantidadFinal, usaDatosProveedor } from '../../utils/reporteProveedoresUtils'
import NotasDelProducto from './NotasDelProducto'
import PanelNotasProveedor from './PanelNotasProveedor'

/**
 * Panel de detalle de un proveedor: acciones (guardar cambios, generar PDF,
 * agregar producto), tarjeta de estadísticas, y la tabla de
 * productos de la orden de compra (originales + agregados manualmente), con
 * botón flotante para reasignar productos seleccionados. Extraído de
 * ReporteProveedores.jsx (antes renderProveedorSeleccionado).
 */
export default function ProveedorDetalle({
  proveedor,
  onVolver,
  cantidadesModificadas,
  cantidadesGuardadas,
  handleGuardarCantidades,
  handleCantidadChange,
  handleGenerarPDF,
  preferenciasDatosProveedor,
  togglePreferenciaProveedor,
  productosSeleccionados,
  toggleProductoSeleccionado,
  toggleTodosProductos,
  productosEliminados,
  eliminarProductoDeOrden,
  restaurarProducto,
  productosAgregados,
  actualizarCantidadAgregado,
  eliminarProductoAgregado,
  onAgregarProducto,
  onAbrirModalAsignar,
  notasPorProducto,
  cargandoNotas
}) {
  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Cabecera Activa */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <Boton variante="fantasma" icono={ArrowLeft} onClick={onVolver} className="min-h-12 self-start">Volver a proveedores</Boton>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={handleGuardarCantidades}
            disabled={cantidadesModificadas.size === 0}
            className={`btn min-h-12 ${cantidadesModificadas.size > 0 ? 'bg-primario-600 text-white hover:bg-primario-700' : 'btn-outline opacity-50 cursor-not-allowed'} whitespace-nowrap`}
          >
            <FileText size={16} className="mr-2" /> Guardar Cambios
          </button>
          <button
            onClick={() => handleGenerarPDF(proveedor)}
            className="btn btn-outline min-h-12 whitespace-nowrap"
          >
            <Download size={16} className="mr-2" /> Generar PDF Orden
          </button>
          <button
            onClick={() => onAgregarProducto(proveedor)}
            className="btn btn-outline min-h-12 bg-exito-50 text-exito-700 border-exito-200 hover:bg-exito-100 whitespace-nowrap"
          >
            <Package size={16} className="mr-2" /> + Agregar Producto
          </button>
        </div>
      </div>

      <p className="mb-6 rounded-lg bg-nota-50 p-4 text-sm text-nota-800">
        Para enviar una compra, elegí una semana o «Sin ciclo» en el filtro de arriba.
        Desde ahí podés preparar una orden, revisar su PDF y consultar lo que sigue pendiente de recibir.
      </p>

      {/* Tarjeta Stats Proveedor */}
      <div className="rounded-2xl border border-neutro-200 bg-white p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 p-3 bg-primario-50 rounded-xl">
            <Users className="text-primario-600" size={32} />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-neutro-900 break-words">{proveedor.nombre}</h2>
            <p className="text-neutro-500 mt-1 break-words">{proveedor.contacto || 'Sin contacto'} | ID: {proveedor.id}</p>
            <label className="flex items-start gap-2 text-sm text-neutro-600 mt-3 bg-neutro-50 p-3 rounded-xl">
              <input type="checkbox" className="mt-1 shrink-0" checked={usaDatosProveedor(proveedor.nombre, preferenciasDatosProveedor)} onChange={(e) => togglePreferenciaProveedor(proveedor.nombre, e.target.checked)} />
              Usar códigos/nombres propios del proveedor en PDFs
            </label>
          </div>
        </div>
        <div className="flex bg-neutro-50 p-4 rounded-xl divide-x divide-neutro-200 min-w-[200px]">
          <div className="px-4 text-center">
            <p className="text-sm text-neutro-500 font-medium">Items Faltantes</p>
            <p className="text-2xl font-bold text-neutro-900">{proveedor.total_productos}</p>
          </div>
          <div className="px-4 text-center">
            <p className="text-sm text-neutro-500 font-medium">Total Unidades</p>
            <p className="text-2xl font-bold text-primario-600">{proveedor.total_cantidad}</p>
          </div>
        </div>
      </div>

      {/* Lo que pidieron los clientes, junto y plegado, para leerlo antes de
          empezar a poner cantidades. */}
      <PanelNotasProveedor
        productos={proveedor.productos_faltantes}
        notasPorProducto={notasPorProducto}
        cargando={cargandoNotas}
      />

      {/* Lista de Productos del Proveedor */}
      <PanelSeccion
        titulo="Productos por comprar"
        acciones={
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
            <input type="checkbox" checked={proveedor.productos_faltantes.every(p => productosSeleccionados.has(p.codigo))} onChange={() => toggleTodosProductos(proveedor)} />
            Seleccionar todos para reasignar
          </label>
        }
        cuerpoClassName="p-0"
      >
        <div className="divide-y divide-neutro-100">
          {proveedor.productos_faltantes.filter(p => Number(p.cantidad_faltante) > 0).map((producto, idx) => {
            const pCodigo = producto.codigo || producto.producto_codigo || producto.id || idx
            const cantidadFinal = getCantidadFinal(proveedor.nombre, producto, producto.cantidad_faltante, cantidadesModificadas, cantidadesGuardadas)
            const key = `${proveedor.nombre}-${pCodigo}`
            const tieneModificacion = cantidadesModificadas.has(key) || cantidadesGuardadas.has(key)
            const estaEliminado = productosEliminados.has(key)
            const seleccionado = productosSeleccionados.has(pCodigo)

            return (
              <div key={idx} className={`p-5 hover:bg-neutro-50 transition-colors flex flex-col md:flex-row gap-4 md:items-center ${estaEliminado ? 'bg-peligro-50/50 opacity-60' : tieneModificacion ? 'bg-alerta-50/30' : ''}`}>
                <div className="flex items-start md:items-center w-full md:w-5/12 gap-3">
                  <input type="checkbox" checked={seleccionado} onChange={() => toggleProductoSeleccionado(pCodigo)} className="mt-1 md:mt-0 cursor-pointer w-4 h-4 text-primario-600 rounded" />
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold break-words ${estaEliminado ? 'line-through text-neutro-400' : 'text-neutro-900'}`}>{producto.nombre}</p>
                    <p className="text-sm text-neutro-500 break-words">Código: {pCodigo} {producto.descripcion_factura && `| Nota: ${producto.descripcion_factura}`}</p>
                    <ProcedenciaFaltante producto={producto} />
                    {/* Qué variante pidió el cliente. Solo aparece si la hay. */}
                    {!estaEliminado && (
                      <NotasDelProducto notas={notasPorProducto?.[String(producto.producto_id)]} />
                    )}
                  </div>
                </div>

                <div className="flex w-full md:w-7/12 flex-row items-center justify-between gap-4">
                  <div className="text-center">
                    <p className="text-xs text-neutro-500 uppercase tracking-wider mb-1">Original</p>
                    <span className="font-medium text-neutro-600">{producto.cantidad_faltante}</span>
                  </div>

                  <div className="flex-1 px-4 border-l border-neutro-200">
                    <p className="text-xs text-neutro-500 uppercase tracking-wider mb-1">Pedir Cantidad</p>
                    <input
                      type="number"
                      min="0"
                      value={cantidadFinal === undefined ? '' : cantidadFinal}
                      onChange={(e) => handleCantidadChange(proveedor.nombre, pCodigo, e.target.value)}
                      aria-label={`Cantidad a pedir de ${producto.nombre}`}
                      className="w-full max-w-[120px] min-h-12 px-3 py-2 border border-neutro-300 rounded focus:ring-2 focus:ring-primario-500 outline-none transition-shadow"
                      disabled={estaEliminado}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {estaEliminado ? (
                      <button onClick={() => restaurarProducto(proveedor.nombre, pCodigo)} className="text-xs bg-neutro-200 hover:bg-neutro-300 text-neutro-700 px-3 py-1.5 rounded transition">
                        Restaurar
                      </button>
                    ) : (
                      <button onClick={() => eliminarProductoDeOrden(proveedor.nombre, pCodigo, producto.nombre, producto.cantidad_faltante)} aria-label={`Retirar ${producto.nombre} de la lista`} className="min-h-11 min-w-11 text-neutro-400 hover:text-peligro-600 p-2 rounded transition">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* AGREGADOS MANUALMENTE */}
          {(productosAgregados.get(proveedor.nombre) || []).map((producto, idx) => (
            <div key={`agregado-${idx}`} className="p-5 bg-exito-50/40 hover:bg-exito-50/70 transition-colors flex flex-col md:flex-row gap-4 md:items-center">
              <div className="flex items-center w-full md:w-5/12 gap-3 pl-7">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutro-900 break-words">{producto.nombre} <span className="text-[10px] bg-exito-200 text-exito-800 px-1.5 py-0.5 rounded ml-1 tracking-wider uppercase">Extra</span></p>
                  <p className="text-sm text-neutro-500 break-words">Código: {producto.codigo}</p>
                </div>
              </div>
              <div className="flex w-full md:w-7/12 flex-row items-center justify-between gap-4">
                <div className="text-center opacity-0"><span className="font-medium">0</span></div>
                <div className="flex-1 px-4 border-l border-neutro-200">
                  <p className="text-xs text-neutro-500 uppercase tracking-wider mb-1">Pedir Cantidad</p>
                  <input
                    type="number" min="1" value={producto.cantidad}
                    onChange={(e) => actualizarCantidadAgregado(proveedor.nombre, idx, e.target.value)}
                    aria-label={`Cantidad del producto agregado ${producto.nombre}`}
                    className="w-full max-w-[120px] min-h-12 px-3 py-2 border border-neutro-300 rounded focus:ring-2 focus:ring-primario-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => eliminarProductoAgregado(proveedor.nombre, idx)} aria-label={`Retirar producto agregado ${producto.nombre}`} className="min-h-11 min-w-11 text-neutro-400 hover:text-peligro-600 p-2 rounded transition">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PanelSeccion>

      {/* Floating Action Button para Reasignar si hay seleccionados */}
      {productosSeleccionados.size > 0 && (
        <div className="fixed bottom-5 right-5 left-5 sm:left-auto z-50">
          <button onClick={onAbrirModalAsignar} className="bg-primario-600 text-white shadow-xl w-full sm:w-auto flex items-center justify-center gap-2 text-sm px-5 py-3 rounded-full hover:bg-primario-700 hover:scale-105 transition-all">
            <RefreshCw size={18} />
            <span>Mover {productosSeleccionados.size} a otro proveedor</span>
          </button>
        </div>
      )}
    </div>
  )
}
