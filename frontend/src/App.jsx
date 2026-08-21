import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Facturacion from './pages/Facturacion'
import RelacionarProductos from './pages/RelacionarProductos'
import ReporteProveedores from './pages/ReporteProveedores'
import ReporteClientes from './pages/ReporteClientes'
import RevisionPrecios from './pages/RevisionPrecios'
import GestionarRelaciones from './pages/GestionarRelaciones'
import Impresion from './pages/Impresion'
import Configuracion from './pages/Configuracion'
import PagosProveedores from './pages/PagosProveedores'
import PagosRecurrentes from './pages/PagosRecurrentes'
import ReporteContador from './pages/ReporteContador'
import CuentasPorCobrar from './pages/CuentasPorCobrar'
import FacturasBodega from './pages/FacturasBodega'
import InventarioAuditoria from './pages/InventarioAuditoria'
import GestionCatalogo from './pages/GestionCatalogo'
import CatalogoAgente from './pages/CatalogoAgente'
import CatalogoClientes from './pages/CatalogoClientes'
import PortalIngresar from './pages/portal/PortalIngresar'
import PortalActivar from './pages/portal/PortalActivar'
import PortalPedidos from './pages/portal/PortalPedidos'
import PortalFacturas from './pages/portal/PortalFacturas'
import Clientes from './pages/Clientes'
import Ingresar from './pages/Ingresar'
import RequiereSesion from './components/RequiereSesion'
import Rentabilidad from './pages/Rentabilidad'

function App() {
  // 🔄 Keep-alive para mantener el backend activo
  useEffect(() => {
    // URL del backend sin el /api
    const backendURL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000'
    
    const keepAlive = setInterval(async () => {
      try {
        console.log('🔄 Keep-alive ping al backend...');
        const response = await fetch(`${backendURL}/health`);
        if (response.ok) {
          console.log('✅ Backend activo');
        }
      } catch (error) {
        console.log('⚠️ Keep-alive ping failed (backend probablemente dormido)');
      }
    }, 10 * 60 * 1000); // Cada 10 minutos

    // Ping inicial inmediato
    setTimeout(async () => {
      try {
        await fetch(`${backendURL}/health`);
      } catch (error) {
        // Ignorar error de ping inicial
      }
    }, 2000); // Esperar 2 segundos después de cargar

    return () => clearInterval(keepAlive);
  }, []);

  return (
    <Routes>
      {/* Catálogo del agente de venta (tablet, modo kiosco, sincroniza para
          funcionar sin señal en la calle): fuera de Layout a propósito, sin
          barra lateral ni acceso visible al resto del sistema interno, pero
          SÍ con sesión — muestra el historial de compras de cada cliente. */}
      <Route
        path="/catalogo-agente"
        element={<RequiereSesion><CatalogoAgente /></RequiereSesion>}
      />

      {/* Catálogo que se le manda al cliente. Público y sin
          sincronización: lee del catálogo ya guardado en el servidor. */}
      <Route path="/catalogo" element={<CatalogoClientes />} />

      {/* Portal de clientes: sesión propia, separada de la del personal.
          Mirar el catálogo no pide cuenta; enviar un pedido, sí. */}
      <Route path="/portal/ingresar" element={<PortalIngresar />} />
      <Route path="/portal/activar/:token" element={<PortalActivar />} />
      <Route path="/portal/pedidos" element={<PortalPedidos />} />
      <Route path="/portal/facturas" element={<PortalFacturas />} />

      {/* Las tablets de los agentes tienen guardada la ruta vieja. */}
      <Route path="/catalogo-publico" element={<Navigate to="/catalogo-agente" replace />} />

      <Route path="/ingresar" element={<Ingresar />} />

      <Route
        path="/*"
        element={
          <RequiereSesion>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/facturacion" element={<Facturacion />} />
              <Route path="/facturas-bodega" element={<FacturasBodega />} />
              <Route path="/relacionar-productos/:facturaId" element={<RelacionarProductos />} />
              <Route path="/reportes/proveedores" element={<ReporteProveedores />} />
              <Route path="/reportes/clientes" element={<ReporteClientes />} />
              <Route path="/revision-precios" element={<RevisionPrecios />} />
              <Route path="/rentabilidad" element={<Rentabilidad />} />
              <Route path="/gestionar-relaciones" element={<GestionarRelaciones />} />
              <Route path="/impresion" element={<Impresion />} />
              <Route path="/pagos-proveedores" element={<PagosProveedores />} />
              <Route path="/pagos-recurrentes" element={<PagosRecurrentes />} />
              <Route path="/reporte-contador" element={<ReporteContador />} />
              <Route path="/cuentas-por-cobrar" element={<CuentasPorCobrar />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/gestion-catalogo" element={<GestionCatalogo />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/inventario-auditoria" element={<InventarioAuditoria />} />
            </Routes>
          </Layout>
          </RequiereSesion>
        }
      />
    </Routes>
  )
}

export default App