/**
 * Lo que solo usa Cuentas por Cobrar.
 *
 * Todo lo que comparte con Pagos a Proveedores —moneda, fechas, el texto de
 * "vence en N días", los colores de cada estado— se mudó a utils/pagos.js
 * cuando las dos pantallas pasaron a armarse con los mismos componentes.
 * Los métodos de pago ya no viven acá: salen del catálogo propio
 * (`getMetodosPago`), y la lista fija que había quedó sin uso.
 *
 * Se sigue re-exportando el formateo para no tocar ModalAbono y CuadreCajaDia,
 * que ya lo importaban de acá.
 */

export { formatCurrency, formatDate, diasLabel } from './pagos'
