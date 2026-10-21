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
import Cotizaciones from './pages/Cotizaciones'
import InventarioAuditoria from './pages/InventarioAuditoria'
import GestionCatalogo from './pages/GestionCatalogo'
import CatalogoAgente from './pages/CatalogoAgente'
import CatalogoClientes from './pages/CatalogoClientes'
import CotizacionPublica from './pages/CotizacionPublica'
import PortalIngresar from './pages/portal/PortalIngresar'
import PortalActivar from './pages/portal/PortalActivar'
import PortalPedidos from './pages/portal/PortalPedidos'
import PortalFacturas from './pages/portal/PortalFacturas'
import Clientes from './pages/Clientes'
import Preventa from './pages/Preventa'
import Entregas from './pages/Entregas'
import Ingresar from './pages/Ingresar'
import RequiereSesion from './components/RequiereSesion'
import RequierePermiso from './components/RequierePermiso'
import Usuarios from './pages/Usuarios'
import Bitacora from './pages/Bitacora'
import Rentabilidad from './pages/Rentabilidad'
import IrAlPortal from './components/IrAlPortal'
import { portalEnOtroSitio } from './utils/urlPortal'

const delCliente = (pagina) => (portalEnOtroSitio() ? <IrAlPortal /> : pagina)

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
          barra lateral ni acceso visible al resto del sistema interno.

          SIN SESIÓN, y es una decisión tomada a sabiendas (2026-09-04).
          Los agentes trabajan en zonas sin cobertura y la sesión dura 12
          horas: el que abría la tablet al día siguiente se encontraba el
          login y sin red para pasarlo, con el catálogo YA descargado en el
          dispositivo. Pedirle sesión a una pantalla hecha para funcionar sin
          señal era la contradicción de fondo.

          Lo que esto expone: quien tenga la dirección ve el catálogo con
          precios, el historial de compras de cada cliente y puede crear
          pedidos a nombre de ellos. En el backend se abrieron solo las seis
          rutas que esta pantalla usa — ver PUBLICAS_EXACTAS en
          auth.middleware.js. */}
      <Route path="/catalogo-agente" element={<CatalogoAgente />} />

      {/* Las páginas del cliente viven en su propio sitio (AppPortal.jsx)
          cuando VITE_PORTAL_URL está puesta: acá solo se lo manda allá, para
          que los enlaces ya enviados sigan sirviendo. Sin la variable se
          dibujan acá, como antes de separar los sistemas. */}

      {/* Catálogo que se le manda al cliente. Público y sin
          sincronización: lee del catálogo ya guardado en el servidor. */}
      <Route path="/catalogo" element={delCliente(<CatalogoClientes />)} />

      {/* La cotización que el cliente abre desde el enlace del WhatsApp: la
          misma del PDF pero con la foto de cada producto. Sin cuenta — pedir
          registro para ver un precio que se acaba de mandar es la forma más
          rápida de que no lo miren. La protege el token firmado de la URL. */}
      <Route path="/cotizacion/:token" element={delCliente(<CotizacionPublica />)} />

      {/* Portal de clientes: sesión propia, separada de la del personal.
          Mirar el catálogo no pide cuenta; enviar un pedido, sí. */}
      <Route path="/portal/ingresar" element={delCliente(<PortalIngresar />)} />
      <Route path="/portal/activar/:token" element={delCliente(<PortalActivar />)} />
      <Route path="/portal/pedidos" element={delCliente(<PortalPedidos />)} />
      <Route path="/portal/facturas" element={delCliente(<PortalFacturas />)} />

      {/* Las tablets de los agentes tienen guardada la ruta vieja. */}
      <Route path="/catalogo-publico" element={<Navigate to="/catalogo-agente" replace />} />

      <Route path="/ingresar" element={<Ingresar />} />

      <Route
        path="/*"
        element={
          <RequiereSesion>
          <Layout>
            {/* RequierePermiso envuelve TODAS las pantallas internas: la
                pantalla que no corresponda dice que no hay acceso, en vez de
                dibujarse a medias tirando 403 por todos lados. La
                autorización de verdad la hace el backend. */}
            <RequierePermiso>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/facturacion" element={<Facturacion />} />
              <Route path="/cotizaciones" element={<Cotizaciones />} />
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
              <Route path="/preventa" element={<Preventa />} />
              <Route path="/entregas" element={<Entregas />} />
              <Route path="/gestion-catalogo" element={<GestionCatalogo />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/inventario-auditoria" element={<InventarioAuditoria />} />
              <Route path="/usuarios" element={<Usuarios />} />
              {/* Bajo /usuarios a propósito: es de administradores, igual que ella. */}
              <Route path="/usuarios/bitacora" element={<Bitacora />} />
            </Routes>
            </RequierePermiso>
          </Layout>
          </RequiereSesion>
        }
      />
    </Routes>
  )
}

export default App
