/**
 * La planilla de un usuario desde Usuarios y permisos (2026-11-09): qué tipo de
 * personal es y con qué tarifas. El usuario: «desde los permisos de usuarios
 * poner el tipo de personal; el agente de ventas tiene gasolina, incentivo,
 * comisión… bodega solo tiene horas y horas extras».
 */

// Lo que decidió el usuario: 2 %, ₡2.000 por cliente nuevo, ₡5.000 de gasolina
// (2026-10-30) y jornada de 8 h para las horas extra (2026-11-09).
export const PLANILLA_POR_OMISION = {
  tipo: 'ventas', pagoHora: '', horasJornada: 8, comisionPorcentaje: 2, incentivoClienteNuevo: 2000, gasolinaDiaria: 5000
}

/** Cómo arranca el formulario: su ficha si la tiene activa; si no, «No lleva planilla». */
export function planillaInicial(usuario) {
  const p = usuario?.planilla
  if (!p || !p.activo) return { ...PLANILLA_POR_OMISION, tipo: 'ninguno' }
  return { ...PLANILLA_POR_OMISION, ...p }
}

/** Lo que falta para poder guardar, o '' si está completo. */
export function faltaEnPlanilla(planilla) {
  if (planilla.tipo === 'ninguno') return ''
  if (planilla.pagoHora === '' || !(Number(planilla.pagoHora) >= 0)) return 'Ponga cuánto se le paga por hora.'
  if (planilla.tipo === 'bodega' && !(Number(planilla.horasJornada) >= 1 && Number(planilla.horasJornada) <= 24)) return 'Las horas de la jornada van de 1 a 24.'
  return ''
}

/**
 * Qué hay que pedirle al servidor de Empleados después de guardar el usuario:
 * `null` (nada), dar de alta la ficha, actualizarla o desactivarla (la historia
 * de horas y pagos se conserva; nunca se borra).
 */
export function cambioDePlanilla(planilla, anterior) {
  const tenia = Boolean(anterior)
  if (planilla.tipo === 'ninguno') return tenia && anterior.activo ? { accion: 'actualizar', datos: { activo: false } } : null
  const { tipo, pagoHora, horasJornada, comisionPorcentaje, incentivoClienteNuevo, gasolinaDiaria } = planilla
  const datos = { tipo, pagoHora: Number(pagoHora), horasJornada: Number(horasJornada), comisionPorcentaje: Number(comisionPorcentaje),
    incentivoClienteNuevo: Number(incentivoClienteNuevo), gasolinaDiaria: Number(gasolinaDiaria) }
  return tenia ? { accion: 'actualizar', datos: { ...datos, activo: true } } : { accion: 'crear', datos }
}
