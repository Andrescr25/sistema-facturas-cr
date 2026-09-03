import { useEffect, useState } from 'react'
import { Plus, XCircle, Building2, Package, FileText, AlertCircle, Eye, Trash2, Search, Scale } from 'lucide-react'
import { FORMAS_FARMACEUTICAS } from '../../utils/formasFarmaceuticas'
import { useModal } from '../../hooks/useModal'
import api from '../../services/api'

/**
 * Formulario completo para crear un producto nuevo en Alegra a partir de un
 * producto del proveedor, con detección de medicamento (CABYS/categoría) y
 * los campos obligatorios de forma farmacéutica/registro sanitario.
 * Extraído de RelacionarProductos.jsx.
 *
 * EL PRECIO DE VENTA NO SE PRELLENA CON EL COSTO
 * Los dos campos —precio y costo— venían con el mismo número: el
 * `precioUnitario` de la factura del proveedor. Quien no los cambiaba creaba
 * un producto que se vende al costo, y 21 del catálogo quedaron así (CODO
 * SANITARIO ₡792,04 contra ₡792,04; BATERÍA MAXELL ₡703,54 contra ₡703,54).
 *
 * Peor: ese número tampoco era el costo. `precioUnitario` viene sin IVA, sin
 * el descuento de la línea y sin el factor de conversión. En la BOTA BELLOTA
 * PVC 27 proponía ₡4.685 cuando el costo real por unidad es ₡4.764,65 — o
 * sea que aceptar el prellenado creaba un producto que se vende POR DEBAJO
 * del costo.
 *
 * Ahora los dos salen del servidor: el costo con la misma fórmula que escribe
 * inventory.unitCost en Alegra, y el precio del motor de precios (margen real
 * por categoría). Se recalculan al cambiar de categoría, porque el margen
 * meta depende de ella. Si el motor no tiene una sugerencia confiable el
 * campo queda vacío y hay que escribirlo: mejor eso que inventar un número.
 */
