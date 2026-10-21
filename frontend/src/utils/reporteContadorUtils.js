import { hoyEnCostaRica } from './fechaCR'
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]
export const mesNombre = (n) => MESES[Number(n) - 1] || ''
export function moverMes({ anio, mes }, delta) {
  const d = new Date(Date.UTC(anio, mes - 1 + delta, 1))
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
}
export function periodoActual(ahora = new Date()) {
  const [anio, mes] = hoyEnCostaRica(ahora).split('-').map(Number)
  return { anio, mes }
}
export const periodoMesAnterior = (ahora) => moverMes(periodoActual(ahora), -1)
export function filtrarMovimientos(datos, tab, buscar) {
  const lista =
    tab === 'gastos'
      ? datos?.gastos || []
      : (datos?.documentos || []).filter((d) =>
          tab === 'ventas'
            ? ['Venta', 'Nota de crédito'].includes(d.tipo)
            : ['Compra', 'Nota de crédito proveedor'].includes(d.tipo)
        )
  const texto = buscar.trim().toLocaleLowerCase('es')
  return lista.filter((d) =>
    `${d.contraparte} ${d.numero} ${d.categoria_texto || ''} ${d.descripcion || ''}`
      .toLocaleLowerCase('es')
      .includes(texto)
  )
}
