import { useState } from 'react'
import { Settings, Building2, Wrench, RefreshCw, MessageCircle, ShieldCheck } from 'lucide-react'
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
import { useDialog } from '../hooks/useDialog'
import ConfirmModal from '../components/ConfirmModal'
import SeccionWhatsApp from '../components/configuracion/SeccionWhatsApp'
import SeccionAvisosPedidos from '../components/configuracion/SeccionAvisosPedidos'
import ConfiguracionHacienda from '../integrations/hacienda/ConfiguracionHacienda'

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
  const { confirm, dialogProps } = useDialog()
  const confirmarDesvincular = (mensaje) =>
    confirm(mensaje, { title: '¿Desvincular WhatsApp?', confirmLabel: 'Desvincular', variant: 'danger' })

  const pestanas = [
    { clave: 'empresa', texto: 'Empresa', icono: Building2 },
    { clave: 'hacienda', texto: 'Hacienda', icono: ShieldCheck },
    ...CATALOGOS.map(c => ({
      clave: c.clave,
      texto: c.texto,
      icono: c.icono,
      contador: datos?.[c.datos]?.filter(f => f.activo).length || 0
    })),
    // Vino de main (2026-09-29): el WhatsApp del sistema y los avisos de
    // pedidos del portal. En esta rama aislada no sale ningún mensaje.
    { clave: 'whatsapp', texto: 'WhatsApp', icono: MessageCircle },
    { clave: 'mantenimiento', texto: 'Mantenimiento', icono: Wrench }
  ]
  const catalogo = catalogoPorClave(pestana)

  let contenido
  if (pestana === 'hacienda') {
    contenido = <ConfiguracionHacienda />
  } else if (pestana === 'mantenimiento') {
    contenido = <Mantenimiento showToast={showToast} />
  } else if (pestana === 'whatsapp') {
    contenido = (
      <div className="space-y-6">
        <SeccionWhatsApp confirmar={confirmarDesvincular} />
        <SeccionAvisosPedidos />
      </div>
    )
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
      <ConfirmModal {...dialogProps} />
    </div>
  )
}
