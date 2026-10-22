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
import GastosOperativos from './pages/GastosOperativos'
import ReporteContador from './pages/ReporteContador'
import CuentasPorCobrar from './pages/CuentasPorCobrar'
import CajaGeneral from './pages/CajaGeneral'
import FacturasBodega from './pages/FacturasBodega'
import Cotizaciones from './pages/Cotizaciones'
import InventarioAuditoria from './pages/InventarioAuditoria'
import GestionCatalogo from './pages/GestionCatalogo'
import CatalogoAgente from './pages/CatalogoAgente'
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

      {/* Las páginas del cliente (catálogo, cotización, cuenta, pedidos y
          facturas) viven en su propio sitio (AppPortal.jsx) y este paquete no
          las trae: «no quiero que los clientes puedan llegar al sistema
          interno» (2026-10-20). Acá solo se manda al cliente allá, con su
          sesión, para que los enlaces ya enviados por WhatsApp sirvan. */}
      <Route path="/catalogo" element={<IrAlPortal />} />
      <Route path="/cotizacion/:token" element={<IrAlPortal />} />
      <Route path="/portal/*" element={<IrAlPortal />} />

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
              <Route path="/gastos-operativos" element={<GastosOperativos />} />
              <Route path="/reporte-contador" element={<ReporteContador />} />
              <Route path="/cuentas-por-cobrar" element={<CuentasPorCobrar />} />
              <Route path="/caja-general" element={<CajaGeneral />} />
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
