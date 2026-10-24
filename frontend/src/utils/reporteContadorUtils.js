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
export const SECCIONES_CONTADOR = [
  { id: 'electronicas', titulo: 'Facturas y notas electrónicas' },
  { id: 'compras', titulo: 'Compras' },
  { id: 'gastos', titulo: 'Gastos operativos' }
]

export function etiquetaMovimiento(d) {
  if (d.categoria_texto) return d.categoria_texto
  const sufijo = d.electronica === true ? ' electrónica' : ''
  if (d.tipo === 'Nota de crédito') return `Nota de crédito${sufijo}`
  if (d.tipo === 'Venta') return d.tipo_documento === 'tiquete'
    ? `Tiquete${d.electronica === true ? ' electrónico' : ''}`
    : `Factura${sufijo}`
  return d.tipo
}

export function filtrarMovimientos(datos, tab, buscar) {
  const lista =
    tab === 'gastos'
      ? datos?.gastos || []
      : (datos?.documentos || []).filter((d) =>
          // La misma bandera que usa Facturación: una nota se clasifica por
          // su propia emisión, aunque acredite una factura de la otra clase.
          tab === 'electronicas'
            ? ['Venta', 'Nota de crédito'].includes(d.tipo) && d.electronica === true
            : tab === 'compras' && ['Compra', 'Nota de crédito proveedor'].includes(d.tipo)
        )
  const texto = buscar.trim().toLocaleLowerCase('es')
  return lista.filter((d) =>
    `${d.contraparte} ${d.numero} ${d.categoria_texto || ''} ${d.descripcion || ''}`
      .toLocaleLowerCase('es')
      .includes(texto)
  )
}
