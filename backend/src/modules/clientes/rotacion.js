/**
 * Rotación por cliente: cada cuántos días se le vuelve a atender.
 *
 * LA REGLA (pedido del usuario, 2026-10-13, que reemplaza los ciclos
 * globales): cada cliente tiene SU frecuencia. La fecha de su última factura
 * es su última atención, y la próxima visita es esa fecha más su frecuencia.
 * Rotación 22 días y última factura el 10 de octubre → 1 de noviembre.
 *
 * NADA DE ESTO SE GUARDA, salvo la frecuencia (`cliente.rotacion_dias`).
 * La última atención y la próxima visita se calculan al leer, como el saldo:
 * facturar, anular una factura o cambiarle la fecha las mueven solas, y no
 * hay columna que pueda quedar vieja.
 *
 * La ruta es otra cosa: dice a qué recorrido pertenece el cliente, no cuándo
 * le toca. Dos clientes de la misma ruta pueden rotar cada 7 y cada 22 días.
 */

const { diaDeBase, sumarDias, diasEntre } = require('../../utils/fechaCR');

const ROTACION_MAXIMA = 365;

const ESTADO = {
  /** No se le definió la frecuencia: no hay con qué calcular. */
  SIN_ROTACION: 'sin_rotacion',
  /** Tiene frecuencia pero ninguna factura: no hay desde cuándo contar. */
  SIN_FACTURAS: 'sin_facturas',
  ATRASADO: 'atrasado',
  HOY: 'hoy',
  PROXIMO: 'proximo'
};

/**
 * La última atención de un cliente, en SQL: el día de su última factura
 * EMITIDA. Un borrador no es una venta y una anulada no es una visita.
 * Una sola definición para la ficha, Preventa y los reportes.
 *
 * @param {string} cliente  la expresión SQL del id del cliente (`c.id`, `$1`)
 */
const ULTIMA_ATENCION_SQL = (cliente) =>
  `(SELECT MAX(fu.fecha) FROM factura fu WHERE fu.cliente_id = ${cliente} AND fu.estado = 'emitida')`;

/**
 * @param {object} datos
 * @param {number|null} datos.rotacionDias  la frecuencia del cliente
 * @param {Date|string|null} datos.ultimaFactura  como la entrega la base
 * @param {string} datos.hoy  "AAAA-MM-DD" en Costa Rica
 * @returns {{dias: number|null, ultimaAtencion: string|null, proximaVisita: string|null, faltan: number|null, estado: string}}
 *   `faltan` son los días hasta la próxima visita: negativo si ya pasó.
 */
function rotacionDe({ rotacionDias, ultimaFactura, hoy }) {
  const n = Number(rotacionDias);
  const dias = rotacionDias !== null && rotacionDias !== undefined && rotacionDias !== ''
    && Number.isInteger(n) && n >= 1 && n <= ROTACION_MAXIMA ? n : null;
  const ultimaAtencion = diaDeBase(ultimaFactura);

  if (!dias) return { dias: null, ultimaAtencion, proximaVisita: null, faltan: null, estado: ESTADO.SIN_ROTACION };
  if (!ultimaAtencion) return { dias, ultimaAtencion: null, proximaVisita: null, faltan: null, estado: ESTADO.SIN_FACTURAS };

  const proximaVisita = sumarDias(ultimaAtencion, dias);
  const faltan = diasEntre(hoy, proximaVisita);
  const estado = faltan < 0 ? ESTADO.ATRASADO : faltan === 0 ? ESTADO.HOY : ESTADO.PROXIMO;
  return { dias, ultimaAtencion, proximaVisita, faltan, estado };
}

module.exports = { ESTADO, ROTACION_MAXIMA, ULTIMA_ATENCION_SQL, rotacionDe };
