import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, User, Calendar, DollarSign, Save, AlertCircle } from 'lucide-react'
import { alegraService } from '../services/alegraService'

export default function RegistrarFaltantes() {
  const { facturaId } = useParams()
  const navigate = useNavigate()

  const [factura, setFactura] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [observacionesAdicionales, setObservacionesAdicionales] = useState('')
  const [tieneObservacionesAdicionales, setTieneObservacionesAdicionales] = useState(false)

  useEffect(() => {
    if (facturaId) {
      loadFactura()
    }
  }, [facturaId])

  const loadFactura = async () => {
    try {
      setLoading(true)
      const response = await alegraService.getFacturaDetalle(facturaId)

      if (response.success) {
        console.log('🔍 DEBUG: Estructura completa de la factura:', response.data);
        console.log('🔍 DEBUG: Items de la factura:', response.data.items);
        console.log('🔍 DEBUG: Primer item:', response.data.items?.[0]);

        // Procesar items para el registro de faltantes
        const facturaConFaltantes = {
          alegra_id: response.data.id,
          numero_factura: response.data.numberTemplate?.number || response.data.numberTemplate?.formattedNumber,
          cliente_nombre: response.data.client?.name,
          fecha_emision: response.data.date,
          total: response.data.total,
          items: response.data.items?.map(item => {
            // DEPURAR: Ver qué llega exactamente
            console.log(`🔍 DEBUG Item procesado:`, {
              id: item.id,
              reference: item.reference,
              name: item.name
            });

            return {
              alegra_id: item.id,
              nombre: item.name,
              descripcion: item.description,
              cantidad: item.quantity,
              precio_unitario: item.price,
              total: item.total,
              referencia: item.reference, // ✅ Esta es la correcta: "011"
              codigo_alegra: item.id,     // ✅ Para referencia: "1117"
              cantidad_faltante: 0,
              tipo_faltante: 'ninguno',
              observaciones: ''
            }
          }) || []
        }
        setFactura(facturaConFaltantes)
      } else {
        setError('Factura no encontrada')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleItemChange = (index, field, value) => {
    setFactura(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  const handleTipoFaltanteChange = (index, tipo) => {
    setFactura(prev => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i === index) {
          const newItem = { ...item, tipo_faltante: tipo }
          if (tipo === 'total') {
            newItem.cantidad_faltante = item.cantidad
          } else if (tipo === 'ninguno') {
            newItem.cantidad_faltante = 0
          }
          return newItem
        }
        return item
      })
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Filtrar solo items con faltantes
    const faltantes = factura.items
      .filter(item => item.tipo_faltante !== 'ninguno' && item.cantidad_faltante > 0)
      .map(item => {
        // CORREGIDO: Usar SIEMPRE la referencia primero
        const item_id = item.referencia || item.codigo_alegra; // ✅ Priorizar referencia

        console.log(`🔍 DEBUG Faltante generado:`, {
          nombre: item.nombre,
          referencia: item.referencia,
          codigo_alegra: item.codigo_alegra,
          item_id_final: item_id
        });

        return {
          item_id: item_id, // ✅ CORREGIDO: Ahora será "011" en lugar de "1117"
          nombre_producto: item.nombre,
          cantidad_faltante: parseInt(item.cantidad_faltante),
          tipo_faltante: item.tipo_faltante,
          observaciones: item.observaciones
        }
      })

    console.log('📝 DEBUG: Faltantes a enviar:', faltantes);

    if (faltantes.length === 0) {
      setError('Debes marcar al menos un producto como faltante')
      return
    }

    try {
      setSaving(true)
      setError(null)

      const result = await alegraService.registrarFaltantes(facturaId, faltantes, 'Usuario', observacionesAdicionales)

      if (result.success) {
        setSuccess(true)
        setTimeout(() => {
          navigate('/buscar-factura')
        }, 2000)
      } else {
        setError(result.message || 'Error guardando faltantes')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: 'CRC'
    }).format(amount)
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-8">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando factura...</p>
        </div>
      </div>
    )
  }

  if (error && !factura) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card bg-red-50 border-red-200">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <p className="text-red-700">Error: {error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="card bg-green-50 border-green-200 text-center py-8">
          <div className="text-green-600 mb-4">
            <Package size={48} className="mx-auto" />
          </div>
          <h2 className="text-2xl font-bold text-green-900 mb-2">¡Faltantes Registrados!</h2>
          <p className="text-green-700">Redirigiendo a búsqueda de facturas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center mb-8">
        <button
          onClick={() => navigate('/buscar-factura')}
          className="btn btn-outline mr-4"
        >
          <ArrowLeft size={16} className="mr-2" />
          Volver
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Registrar Faltantes</h1>
          <p className="text-gray-600 mt-1">Marca los productos que no pudieron ser entregados</p>
        </div>
      </div>

      {/* Información de la factura */}
      {factura && (
        <div className="card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center">
              <Package className="text-blue-600 mr-2" size={20} />
              <div>
                <p className="text-sm text-gray-600">Factura</p>
                <p className="font-semibold">#{factura.numero_factura}</p>
              </div>
            </div>

            <div className="flex items-center">
              <User className="text-gray-400 mr-2" size={16} />
              <div>
                <p className="text-sm text-gray-600">Cliente</p>
                <p className="font-semibold">{factura.cliente_nombre}</p>
              </div>
            </div>

            <div className="flex items-center">
              <Calendar className="text-gray-400 mr-2" size={16} />
              <div>
                <p className="text-sm text-gray-600">Fecha</p>
                <p className="font-semibold">{new Date(factura.fecha_emision).toLocaleDateString('es-CR')}</p>
              </div>
            </div>

            <div className="flex items-center">
              <DollarSign className="text-gray-400 mr-2" size={16} />
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="font-semibold">{formatCurrency(factura.total)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card bg-red-50 border-red-200 mb-8">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Formulario de productos */}
      {factura && (
        <form onSubmit={handleSubmit}>
          <div className="card mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Productos de la Factura ({factura.items?.length || 0})
            </h3>

            <div className="space-y-4">
              {factura.items?.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                    {/* Producto Info */}
                    <div className="lg:col-span-4">
                      <h4 className="font-medium text-gray-900">{item.nombre}</h4>
                      <p className="text-sm text-gray-600">
                        Cantidad: {item.cantidad} • {formatCurrency(item.precio_unitario)} c/u
                      </p>
                      {/* DEBUG: Mostrar referencias */}
                      <p className="text-xs text-blue-600">
                        Ref: {item.referencia} | ID: {item.codigo_alegra}
                      </p>
                    </div>

                    {/* Tipo de Faltante */}
                    <div className="lg:col-span-2">
                      <label className="label">Estado</label>
                      <select
                        value={item.tipo_faltante}
                        onChange={(e) => handleTipoFaltanteChange(index, e.target.value)}
                        className="input"
                      >
                        <option value="ninguno">Sin faltante</option>
                        <option value="parcial">Faltante parcial</option>
                        <option value="total">Faltante total</option>
                      </select>
                    </div>

                    {/* Cantidad Faltante */}
                    <div className="lg:col-span-2">
                      <label className="label">Cantidad faltante</label>
                      <input
                        type="number"
                        min="0"
                        max={item.cantidad}
                        value={item.cantidad_faltante}
                        onChange={(e) => handleItemChange(index, 'cantidad_faltante', parseInt(e.target.value) || 0)}
                        disabled={item.tipo_faltante === 'ninguno'}
                        className="input"
                      />
                    </div>

                    {/* Observaciones */}
                    <div className="lg:col-span-4">
                      <label className="label">Observaciones</label>
                      <input
                        type="text"
                        value={item.observaciones}
                        onChange={(e) => handleItemChange(index, 'observaciones', e.target.value)}
                        disabled={item.tipo_faltante === 'ninguno'}
                        placeholder="Motivo del faltante..."
                        className="input"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* NUEVO: Observaciones Adicionales - DESPUÉS de todos los productos */}
          <div className="card mb-8">
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="observaciones-adicionales"
                checked={tieneObservacionesAdicionales}
                onChange={(e) => setTieneObservacionesAdicionales(e.target.checked)}
                className="mr-3"
              />
              <label htmlFor="observaciones-adicionales" className="font-medium text-gray-900">
                Esta factura lleva faltantes adicionales?
              </label>
            </div>

            {tieneObservacionesAdicionales && (
              <textarea
                value={observacionesAdicionales}
                onChange={(e) => setObservacionesAdicionales(e.target.value)}
                className="input"
                rows="3"
              />
            )}
          </div>

          {/* Botones */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/buscar-factura')}
              className="btn btn-outline"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? (
                <>
                  <div className="spinner mr-2"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2" size={16} />
                  Guardar Faltantes
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}