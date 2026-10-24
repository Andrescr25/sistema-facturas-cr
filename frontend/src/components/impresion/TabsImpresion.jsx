import { Inbox, CheckCircle } from 'lucide-react'
import Pestanas from '../ui/Pestanas'

/**
 * Las pestañas del Centro de Impresión. La mecánica vive en ui/Pestanas, que
 * salió de este mismo archivo cuando Revisión de Precios necesitó lo mismo.
 */
export default function TabsImpresion({ activeTab, setActiveTab, countPendientes, countProcesadas }) {
  return (
    <Pestanas
      activa={activeTab}
      onCambiar={setActiveTab}
      className="max-w-md"
      pestanas={[
        { clave: 'pendientes', texto: 'Por Impresión', icono: Inbox, contador: countPendientes },
        { clave: 'procesadas', texto: 'Historial 48 h', icono: CheckCircle, contador: countProcesadas }
      ]}
    />
  )
}
