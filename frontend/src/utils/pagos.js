/**
 * Lo que Cuentas por Cobrar y Pagos a Proveedores tienen en común.
 *
 * POR QUÉ EXISTE
 * Son el mismo problema mirado desde los dos lados del mostrador: facturas
 * con saldo, con fecha de vencimiento, agrupadas por la contraparte que debe
 * o a la que se le debe. Estaban escritos dos veces, y se notaba — el
 * resumen de cobrar dejaba des-filtrar "Vencido" haciéndole click de nuevo
 * y el de pagar no; los estados de una factura salían en gris/azul/rojo
 * crudos de Tailwind en un módulo y con los colores de la marca en el otro.
 *
 * El formato de moneda y fechas ya vivía compartido en pagosProveedoresUtils;
 * acá se agrega lo que faltaba.
 */

export { formatCurrency, formatDate, diasLabel } from './pagosProveedoresUtils'

/**
 * El estado de una factura, con el color que le toca.
 *
 * Los mismos cuatro estados sirven para las dos direcciones: una factura
 * PENDIENTE es la que todavía no se tocó, PARCIAL la que tiene un abono
 * encima, VENCIDA la que se pasó de fecha y PAGADA la que se cerró. Antes
 * "cobrar" no tenía PAGADA (las cerradas desaparecen de su lista) pero
 * incluirla no cuesta nada y evita que la tabla se quede sin estilo el día
 * que aparezca una.
 */
export const ESTADO_FACTURA = {
  PENDIENTE: { etiqueta: 'Pendiente', badge: 'bg-neutro-100 text-neutro-700', borde: 'border-l-neutro-300' },
  PARCIAL: { etiqueta: 'Con abono', badge: 'bg-primario-100 text-primario-800', borde: 'border-l-primario-400' },
  VENCIDA: { etiqueta: 'Vencida', badge: 'bg-peligro-100 text-peligro-800', borde: 'border-l-peligro-400' },
  PAGADA: { etiqueta: 'Pagada', badge: 'bg-exito-100 text-exito-800', borde: 'border-l-exito-400' }
}

export function estiloEstado(estado) {
  return ESTADO_FACTURA[String(estado || '').toUpperCase()] || ESTADO_FACTURA.PENDIENTE
}

/**
 * El color del texto de "vence en N días", que es distinto del estado: una
 * factura PENDIENTE que vence mañana tiene que verse distinta de una que
 * vence en tres meses.
 */
export function colorVencimiento(dias) {
  if (dias < 0) return 'text-peligro-600'
  if (dias <= 7) return 'text-alerta-600'
  return 'text-neutro-400'
}

/**
 * Agrupa facturas sueltas por su contraparte.
 *
 * Cuentas por Cobrar ya recibe los clientes agrupados desde el servidor;
 * Pagos a Proveedores recibe las facturas una por una. Para que las dos
 * pantallas se vean iguales, acá se hace el agrupado que le falta a la
 * segunda — en el navegador, que es donde ya están los datos, sin pedirle
 * nada nuevo al servidor.
 *
 * @param {Array} facturas
 * @param {(f) => {id: string, nombre: string, subtitulo?: string}} identificar
 * @param {(f) => number} saldoDe
 */
export function agruparPorContraparte(facturas, identificar, saldoDe) {
  const grupos = new Map()

  for (const factura of facturas) {
    const { id, nombre, subtitulo } = identificar(factura)
    const clave = String(id)
    if (!grupos.has(clave)) {
      grupos.set(clave, { id: clave, nombre, subtitulo, facturas: [], totalSaldo: 0 })
    }
    const grupo = grupos.get(clave)
    grupo.facturas.push(factura)
    grupo.totalSaldo += Number(saldoDe(factura)) || 0
  }

  // El que más plata mueve primero: es por donde se empieza a trabajar.
  return [...grupos.values()].sort((a, b) => b.totalSaldo - a.totalSaldo)
}
