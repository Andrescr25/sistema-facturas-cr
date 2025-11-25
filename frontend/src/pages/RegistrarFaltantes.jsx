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
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(max-width: 768px)')
    const updateMatches = () => setIsMobile(mediaQuery.matches)
    updateMatches()
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateMatches)
    } else {
      mediaQuery.addListener(updateMatches)
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', updateMatches)
      } else {
        mediaQuery.removeListener(updateMatches)
      }
    }
  }, [])

  const normalizeReferenceValue = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' || typeof value === 'bigint') return value.toString()
    if (typeof value === 'object') {
      if (typeof value.reference === 'string' && value.reference.trim()) return value.reference.trim()
      if (typeof value.code === 'string' && value.code.trim()) return value.code.trim()
      if (typeof value.value === 'string' && value.value.trim()) return value.value.trim()
    }
    return ''
  }

  const normalizeFacturaItem = (item) => {
    const nombre = item?.nombre || item?.name || 'Producto sin nombre'
    const descripcion = item?.descripcion || item?.description || ''
    const cantidad = Number(item?.cantidad ?? item?.quantity ?? 0)
    const precioUnitario = Number(item?.precio_unitario ?? item?.price ?? 0)
    const total = Number(item?.total ?? cantidad * precioUnitario)
    const referencia = normalizeReferenceValue(item?.referencia ?? item?.reference ?? item?.codigo_producto ?? item?.codigo_alegra ?? '')
    const codigoAlegra =
      (item?.codigo_alegra ?? item?.alegra_id ?? item?.id ?? referencia)?.toString() || referencia

    return {
      alegra_id: codigoAlegra,
      nombre,
      descripcion,
      cantidad,
      precio_unitario: precioUnitario,
      total,
      referencia,
      referencia_tipo: item?.referencia_tipo || item?.reference_type || null,
      codigo_alegra: codigoAlegra,
      cantidad_faltante: 0,
      tipo_faltante: 'ninguno',
      observaciones: ''
    }
  }

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
          items: response.data.items?.map(normalizeFacturaItem) || []
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
        const referenciaNormalizada = normalizeReferenceValue(item.referencia) || ''
        const codigoAlegra = item.codigo_alegra ? item.codigo_alegra.toString() : ''
        // Priorizar referencia limpia y caer al ID de Alegra
        const item_id = (referenciaNormalizada || codigoAlegra || item.alegra_id || '').toString()

        console.log(`🔍 DEBUG Faltante generado:`, {
          nombre: item.nombre,
          referencia: referenciaNormalizada,
          codigo_alegra: codigoAlegra,
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
    <div className="max-w-5xl mx-auto px-4 pb-6 md:px-0">
      <div className="flex flex-col gap-4 md:flex-row md:items-center mb-6">
        <button
          onClick={() => navigate('/buscar-factura')}
          className="btn btn-outline w-full md:w-auto"
        >
          <ArrowLeft size={16} className="mr-2" />
          Volver
        </button>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Registrar Faltantes</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">Selecciona los productos y cantidades faltantes. Toda la interfaz se adapta automáticamente para pantallas pequeñas.</p>
        </div>
      </div>

      {/* Información de la factura */}
      {factura && (
        <div className="card mb-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <InfoBadge icon={<Package className="text-blue-600" size={20} />} label="Factura" value={`#${factura.numero_factura}`} />
            <InfoBadge icon={<User className="text-gray-400" size={18} />} label="Cliente" value={factura.cliente_nombre} />
            <InfoBadge icon={<Calendar className="text-gray-400" size={18} />} label="Fecha" value={new Date(factura.fecha_emision).toLocaleDateString('es-CR')} />
            <InfoBadge icon={<DollarSign className="text-gray-400" size={18} />} label="Total" value={formatCurrency(factura.total)} />
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
          <div className="card mb-6">
            <div className="flex flex-col gap-2 mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Productos de la factura</h3>
              <p className="text-sm text-gray-500">Total de ítems: {factura.items?.length || 0}</p>
            </div>

            <div className="space-y-4">
              {factura.items?.map((item, index) => (
                <ProductCard
                  key={`${item.codigo_alegra}-${index}`}
                  item={item}
                  index={index}
                  isMobile={isMobile}
                  formatCurrency={formatCurrency}
                  handleTipoFaltanteChange={handleTipoFaltanteChange}
                  handleItemChange={handleItemChange}
                />
              ))}
            </div>
          </div>

          {/* NUEVO: Observaciones Adicionales - DESPUÉS de todos los productos */}
          <div className="card mb-6">
            <div className="flex items-center gap-3 mb-3">
              <input
                type="checkbox"
                id="observaciones-adicionales"
                checked={tieneObservacionesAdicionales}
                onChange={(e) => setTieneObservacionesAdicionales(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
              <label htmlFor="observaciones-adicionales" className="font-medium text-gray-900">
                Esta factura lleva faltantes adicionales?
              </label>
            </div>

            {tieneObservacionesAdicionales && (
              <div className="space-y-2">
                <p className="text-sm text-gray-500">Detalla cualquier nota para el equipo de revisión.</p>
                <textarea
                  value={observacionesAdicionales}
                  onChange={(e) => setObservacionesAdicionales(e.target.value)}
                  className={`input w-full resize-none ${isMobile ? 'text-base h-28' : 'text-sm'}`}
                  rows={isMobile ? 4 : 3}
                  maxLength={600}
                />
              </div>
            )}
          </div>

          {/* Botones */}
          <div className={`${isMobile ? 'sticky bottom-0 left-0 right-0 z-10 bg-white/95 border-t border-gray-200 px-4 py-4 flex flex-col gap-3 shadow-[-4px_-4px_12px_rgba(15,23,42,0.06)]' : 'flex justify-end gap-4 mt-6'}`}>
            <button
              type="button"
              onClick={() => navigate('/buscar-factura')}
              className={`btn btn-outline ${isMobile ? 'w-full h-12 text-base' : ''}`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`btn btn-primary ${isMobile ? 'w-full h-12 text-base flex items-center justify-center' : ''}`}
            >
              {saving ? (
                <>
                  <div className="spinner mr-2"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2" size={16} />
                  Guardar faltantes
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function InfoBadge({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 flex items-center gap-3 bg-slate-50">
      {icon}
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900 break-words">{value}</p>
      </div>
    </div>
  )
}

function ProductCard({ item, index, isMobile, formatCurrency, handleTipoFaltanteChange, handleItemChange }) {
  const inputClass = `input w-full ${isMobile ? 'text-base h-12' : 'text-sm'}`

  return (
    <div className="rounded-2xl border border-gray-200 p-4 shadow-sm bg-white">
      <div className="flex flex-col gap-3 md:grid md:grid-cols-12 md:items-center">
        <div className="md:col-span-5 space-y-1">
          <p className="font-semibold text-gray-900 text-base">{item.nombre}</p>
          <p className="text-sm text-gray-600">
            Cantidad solicitada: <span className="font-medium">{item.cantidad}</span> • {formatCurrency(item.precio_unitario)} c/u
          </p>
          <p className="text-xs text-indigo-600">
            Ref: {item.referencia || 'N/A'} • ID Alegra: {item.codigo_alegra}
          </p>
        </div>

        <div className="md:col-span-2">
          <label className="label text-xs text-gray-500">Estado</label>
          <select
            value={item.tipo_faltante}
            onChange={(e) => handleTipoFaltanteChange(index, e.target.value)}
            className={inputClass}
          >
            <option value="ninguno">Sin faltante</option>
            <option value="parcial">Faltante parcial</option>
            <option value="total">Faltante total</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="label text-xs text-gray-500">Cantidad faltante</label>
          <input
            type="number"
            min="0"
            max={item.cantidad}
            inputMode="numeric"
            enterKeyHint="done"
            value={item.cantidad_faltante}
            onChange={(e) => handleItemChange(index, 'cantidad_faltante', parseInt(e.target.value) || 0)}
            disabled={item.tipo_faltante === 'ninguno'}
            className={inputClass}
          />
        </div>

        <div className="md:col-span-3">
          <label className="label text-xs text-gray-500">Observaciones</label>
          <textarea
            value={item.observaciones}
            onChange={(e) => handleItemChange(index, 'observaciones', e.target.value)}
            disabled={item.tipo_faltante === 'ninguno'}
            placeholder="Motivo del faltante..."
            className={`${inputClass} resize-none ${isMobile ? 'h-24' : 'h-20'}`}
            maxLength={200}
          />
        </div>
      </div>
    </div>
  )
}