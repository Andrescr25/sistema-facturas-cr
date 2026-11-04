/**
 * Cheques a fecha a proveedores (migración 078, 2026-11-03): lo que la
 * pantalla decide sin preguntarle al servidor.
 *
 * Un pago con Cheque y fecha FUTURA no es un pago todavía: queda anotado, la
 * factura se sigue debiendo con su nota, y el usuario lo confirma cuando se
 * cobra. Con la fecha de hoy (o antes) es un pago normal.
 */
import { sumarDias } from './fechaCR.js'
import { diasParaVencer } from './filtrosCobros.js'
import { formatCurrency, formatDate } from './pagosProveedoresUtils.js'

// El mismo tope del servidor (DIAS_MAXIMOS en chequesProveedor.service.js).
export const DIAS_MAXIMOS_CHEQUE = 180

export const esCheque = (metodo) => metodo?.clave === 'cheque'

export const esChequeAFecha = (metodo, fecha, hoy) => esCheque(metodo) && Boolean(fecha) && fecha > hoy

/** Hasta qué día se puede elegir: hoy para un pago; unos meses para un cheque. */
export const fechaMaximaPago = (metodo, hoy) => (esCheque(metodo) ? sumarDias(hoy, DIAS_MAXIMOS_CHEQUE) : hoy)

/** Lo que falta pagar de una factura fuera de sus cheques a fecha sin confirmar. */
export const saldoLibre = (cuenta) => Math.max(0, Math.round(((cuenta.saldoPendiente || 0) - (cuenta.enCheques || 0)) * 100) / 100)

/** La nota de una factura que tiene cheques a fecha sin confirmar. */
export const notaCheques = (cheques = []) => cheques
  .map((c) => `Cheque #${c.numero} ${formatCurrency(c.monto)} para el ${formatDate(c.fechaCobro)} · pendiente de confirmación`)
  .join(' · ') || null

/** El día que se propone al confirmar: el del cheque, o hoy si se cobró antes. */
export const fechaDeCobro = (cheque, hoy) => (cheque.fechaCobro <= hoy ? cheque.fechaCobro : hoy)

/** «Para confirmar» cuando ya llegó la fecha; si no, cuánto falta. */
export function cuandoSeCobra(cheque, hoy) {
  if (cheque.fechaCobro <= hoy) return { porConfirmar: true, texto: 'Ya llegó la fecha: confirmá si se cobró' }
  const dias = diasParaVencer(cheque.fechaCobro)
  return { porConfirmar: false, texto: dias === 1 ? 'Se cobra mañana' : `Se cobra en ${dias} días` }
}
