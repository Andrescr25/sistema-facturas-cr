import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardList, Wallet, UserCircle, DollarSign, Boxes, PackageX,
  Repeat, FileWarning, Loader2, ArrowRight, Tablet, Store, FileText, CheckCircle2
} from 'lucide-react'
import api from '../services/api'

// es-CR separa los miles con un espacio duro (U+00A0): "₡204 879" se lee
// como dos números. En Costa Rica los miles van con punto. El código del
// carácter va escrito como \u00A0 y no como el carácter en sí: literal es
// invisible en el editor y cualquiera lo borra sin darse cuenta.
const colones = (n) => `₡${Math.round(Number(n) || 0).toLocaleString('es-CR').replace(/\u00A0/g, '.')}`

/**
 * Inicio: qué hay pendiente hoy.
 *
 * El dashboard anterior mostraba conteos de una sincronización que ya no se
 * usa y sus accesos directos apuntaban a /buscar-factura, una ruta que no
 * existe en la aplicación. Ahora cada tarjeta es trabajo real esperando, y
 * lleva a la pantalla donde se resuelve.
 *
 * Las tarjetas en cero se muestran igual, apagadas: saber que no hay nada
 * pendiente es información, y si desaparecieran la pantalla cambiaría de
 * forma todos los días.
 */
