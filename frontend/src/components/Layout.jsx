import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Home, FileText, Users, TrendingUp, DollarSign, Link2, Printer, Settings,
  Menu, X, CreditCard, ClipboardList, Boxes, Image, Wallet, PieChart,
  Repeat, Landmark, UserCircle, ShoppingCart, Truck, LineChart
} from 'lucide-react'
import InstallPWA from './InstallPWA'
import SidebarNav from './SidebarNav'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Agrupado por flujo de negocio, no por orden de aparición: eran 17
  // entradas planas y no cabían en pantalla. Cada grupo se abre solo cuando
  // la ruta actual está adentro, y SidebarNav recuerda los que se dejaron
  // abiertos — así el grupo del trabajo diario de cada quien queda a la
  // vista sin tener que desplegarlo cada vez.
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    {
      name: 'Ventas',
      icon: ShoppingCart,
      children: [
        { name: 'Facturación', href: '/facturacion', icon: FileText },
        { name: 'Facturas en Bodega', href: '/facturas-bodega', icon: ClipboardList },
        { name: 'Clientes', href: '/clientes', icon: UserCircle },
        { name: 'Cuentas por Cobrar', href: '/cuentas-por-cobrar', icon: Wallet },
        { name: 'Reporte Clientes', href: '/reportes/clientes', icon: TrendingUp },
        { name: 'Impresión', href: '/impresion', icon: Printer }
      ]
    },
    {
      name: 'Compras',
      icon: Truck,
      children: [
        { name: 'Revisión de Precios', href: '/revision-precios', icon: DollarSign },
        { name: 'Gestionar Relaciones', href: '/gestionar-relaciones', icon: Link2 },
        { name: 'Reporte Proveedores', href: '/reportes/proveedores', icon: Users },
        { name: 'Pago Proveedores', href: '/pagos-proveedores', icon: CreditCard },
        { name: 'Pagos Recurrentes', href: '/pagos-recurrentes', icon: Repeat }
      ]
    },
    {
      name: 'Inventario',
      icon: Boxes,
      children: [
        { name: 'Auditoría Inventario', href: '/inventario-auditoria', icon: Boxes },
        { name: 'Gestión de Catálogo', href: '/gestion-catalogo', icon: Image }
      ]
    },
    {
      name: 'Finanzas',
      icon: LineChart,
      children: [
        { name: 'Rentabilidad', href: '/rentabilidad', icon: PieChart },
        { name: 'Reporte Contador', href: '/reporte-contador', icon: Landmark }
      ]
    },
    { name: 'Configuración', href: '/configuracion', icon: Settings }
  ]

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar móvil */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
          <div className="flex h-16 items-center justify-between px-4">
            <img src="/tachi-logo.png" alt="Distribuidora Tachi" className="h-7 w-auto" />
            <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          </div>
          <SidebarNav navigation={navigation} isActive={isActive} onNavigate={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Sidebar desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex items-center h-16 px-4 border-b border-gray-100">
            <img src="/tachi-logo.png" alt="Distribuidora Tachi" className="h-8 w-auto" />
          </div>
          <SidebarNav navigation={navigation} isActive={isActive} />
        </div>
      </div>

      {/* Contenido principal */}
      <div className="lg:pl-64">
        {/* Header móvil */}
        <div className="sticky top-0 z-40 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4 bg-white border-b border-gray-200">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-400 hover:text-gray-600"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Sistema de Faltantes</h1>
            <div className="w-6" />
          </div>
        </div>

        {/* Contenido */}
        <main className="p-4">
          {children}
        </main>
      </div>

      {/* Banner de instalación PWA */}
      <InstallPWA />
    </div>
  )
}