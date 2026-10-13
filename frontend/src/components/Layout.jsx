import { useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Home, FileText, Users, TrendingUp, DollarSign, Link2, Printer, Settings,
  Menu, X, CreditCard, ClipboardList, Boxes, Image, Wallet, PieChart,
  Repeat, Landmark, UserCircle, ShoppingCart, Truck, LineChart, ShieldCheck, History, CalendarDays
} from 'lucide-react'
import InstallPWA from './InstallPWA'
import SidebarNav from './SidebarNav'
import PieSesion from './PieSesion'
import { useAuth } from '../contexts/AuthContext'
import { puedeVer } from '../utils/modulos'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const { usuario } = useAuth()

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
        { name: 'Cotizaciones', href: '/cotizaciones', icon: FileText },
        { name: 'Facturas en Bodega', href: '/facturas-bodega', icon: ClipboardList },
        { name: 'Clientes', href: '/clientes', icon: UserCircle },
        { name: 'Preventa', href: '/preventa', icon: CalendarDays },
        { name: 'Carga y Entregas', href: '/entregas', icon: Truck },
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
    { name: 'Configuración', href: '/configuracion', icon: Settings },
    // Solo para administradores. Se filtra abajo junto con todo lo demás.
    { name: 'Usuarios y permisos', href: '/usuarios', icon: ShieldCheck, soloAdmin: true },
    { name: 'Bitácora', href: '/usuarios/bitacora', icon: History, soloAdmin: true }
  ]

  // El menú muestra únicamente lo que esta persona puede abrir. Es cosmética,
  // no seguridad: quien sepa la URL de la API la llama igual, y por eso el
  // permiso se hace valer en el backend (requirePermiso). Acá se trata de no
  // ofrecerle a alguien una pantalla que le va a responder 403.
  //
  // Un grupo cuyos hijos quedaron todos fuera desaparece completo: dejar
  // "Finanzas" vacío y desplegable sería peor que no mostrarlo.
  const navegacionVisible = useMemo(() => {
    const visible = (item) => {
      if (item.soloAdmin) return Boolean(usuario?.esAdmin)
      return puedeVer(usuario, item.href)
    }

    return navigation
      .map(item => {
        if (!item.children) return visible(item) ? item : null
        const hijos = item.children.filter(visible)
        return hijos.length > 0 ? { ...item, children: hijos } : null
      })
      .filter(Boolean)
  }, [usuario])

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen bg-neutro-50">
      {/*
        EL MENÚ SE DESPLAZA, EL LOGO Y EL PIE SE QUEDAN.

        Ya tenía `overflow-y-auto` y aun así no se desplazaba: a un elemento
        flexible el navegador le da `min-height: auto`, o sea que no se
        encoge por debajo de su contenido, y el `flex-1` crecía hasta los
        952px de los módulos. Con los cinco grupos abiertos —como los tiene
        quien usa todo el sistema— el pie de sesión quedaba en y=1016 aun en
        una pantalla de 900: no había forma de cerrar sesión sin borrar el
        almacenamiento del navegador.

        `min-h-0` es lo que lo destraba. `shrink-0` en el logo y en el pie
        para que no se aplasten cuando el menú pide lugar, y
        `overscroll-contain` para que al llegar al final del menú no se
        empiece a desplazar la página de atrás.
      */}

      {/* Sidebar móvil */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-neutro-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 min-h-0 flex-col bg-white">
          <div className="flex h-16 shrink-0 items-center justify-between px-4">
            <img src="/tachi-logo.png" alt="Distribuidora Tachi" className="h-7 w-auto" />
            <button onClick={() => setSidebarOpen(false)} className="text-neutro-400 hover:text-neutro-600">
              <X size={24} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain barra-fina">
            <SidebarNav navigation={navegacionVisible} isActive={isActive} onNavigate={() => setSidebarOpen(false)} />
          </div>
          <PieSesion onNavegar={() => setSidebarOpen(false)} />
        </div>
      </div>

      {/* Sidebar desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex h-full min-h-0 flex-col bg-white border-r border-neutro-200">
          <div className="flex h-16 shrink-0 items-center px-4 border-b border-neutro-100">
            <img src="/tachi-logo.png" alt="Distribuidora Tachi" className="h-8 w-auto" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain barra-fina">
            <SidebarNav navigation={navegacionVisible} isActive={isActive} />
          </div>
          <PieSesion />
        </div>
      </div>

      {/* Contenido principal */}
      <div className="lg:pl-64">
        {/* Header móvil */}
        <div className="sticky top-0 z-40 lg:hidden">
          <div className="flex items-center justify-between h-16 px-4 bg-white border-b border-neutro-200">
            {/* 44×44 de área para el dedo: el ícono solo medía 24×24. */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir el menú"
              className="-ml-2.5 rounded-xl p-2.5 text-neutro-400 hover:bg-neutro-100 hover:text-neutro-600"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-lg font-semibold text-neutro-900">Sistema de Faltantes</h1>
            <div className="w-10" />
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