export default function Dashboard() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/dashboard/resumen')
      .then(({ data }) => setDatos(data.data))
      .catch(() => setError('No se pudo cargar el resumen.'))
      .finally(() => setCargando(false))
  }, [])

  const pendientes = datos ? [
    {
      titulo: 'Pedidos de clientes',
      valor: datos.pedidosPortal,
      detalle: datos.pedidosPortal === 1 ? 'esperando factura' : 'esperando factura',
      href: '/clientes',
      icono: UserCircle,
      color: 'text-exito-600 bg-exito-50'
    },
    {
      titulo: 'Por alistar en bodega',
      valor: datos.bodega,
      detalle: `de los últimos ${datos.diasBodega} días`,
      href: '/facturas-bodega',
      icono: ClipboardList,
      color: 'text-primario-600 bg-primario-50'
    },
    {
      titulo: 'Revisión de precios',
      valor: datos.revisionPrecios,
      detalle: 'facturas de proveedor sin revisar',
      href: '/revision-precios',
      icono: DollarSign,
      color: 'text-alerta-600 bg-alerta-50'
    },
    {
      titulo: 'Pagos del mes',
      valor: datos.pagosRecurrentes,
      detalle: 'gastos fijos sin pagar',
      href: '/pagos-recurrentes',
      icono: Repeat,
      color: 'text-nota-600 bg-nota-50'
    },
    {
      titulo: 'Excesos abiertos',
      valor: datos.excesos,
      detalle: 'tandas sin terminar de empacar',
      href: '/inventario-auditoria',
      icono: PackageX,
      color: 'text-alerta-600 bg-alerta-50'
    },
    {
      titulo: 'Duplicados por revisar',
      valor: datos.duplicados,
      detalle: 'copias con cobros de por medio',
      href: '/clientes',
      icono: FileWarning,
      color: 'text-peligro-600 bg-peligro-50'
    }
  ] : []

  const accesos = [
    {
      nombre: 'Catálogo del agente',
      descripcion: 'Abrirlo para salir a vender',
      href: '/catalogo-agente',
      icono: Tablet,
      color: 'bg-neutro-900'
    },
    {
      nombre: 'Catálogo de clientes',
      descripcion: 'Lo que ven desde el enlace',
      href: '/catalogo',
      icono: Store,
      color: 'bg-exito-600'
    },
    {
      nombre: 'Facturar',
      descripcion: 'Crear una factura de venta',
      href: '/facturacion',
      icono: FileText,
      color: 'bg-primario-600'
    },
    {
      nombre: 'Auditoría de inventario',
      descripcion: 'Contar o armar una tanda',
      href: '/inventario-auditoria',
      icono: Boxes,
      color: 'bg-nota-600'
    }
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-neutro-900">Inicio</h1>
        <p className="text-sm text-neutro-500 mt-0.5">Lo que está pendiente hoy</p>
      </div>

      {error && (
        <div className="bg-peligro-50 border border-peligro-200 rounded-2xl px-4 py-3 text-sm text-peligro-700 font-semibold">
          {error}
        </div>
      )}

      {cargando ? (
        <div className="py-20 flex justify-center"><Loader2 size={26} className="animate-spin text-exito-600" /></div>
      ) : datos && (
        <>
          {/* La cobranza va aparte y primero: es plata en la calle, y el
              monto vencido es el único número de esta pantalla que crece
              solo si nadie hace nada. */}
          <Link
            to="/cuentas-por-cobrar"
            className="block bg-white rounded-2xl border border-neutro-200 hover:border-exito-400 p-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-exito-50 text-exito-600 shrink-0">
                  <Wallet size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-neutro-400">Por cobrar</p>
                  <p className="text-3xl font-extrabold text-neutro-900 leading-tight">
                    {colones(datos.cuentasPorCobrar.total)}
                  </p>
                  <p className="text-xs text-neutro-500">
                    {datos.cuentasPorCobrar.facturas} factura{datos.cuentasPorCobrar.facturas === 1 ? '' : 's'} con saldo
                  </p>
                </div>
              </div>

              {datos.cuentasPorCobrar.vencidas > 0 && (
                <div className="bg-peligro-50 border border-peligro-200 rounded-xl px-3.5 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-peligro-500">Vencido</p>
                  <p className="text-xl font-extrabold text-peligro-600 leading-tight">
                    {colones(datos.cuentasPorCobrar.vencido)}
                  </p>
                  <p className="text-[11px] text-peligro-500">
                    {datos.cuentasPorCobrar.vencidas} factura{datos.cuentasPorCobrar.vencidas === 1 ? '' : 's'}
                  </p>
                </div>
              )}
            </div>
          </Link>

          <div>
            <h2 className="text-sm font-bold text-neutro-900 mb-3">Pendientes</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendientes.map((p) => {
                const Icono = p.icono
                const hay = p.valor > 0
                return (
                  <Link
                    key={p.titulo}
                    to={p.href}
                    className={`bg-white rounded-2xl border p-4 flex items-center gap-3.5 transition-colors ${
                      hay ? 'border-neutro-200 hover:border-exito-400' : 'border-neutro-100 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${hay ? p.color : 'text-neutro-300 bg-neutro-50'}`}>
                      {hay ? <Icono size={19} /> : <CheckCircle2 size={19} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-neutro-900 leading-tight">{p.titulo}</p>
                      <p className="text-xs text-neutro-400 truncate">{hay ? p.detalle : 'nada pendiente'}</p>
                    </div>
                    <span className={`text-2xl font-extrabold shrink-0 ${hay ? 'text-neutro-900' : 'text-neutro-200'}`}>
                      {p.valor}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold text-neutro-900 mb-3">Accesos rápidos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {accesos.map((a) => {
                const Icono = a.icono
                return (
                  <Link
                    key={a.nombre}
                    to={a.href}
                    className="bg-white rounded-2xl border border-neutro-200 hover:border-exito-400 p-4 group transition-colors"
                  >
                    <div className={`w-10 h-10 rounded-xl ${a.color} text-white flex items-center justify-center mb-3`}>
                      <Icono size={19} />
                    </div>
                    <p className="text-sm font-bold text-neutro-900 flex items-center gap-1">
                      {a.nombre}
                      <ArrowRight size={13} className="text-neutro-300 group-hover:text-exito-600 group-hover:translate-x-0.5 transition-all" />
                    </p>
                    <p className="text-xs text-neutro-400 leading-tight mt-0.5">{a.descripcion}</p>
                  </Link>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
