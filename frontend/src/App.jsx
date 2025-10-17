import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Facturacion from './pages/Facturacion'
import BuscarFactura from './pages/BuscarFactura'
import RegistrarFaltantes from './pages/RegistrarFaltantes'
import RelacionarProductos from './pages/RelacionarProductos'
import ReporteProveedores from './pages/ReporteProveedores'
import ReporteClientes from './pages/ReporteClientes'
import RevisionPrecios from './pages/RevisionPrecios'
import GestionarRelaciones from './pages/GestionarRelaciones'
import Reimpresion from './pages/Reimpresion'
import Configuracion from './pages/Configuracion'

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
        console.log('🔄 Ping inicial al backend...');
        const response = await fetch(`${backendURL}/health`);
        if (response.ok) {
          console.log('✅ Backend conectado al iniciar');
        }
      } catch (error) {
        console.log('⚠️ Backend no responde inmediatamente al iniciar');
      }
    }, 2000); // Esperar 2 segundos después de cargar

    return () => clearInterval(keepAlive);
  }, []);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/facturacion" element={<Facturacion />} />
        <Route path="/buscar-factura" element={<BuscarFactura />} />
        <Route path="/registrar-faltantes/:facturaId?" element={<RegistrarFaltantes />} />
        <Route path="/relacionar-productos/:facturaId" element={<RelacionarProductos />} />
        <Route path="/reportes/proveedores" element={<ReporteProveedores />} />
        <Route path="/reportes/clientes" element={<ReporteClientes />} />
        <Route path="/revision-precios" element={<RevisionPrecios />} />
        <Route path="/gestionar-relaciones" element={<GestionarRelaciones />} />
        <Route path="/reimpresion" element={<Reimpresion />} />
        <Route path="/configuracion" element={<Configuracion />} />
      </Routes>
    </Layout>
  )
}

export default App