export default function ModalCrearProducto({
  productoSeleccionado,
  categorias,
  categoriaSeleccionada,
  onCategoriaChange,
  codigoCabys,
  onCabysChange,
  mostrarCamposMedicamento,
  categoriaMedicamentoSeleccionada,
  onEsMedicamentoChange,
  formaFarmaceutica,
  setFormaFarmaceutica,
  registroSanitario,
  setRegistroSanitario,
  imagenPreview,
  onImagenChange,
  onRemoverImagen,
  onBuscarSugerenciaImagen,
  onSubmit,
  onCerrar
}) {
  useModal(onCerrar)
  // Si el proveedor factura este producto en una unidad distinta a como se
  // vende (ej: factura 25 sueltos, se vende como 1 paquete de 25), declarar
  // el factor acá mismo — evita que "Cantidad Inicial" se mande a Alegra en
  // la unidad equivocada, y lo guarda para que las próximas facturas de este
  // proveedor ya vengan convertidas solas.
  // El costo real y el precio sugerido los calcula el servidor; hasta que
  // lleguen, los campos quedan vacíos en vez de mostrar un número provisional
  // que alguien podría aceptar sin mirar.
  const [sugerencia, setSugerencia] = useState(null)
  const [cargandoSugerencia, setCargandoSugerencia] = useState(true)

  useEffect(() => {
    let vivo = true
    setCargandoSugerencia(true)
    api.get(`/productos-revision/${productoSeleccionado.id}/precio-sugerido`, {
      params: { categoria: categoriaSeleccionada?.nombre || categoriaSeleccionada || '' }
    })
      .then(r => { if (vivo) setSugerencia(r.data?.data || null) })
      .catch(() => { if (vivo) setSugerencia(null) })
      .finally(() => { if (vivo) setCargandoSugerencia(false) })
    return () => { vivo = false }
  }, [productoSeleccionado.id, categoriaSeleccionada])

  const cantidadProveedor = parseFloat(productoSeleccionado.cantidad) || 0
  const [cantidadInicial, setCantidadInicial] = useState(cantidadProveedor || 0)
  const [mostrarFactor, setMostrarFactor] = useState(false)
  const [cantidadPropia, setCantidadPropia] = useState('')

  const factorCalculado = mostrarFactor && cantidadPropia !== '' && cantidadProveedor > 0
    ? parseFloat(cantidadPropia) / cantidadProveedor
    : null

  const handleCantidadPropiaChange = (e) => {
    const val = e.target.value
    setCantidadPropia(val)
    if (val !== '') setCantidadInicial(val)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-neutro-900 flex items-center">
              <Plus className="mr-2 text-exito-600" size={24} />
              Crear Producto Nuevo en Alegra
            </h3>
            <button
              onClick={onCerrar}
              className="text-neutro-500 hover:text-neutro-700"
            >
              <XCircle size={24} />
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="p-6">
          {/* Info del producto proveedor */}
          <div className="bg-gradient-to-r from-primario-50 to-primario-100 rounded-lg p-4 mb-6 border border-primario-200">
            <h4 className="font-semibold text-primario-900 mb-3 flex items-center">
              <Building2 className="mr-2" size={18} />
              Datos del Proveedor (referencia)
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-primario-600 font-medium">Descripción:</span>
                <p className="text-primario-900 font-semibold">{productoSeleccionado.descripcion}</p>
              </div>
              <div>
                <span className="text-primario-600 font-medium">Código:</span>
                <p className="text-primario-900 font-mono">{productoSeleccionado.codigoProveedor}</p>
              </div>
              <div>
                <span className="text-primario-600 font-medium">Precio:</span>
                <p className="text-primario-900 font-bold">₡{productoSeleccionado.precioUnitario?.toLocaleString('es-CR')}</p>
              </div>
              <div>
                <span className="text-primario-600 font-medium">Cantidad:</span>
                <p className="text-primario-900">{productoSeleccionado.cantidad} {productoSeleccionado.unidadMedida}</p>
              </div>
            </div>
          </div>

          {/* Campo oculto con ID del producto */}
          <input type="hidden" name="productoId" value={productoSeleccionado.id} />
          <input type="hidden" name="esMedicamento" value={mostrarCamposMedicamento ? 'true' : 'false'} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Columna izquierda */}
            <div className="space-y-4">
              {/* Nombre */}
              <div>
                <label className="label flex items-center">
                  <Package className="mr-1" size={16} />
                  Nombre del producto *
                </label>
                <input
                  type="text"
                  name="nombre"
                  defaultValue={productoSeleccionado.descripcion}
                  required
                  maxLength="150"
                  className="input"
                  placeholder="Nombre que aparecerá en Alegra"
                />
                <p className="text-xs text-neutro-500 mt-1">Máximo 150 caracteres</p>
              </div>

              {/* La descripción se quitó del formulario: venía precargada con
                  el mismo texto que el nombre y el backend ya cae al nombre
                  cuando no llega (productos-revision.service.js:723), así que
                  solo agregaba un campo que había que saltarse. */}

              {/* Referencia y Unidad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Código/Referencia</label>
                  <input
                    type="text"
                    name="referencia"
                    defaultValue={productoSeleccionado.codigoProveedor}
                    className="input"
                    placeholder="Código interno"
                  />
                </div>

                <div>
                  <label className="label">Unidad</label>
                  <select name="unidad" className="input" defaultValue="unit">
                    <option value="unit">Unidad</option>
                    <option value="meter">Metro</option>
                    <option value="kilogram">Kilogramo</option>
                    <option value="gram">Gramo</option>
                    <option value="liter">Litro</option>
                    <option value="hour">Hora</option>
                    <option value="day">Día</option>
                    <option value="service">Servicio</option>
                  </select>
                </div>
              </div>

              {/* Categoría */}
              <div>
                <label className="label">Categoría *</label>
                {categorias.length === 0 ? (
                  <>
                    <select name="categoria" className="input border-peligro-300" disabled>
                      <option value="">Sin categorías disponibles</option>
                    </select>
                    <p className="text-xs text-peligro-600 mt-1 flex items-center">
                      <AlertCircle size={12} className="mr-1" />
                      No hay categorías. Ve a Alegra → Configuración → Categorías de Productos para crear una.
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      name="categoria"
                      className="input"
                      value={categoriaSeleccionada}
                      onChange={onCategoriaChange}
                      required
                    >
                      <option value="">Selecciona una categoría</option>
                      {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name} {cat.description && `- ${cat.description}`}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-neutro-500 mt-1">Categoría del producto en Alegra</p>
                  </>
                )}
              </div>
            </div>

            {/* Columna derecha */}
            <div className="space-y-4">
              {/* Precios */}
              <div className="grid grid-cols-2 gap-3">
                {/* El `key` que cambia con el valor es a propósito: React no
                    repinta un defaultValue: sin él, cambiar de categoría
                    dejaba en pantalla el precio de la categoría anterior. */}
                <div>
                  <label className="label">Precio de Venta *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutro-500">₡</span>
                    <input
                      type="number"
                      name="precio"
                      key={`precio-${sugerencia?.precioSugerido ?? 'vacio'}`}
                      defaultValue={sugerencia?.precioSugerido ?? ''}
                      step="0.01"
                      min="0"
                      required
                      className="input pl-8"
                      placeholder={cargandoSugerencia ? 'Calculando…' : '0.00'}
                    />
                  </div>
                  <p className="text-xs text-neutro-500 mt-1">
                    {sugerencia?.precioSugerido != null
                      ? `Sin IVA · sugerido al ${sugerencia.margenObjetivo}% de margen (${sugerencia.categoria})`
                      : 'Precio sin IVA'}
                  </p>
                </div>

                <div>
                  <label className="label">Costo Unitario *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutro-500">₡</span>
                    <input
                      type="number"
                      name="costo"
                      key={`costo-${sugerencia?.costoUnitario ?? 'vacio'}`}
                      defaultValue={sugerencia?.costoUnitario ?? ''}
                      step="0.01"
                      min="0"
                      required
                      className="input pl-8"
                      placeholder={cargandoSugerencia ? 'Calculando…' : '0.00'}
                    />
                  </div>
                  <p className="text-xs text-neutro-500 mt-1">
                    {sugerencia
                      ? `Con IVA${sugerencia.descuentoPorcentaje > 0 ? `, con el ${Math.round(sugerencia.descuentoPorcentaje)}% de descuento` : ''}${sugerencia.factor !== 1 ? `, ÷ factor ${sugerencia.factor}` : ''}`
                      : 'Costo de compra'}
                  </p>
                </div>
              </div>

              {/* Cantidad inicial */}
              <div>
                <label className="label">Cantidad Inicial (opcional)</label>
                <input
                  type="number"
                  name="cantidadInicial"
                  value={cantidadInicial}
                  onChange={(e) => setCantidadInicial(e.target.value)}
                  step="0.01"
                  min="0"
                  className="input"
                  placeholder="0"
                />
                <p className="text-xs text-neutro-500 mt-1">Inventario inicial en Alegra</p>
              </div>

              {/* Factor de conversión */}
              <div className="bg-alerta-50 border border-alerta-200 rounded-lg p-3">
                <label className="flex items-center cursor-pointer text-sm font-semibold text-alerta-900">
                  <input
                    type="checkbox"
                    checked={mostrarFactor}
                    onChange={(e) => setMostrarFactor(e.target.checked)}
                    className="mr-2 w-4 h-4"
                  />
                  <Scale size={14} className="mr-1.5 shrink-0" />
                  El proveedor lo vende distinto a como yo lo vendo
                </label>
                {mostrarFactor && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-alerta-700 block mb-1">Proveedor factura:</span>
                        <p className="font-bold text-alerta-900">{cantidadProveedor}</p>
                      </div>
                      <div>
                        <label className="text-alerta-700 block mb-1">Yo lo cuento como:</label>
                        <input
                          type="number"
                          value={cantidadPropia}
                          onChange={handleCantidadPropiaChange}
                          step="0.01"
                          min="0"
                          className="input"
                          placeholder="Ej: 1"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-alerta-700 mt-2">
                      Se guarda para que las próximas facturas de este proveedor ya vengan convertidas solas.
                    </p>
                  </>
                )}
                {factorCalculado !== null && (
                  <input type="hidden" name="factorConversion" value={factorCalculado} />
                )}
              </div>

              {/* Código CABYS - Editable */}
              <div className="bg-gradient-to-r from-nota-50 to-nota-100 border-2 border-nota-200 rounded-lg p-4">
                <label className="label flex items-center text-nota-900">
                  <FileText className="mr-2 text-nota-600" size={18} />
                  Código CABYS *
                </label>
                <input
                  type="text"
                  name="codigoCabys"
                  value={codigoCabys}
                  onChange={onCabysChange}
                  required
                  maxLength="13"
                  className="input border-nota-300 bg-white font-mono"
                  placeholder="Ej: 2413900000100"
                />
                <div className="mt-2 text-xs text-nota-700 space-y-1">
                  <p className="flex items-start">
                    <AlertCircle size={14} className="mr-1 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Código original:</strong> <span className="font-mono">{productoSeleccionado.codigoCabys}</span>
                    </span>
                  </p>
                </div>
              </div>

              {/* Checkbox: ¿Es Medicamento? */}
              <div className="bg-primario-50 border-2 border-primario-200 rounded-lg p-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mostrarCamposMedicamento}
                    onChange={onEsMedicamentoChange}
                    className="w-5 h-5 text-primario-600 rounded border-neutro-300 focus:ring-primario-500 mr-3"
                  />
                  <span className="font-semibold text-primario-900 text-lg">
                    ¿Es medicamento? 💊
                  </span>
                </label>
                <p className="text-xs text-primario-700 mt-2 ml-8">
                  Marcala solo si el producto es un medicamento humano: activa los campos que exige la normativa de Costa Rica.
                  {categoriaMedicamentoSeleccionada && ' La categoría elegida sugiere que lo es, pero podés desmarcarla.'}
                </p>
              </div>

              {/* Campos de Medicamento - Solo si el checkbox está marcado */}
              {mostrarCamposMedicamento && (
                <div className="space-y-4 border-2 border-alerta-300 rounded-lg p-4 bg-alerta-50">
                  <div className="flex items-center text-alerta-800 font-semibold mb-3">
                    <AlertCircle className="mr-2" size={20} />
                    Información Farmacéutica (Obligatoria)
                  </div>

                  {/* Forma Farmacéutica */}
                  <div>
                    <label className="label text-alerta-900">
                      Forma Farmacéutica *
                    </label>
                    <select
                      name="formaFarmaceutica"
                      className="input border-alerta-400 bg-white"
                      value={formaFarmaceutica}
                      onChange={(e) => setFormaFarmaceutica(e.target.value)}
                      required={mostrarCamposMedicamento}
                    >
                      <option value="">Seleccione forma farmacéutica</option>
                      {FORMAS_FARMACEUTICAS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.value} ({f.id})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-alerta-700 mt-1">
                      Sugerido automáticamente según descripción. Verifica que sea correcto.
                    </p>
                  </div>

                  {/* Registro Sanitario */}
                  <div>
                    <label className="label text-alerta-900">
                      Registro Sanitario *
                    </label>
                    <input
                      type="text"
                      name="registroSanitario"
                      value={registroSanitario}
                      onChange={(e) => setRegistroSanitario(e.target.value)}
                      className="input border-alerta-400 bg-white"
                      placeholder="Ej: M-12345-2024"
                      required={mostrarCamposMedicamento}
                    />
                    <p className="text-xs text-alerta-700 mt-1">
                      Número de registro sanitario emitido por el Ministerio de Salud de Costa Rica
                    </p>
                  </div>

                  <div className="bg-alerta-100 border border-alerta-400 rounded p-3 text-xs text-alerta-800">
                    <p className="font-semibold mb-1">📋 Normativa Costa Rica 2025:</p>
                    <p>Desde el 1 de enero de 2025 es obligatorio incluir la forma farmacéutica y registro sanitario para medicamentos humanos.</p>
                  </div>
                </div>
              )}

              {/* Imagen del producto */}
              <div>
                <label className="label flex items-center">
                  <Eye className="mr-1" size={16} />
                  Imagen del Producto (opcional)
                </label>
                <input
                  type="file"
                  id="imagenProducto"
                  name="imagen"
                  accept="image/jpeg,image/png,image/gif"
                  onChange={onImagenChange}
                  className="input file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primario-50 file:text-primario-700 hover:file:bg-primario-100"
                />
                <p className="text-xs text-neutro-500 mt-1">JPG, PNG o GIF - Máximo 2MB</p>
                <button
                  type="button"
                  onClick={onBuscarSugerenciaImagen}
                  className="btn btn-outline text-sm mt-2 flex items-center"
                >
                  <Search size={14} className="mr-1.5" />
                  Buscar sugerencia de imagen
                </button>
              </div>

              {/* Preview de imagen */}
              {imagenPreview && (
                <div className="border-2 border-dashed border-neutro-300 rounded-lg p-4">
                  <p className="text-sm font-medium text-neutro-700 mb-2">Preview:</p>
                  <div className="flex items-center justify-between">
                    <img
                      src={imagenPreview}
                      alt="Preview"
                      className="max-w-[150px] max-h-[150px] rounded-lg border border-neutro-200 object-contain"
                    />
                    <button
                      type="button"
                      onClick={onRemoverImagen}
                      className="btn btn-outline text-peligro-600 hover:bg-peligro-50 text-sm"
                    >
                      <Trash2 size={16} className="mr-1" />
                      Remover
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info de ayuda */}
          <div className="mt-6 bg-primario-50 border border-primario-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="text-primario-600 mr-3 flex-shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-primario-800">
                <p className="font-semibold mb-1">💡 Tip:</p>
                <p>Los datos se han pre-cargado desde el producto del proveedor. Puedes editarlos antes de crear el producto en Alegra. El producto se creará y se relacionará automáticamente con esta factura.</p>
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 mt-6 pt-6 border-t">
            <button
              type="submit"
              className="btn btn-primary flex-1 flex items-center justify-center"
              disabled={categorias.length === 0}
            >
              <Plus size={20} className="mr-2" />
              Crear Producto en Alegra
            </button>
            <button
              type="button"
              onClick={onCerrar}
              className="btn btn-outline flex-1"
            >
              Cancelar
            </button>
          </div>
          {categorias.length === 0 && (
            <p className="text-center text-sm text-peligro-600 mt-3">
              ⚠️ Debes tener al menos una categoría en Alegra para crear productos
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
