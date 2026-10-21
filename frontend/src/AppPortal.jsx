import { Routes, Route, Navigate } from 'react-router-dom'
import CatalogoClientes from './pages/CatalogoClientes'
import CotizacionPublica from './pages/CotizacionPublica'
import PortalIngresar from './pages/portal/PortalIngresar'
import PortalActivar from './pages/portal/PortalActivar'
import PortalPedidos from './pages/portal/PortalPedidos'
import PortalFacturas from './pages/portal/PortalFacturas'

/**
 * El sitio de los clientes, publicado aparte del sistema interno
 * (`npm run build:portal`, otro servicio en Render).
 *
 * POR QUÉ APARTE. Con un solo sitio, el cliente que abría el catálogo podía
 * borrar la dirección y caer en el ingreso del personal. El usuario pidió el
 * 2026-10-20 que eso no pueda pasar. Este paquete no trae ninguna pantalla
 * del personal: desde acá no hay camino al sistema, ni siquiera su código.
 * Cualquier otra dirección lleva al catálogo.
 *
 * Una prueba (portalAparte.test.js) cuida que acá no entre otra página.
 */
export default function AppPortal() {
  return (
    <Routes>
      <Route path="/catalogo" element={<CatalogoClientes />} />

      {/* La cotización que el cliente abre desde el WhatsApp. La protege el
          token firmado de la URL, sin cuenta. */}
      <Route path="/cotizacion/:token" element={<CotizacionPublica />} />

      <Route path="/portal/ingresar" element={<PortalIngresar />} />
      <Route path="/portal/activar/:token" element={<PortalActivar />} />
      <Route path="/portal/pedidos" element={<PortalPedidos />} />
      <Route path="/portal/facturas" element={<PortalFacturas />} />

      <Route path="*" element={<Navigate to="/catalogo" replace />} />
    </Routes>
  )
}
