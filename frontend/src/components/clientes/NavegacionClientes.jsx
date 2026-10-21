import NavegacionSecciones from '../ui/NavegacionSecciones'
import { Contact, Map, ClipboardList, ShieldCheck } from 'lucide-react'

const SECCIONES = [
  { id: 'fichas', titulo: 'Clientes', detalle: 'Fichas y contacto', icono: Contact },
  { id: 'rutas', titulo: 'Rutas', detalle: 'Clientes y próxima visita', icono: Map },
  { id: 'pedidos', titulo: 'Pedidos', detalle: 'Revisión y facturación', icono: ClipboardList },
  { id: 'clientes', titulo: 'Accesos', detalle: 'Portal y tablets', icono: ShieldCheck }
]

/** Los accesos se administran juntos; las fichas y la operación quedan a la vista. */
export default function NavegacionClientes({ vista, onCambiar, pendientes = 0 }) {
  return <NavegacionSecciones etiqueta="Áreas de Clientes" seleccion={vista === 'dispositivos' ? 'clientes' : vista} onCambiar={onCambiar}
    secciones={SECCIONES.map(s => s.id === 'pedidos' ? { ...s, contador: pendientes, tituloContador: 'Pedidos en revisión de la selección actual' } : s)} />
}
