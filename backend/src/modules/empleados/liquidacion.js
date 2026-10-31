/**
 * Las cuentas de la planilla, sin base de datos (2026-10-30).
 *
 * El usuario, sobre el agente de ventas: «Mis ingresos» para que vea cuánto
 * ha ganado —«como para motivarlo»— y «Empleados» para ver «el total que le
 * debo». Decidió:
 * · Horas: el agente marca entrada y salida; se le paga por hora trabajada.
 * · Se paga por QUINCENA: del 1 al 15 y del 16 a fin de mes (calendario de
 *   Costa Rica).
 *
 * · Comisión: «2 % de ventas netas», por MES; entra entera en la 2.ª quincena.
 * · ₡2.000 por cliente nuevo y ₡5.000 de gasolina por día trabajado.
 *
 * Todo se calcula al leer, de lo que quedó guardado: ninguna cuenta se guarda
 * en una columna, porque así es como queda desactualizada sin que nadie lo note.
 */
const { sumarDias } = require('../../utils/fechaCR');

// Una jornada abierta más tiempo que esto se olvidó de terminar: «sin salida».
const HORAS_MAXIMAS = 16;
const CLAVE = /^(\d{4})-(\d{2})-Q([12])$/;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

const dinero = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dos = (n) => String(n).padStart(2, '0');
const ultimoDia = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

function quincena(anio, mes, numero) {
  const m = `${anio}-${dos(mes)}`;
  const desde = numero === 1 ? `${m}-01` : `${m}-16`;
  const hasta = numero === 1 ? `${m}-15` : `${m}-${dos(ultimoDia(anio, mes))}`;
  return { clave: `${m}-Q${numero}`, mes: m, numero, desde, hasta,
    nombre: `${numero === 1 ? '1.ª' : '2.ª'} quincena de ${MESES[mes - 1]} ${anio}` };
}

/** La quincena de un día "AAAA-MM-DD". */
function quincenaDe(dia) {
  const [a, m, d] = String(dia).split('-').map(Number);
  return quincena(a, m, d <= 15 ? 1 : 2);
}

/** "2026-10-Q2" → la quincena, o null si la clave no vale. */
function quincenaPorClave(clave) {
  const r = CLAVE.exec(String(clave || ''));
  if (!r || Number(r[2]) < 1 || Number(r[2]) > 12) return null;
  return quincena(Number(r[1]), Number(r[2]), Number(r[3]));
}

const quincenaAnterior = (q) => quincenaDe(sumarDias(q.desde, -1));
const quincenaSiguiente = (q) => quincenaDe(sumarDias(q.hasta, 1));

/** Solo cuenta un tramo con salida; el que quedó sin salida o se anuló, 0. */
function minutosDe(j) {
  if (j.estado !== 'cerrada' || !j.fin) return 0;
  return Math.max(0, Math.round((new Date(j.fin) - new Date(j.inicio)) / 60000));
}

/**
 * Los tramos agrupados por el día de su entrada (una jornada que pasa la
 * medianoche cuenta para el día en que empezó). Los anulados se muestran,
 * con 0 minutos.
 * @param {{fecha: string, inicio, fin, estado}[]} jornadas
 */
function horasPorDia(jornadas) {
  const dias = new Map();
  for (const j of jornadas) {
    if (!dias.has(j.fecha)) dias.set(j.fecha, { fecha: j.fecha, minutos: 0, tramos: [] });
    const d = dias.get(j.fecha);
    const minutos = minutosDe(j);
    d.minutos += minutos;
    d.tramos.push({ ...j, minutos });
  }
  return [...dias.values()]
    .map(d => ({ ...d, tramos: d.tramos.sort((a, b) => new Date(a.inicio) - new Date(b.inicio)) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Lo ganado por horas: minutos × tarifa por hora, a céntimos. */
const montoPorHoras = (minutos, pagoHora) => dinero((Number(minutos) || 0) * (Number(pagoHora) || 0) / 60);

/** Un monto fijo por cada uno: clientes nuevos × incentivo, días × gasolina. */
const montoPorCada = (cantidad, tarifa) => dinero((Number(cantidad) || 0) * (Number(tarifa) || 0));

/** El mes de una quincena: su comisión se calcula entera y se paga con la 2.ª. */
function mesDe(q) {
  const [anio, mes] = q.mes.split('-').map(Number);
  return { mes: q.mes, desde: `${q.mes}-01`, hasta: `${q.mes}-${dos(ultimoDia(anio, mes))}`, nombre: `${MESES[mes - 1]} ${anio}` };
}

/**
 * Comisión = ventas netas × porcentaje, a céntimos. Si un mes las devoluciones
 * pasan las ventas, queda en 0: no descuenta de otro mes.
 */
const comisionDe = (netas, porcentaje) => dinero(Math.max(0, Number(netas) || 0) * (Number(porcentaje) || 0) / 100);

/** Los días con gasolina: los que tienen al menos una jornada que no se anuló. */
const diasConGasolina = (dias) => dias.filter(d => d.tramos.some(t => t.estado !== 'anulada')).map(d => d.fecha);

module.exports = {
  HORAS_MAXIMAS, dinero, quincenaDe, quincenaPorClave, quincenaAnterior, quincenaSiguiente, minutosDe, horasPorDia, montoPorHoras, montoPorCada,
  mesDe, comisionDe, diasConGasolina
};
