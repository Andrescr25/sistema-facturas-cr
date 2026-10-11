import { useNavigate } from 'react-router-dom'
import { DollarSign, AlertCircle, PackageOpen, ArrowRight } from 'lucide-react'
import Pestanas from '../ui/Pestanas'
import EncabezadoPagina from '../ui/EncabezadoPagina'
import Vacio from '../ui/Vacio'
import PasoActual from './PasoActual'
import TarjetaFactura from './TarjetaFactura'

const VACIOS = {
  PENDIENTE_RELACIONAR: {
    titulo: 'No hay facturas pendientes de relacionar',
    descripcion: 'Están todas relacionadas.'
  },
  LISTAS_REVISION: {
    titulo: 'No hay facturas listas para revisar',
    descripcion: 'Aparecen acá cuando quedan relacionadas al 100%.'
  },
  ENVIADAS: {
    titulo: 'Todavía no hay compras registradas',
    descripcion: 'Las que registrés se van guardando en este historial.'
  }
}

/**
 * Las facturas de proveedor, por paso del flujo.
 *
 * El encabezado, las pestañas y el estado vacío ya no se escriben acá: son
 * las piezas compartidas de components/ui/. Lo propio de esta pantalla es
 * qué factura va en qué paso y a dónde lleva tocarla.
 */
export default function ListaFacturas({
  facturas, loading, error, tabActiva, setTabActiva,
  onAbrirRevision
}) {
  const navigate = useNavigate()

  const todasRelacionadas = facturas.length > 0 && facturas.every(f => {
    const total = f.productos?.length || 0
    const listos = f.productos?.filter(p => p.estadoRelacionado === 'RELACIONADO').length || 0
    return total > 0 && listos === total
  })

  const abrir = (factura) => {
    if (tabActiva === 'PENDIENTE_RELACIONAR') {
      navigate(`/relacionar-productos/${factura.id}`)
      return
    }
    onAbrirRevision(factura)
  }

  const irARevisar = (
    <button onClick={() => setTabActiva('LISTAS_REVISION')} className="btn btn-primary flex items-center gap-2">
      Ir a revisar precios <ArrowRight size={16} />
    </button>
  )

  return (
    <div className="mx-auto max-w-5xl">
      <EncabezadoPagina
        titulo="Revisión de Precios"
        descripcion="Mirá cómo cambió el costo y ajustá el precio antes de registrar la compra."
        icono={DollarSign}
      />

      <Pestanas
        activa={tabActiva}
        onCambiar={setTabActiva}
        numerada
        className="mb-4"
        pestanas={[
          { clave: 'PENDIENTE_RELACIONAR', texto: 'Relacionar' },
          { clave: 'LISTAS_REVISION', texto: 'Revisar precios' },
          { clave: 'ENVIADAS', texto: 'Registradas' }
        ]}
      />

      <PasoActual paso={tabActiva} />

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-peligro-200 bg-peligro-50 p-3 font-semibold text-peligro-800">
          <AlertCircle size={18} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <div className="spinner mx-auto mb-3" />
          <p className="text-neutro-500">Cargando facturas…</p>
        </div>
      ) : facturas.length === 0 ? (
        <Vacio
          icono={PackageOpen}
          titulo={VACIOS[tabActiva].titulo}
          descripcion={VACIOS[tabActiva].descripcion}
          accion={tabActiva === 'PENDIENTE_RELACIONAR' ? irARevisar : null}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {facturas.map(factura => (
              <TarjetaFactura
                key={factura.id}
                factura={factura}
                paso={tabActiva}
                onAbrir={abrir}
              />
            ))}
          </div>

          {/* Avanzar de paso cuando ya no queda nada por relacionar. Es una
              acción del flujo, no navegación: para moverse entre pasos están
              las pestañas de arriba. */}
          {tabActiva === 'PENDIENTE_RELACIONAR' && todasRelacionadas && (
            <div className="mt-5 flex justify-end">{irARevisar}</div>
          )}
        </>
      )}
    </div>
  )
}
