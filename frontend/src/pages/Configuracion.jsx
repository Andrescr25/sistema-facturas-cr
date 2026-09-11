import { useState } from 'react'
import { Settings, Building2, Wrench, RefreshCw } from 'lucide-react'
import ToastContainer from '../components/ToastContainer'
import EncabezadoPagina from '../components/ui/EncabezadoPagina'
import Pestanas from '../components/ui/Pestanas'
import Vacio from '../components/ui/Vacio'
import Boton from '../components/ui/Boton'
import FormularioEmpresa from '../components/configuracion/FormularioEmpresa'
import TablaCatalogo from '../components/configuracion/TablaCatalogo'
import ModalElementoCatalogo from '../components/configuracion/ModalElementoCatalogo'
import Mantenimiento from '../components/configuracion/Mantenimiento'
import { CATALOGOS, catalogoPorClave } from '../components/configuracion/catalogos'
import { useConfiguracion } from '../hooks/useConfiguracion'

/**
 * Configuración (rama independencia-alegra).
 *
 * Los datos de la empresa y las listas que usan Facturación y Cobros:
 * impuestos, métodos de pago, plazos y cuentas de dinero. Antes vivían en
 * Alegra; los datos de la empresa, además, solo en el navegador.
 */
export default function Configuracion() {
  const {
    datos, cargando, error, guardando, cargar,
    guardarEmpresa, guardarElemento, cambiarActivo,
    showToast, toasts, removeToast
  } = useConfiguracion()
  const [pestana, setPestana] = useState('empresa')
  const [edicion, setEdicion] = useState(null)

  const pestanas = [
    { clave: 'empresa', texto: 'Empresa', icono: Building2 },
    ...CATALOGOS.map(c => ({
      clave: c.clave,
      texto: c.texto,
      icono: c.icono,
      contador: datos?.[c.datos]?.filter(f => f.activo).length || 0
    })),
    { clave: 'mantenimiento', texto: 'Mantenimiento', icono: Wrench }
  ]
  const catalogo = catalogoPorClave(pestana)

  let contenido
  if (pestana === 'mantenimiento') {
    contenido = <Mantenimiento showToast={showToast} />
  } else if (cargando) {
    contenido = (
      <div className="rounded-2xl border border-neutro-200 bg-white p-8 text-center text-sm text-neutro-500">
        Cargando configuración…
      </div>
    )
  } else if (error) {
    contenido = (
      <Vacio
        icono={Settings}
        titulo="No se pudo cargar la configuración"
        descripcion={error}
        accion={<Boton variante="secundario" onClick={cargar}><RefreshCw size={16} /> Reintentar</Boton>}
      />
    )
  } else if (pestana === 'empresa') {
    contenido = <FormularioEmpresa empresa={datos.empresa} guardando={guardando} onGuardar={guardarEmpresa} />
  } else {
    contenido = (
      <TablaCatalogo
        definicion={catalogo}
        filas={datos[catalogo.datos] || []}
        trabajando={guardando}
        onAgregar={() => setEdicion({ clave: catalogo.clave, fila: null })}
        onEditar={fila => setEdicion({ clave: catalogo.clave, fila })}
        onCambiarActivo={fila => cambiarActivo(catalogo.clave, fila)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <EncabezadoPagina
        titulo="Configuración"
        descripcion="Los datos de la empresa y las listas que usan Facturación y Cobros."
        icono={Settings}
      />
      <Pestanas activa={pestana} onCambiar={setPestana} pestanas={pestanas} />
      {contenido}
      {edicion && (
        <ModalElementoCatalogo
          key={`${edicion.clave}-${edicion.fila?.id ?? 'nuevo'}`}
          definicion={catalogoPorClave(edicion.clave)}
          fila={edicion.fila}
          guardando={guardando}
          onGuardar={valores => guardarElemento(edicion.clave, edicion.fila?.id, valores)}
          onCerrar={() => setEdicion(null)}
        />
      )}
    </div>
  )
}
