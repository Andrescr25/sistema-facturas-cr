import { ShoppingBag, Receipt, Wallet, AlertCircle } from 'lucide-react'
import TarjetasResumen from '../pagos/TarjetasResumen'
import { formatearMoneda } from '../../utils/moneda'
export default function ResumenMes({ datos }) {
  return (
    <div className="space-y-4">
      {datos.resumen.map((r) => {
        const pendientes = datos.gastos.filter(
          (g) => g.revision === 'Por revisar' && g.moneda === r.moneda
        ).length
        return (
          <div key={r.moneda}>
            <p className="mb-2 text-xs font-bold text-neutro-500">Importes en {r.moneda}</p>
            <TarjetasResumen
              tarjetas={[
                {
                  clave: 'ventas',
                  titulo: 'Ventas menos notas de crédito',
                  icono: Wallet,
                  valor: formatearMoneda(r.ventas - r.devoluciones, r.moneda)
                },
                {
                  clave: 'compras',
                  titulo: 'Compras',
                  icono: ShoppingBag,
                  valor: formatearMoneda(r.compras, r.moneda),
                  pie: `Notas de proveedor: ${formatearMoneda(r.creditos_proveedores, r.moneda)}`
                },
                {
                  clave: 'gastos',
                  titulo: 'Gastos operativos',
                  icono: Receipt,
                  valor: formatearMoneda(r.gastos, r.moneda)
                },
                {
                  clave: 'pendientes',
                  titulo: 'Gastos por revisar',
                  icono: AlertCircle,
                  valor: pendientes,
                  tono: pendientes ? 'alerta' : 'neutro',
                  pie: 'Incluidos en el reporte, sin importes fiscales aprobados'
                }
              ]}
            />
          </div>
        )
      })}
    </div>
  )
}
