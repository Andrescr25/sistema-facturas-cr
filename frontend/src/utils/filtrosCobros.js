/**
 * Filtros y resumen de Cuentas por Cobrar, sobre la cartera ya cargada.
 *
 * POR QUÉ EN EL NAVEGADOR
 * Al pasar los cobros a la base propia, la pantalla siguió mandando
 * `search`, `estado` y `dias`, y el endpoint nuevo solo entiende `buscar`,
 * `pagina` y `limite`: el buscador, los chips y el filtro de vencimiento no
 * hacían nada, el resumen de arriba no aparecía (no venía en la respuesta), y
 * como el endpoint corta en 30 por página sin que la pantalla pagine, la
 * mitad de los deudores —los de saldo más chico— no se veía en ningún lado.
 * La cartera entera son unos 60 clientes y 90 facturas: se trae completa una
 * vez y todo lo demás se resuelve acá, al instante.
 *
 * SIN IMPORTS A PROPÓSITO: las pruebas del backend cargan este archivo con
 * `new Function` (ver backend/tests/filtrosCobros.test.js).
 */

/** Sin acentos y en minúscula, para buscar "Jose" y encontrar "JOSÉ". */
export function normalizarBusqueda(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * El estado de una factura por cobrar. Vencida manda sobre "con abono": una
 * factura vencida con un abono sigue siendo lo urgente.
 */
export function estadoFactura(f) {
  if (f.diasRestantes !== null && f.diasRestantes !== undefined && f.diasRestantes < 0) return 'VENCIDA'
  if (Number(f.saldo) < Number(f.total) - 0.5) return 'PARCIAL'
  return 'PENDIENTE'
}

/** Rango de días para vencer que pide cada opción del filtro. */
function rangoDias(dias) {
  switch (dias) {
    case 'vence7': return [0, 7]
    case 'vence15': return [0, 15]
    case 'vence30': return [0, 30]
    case 'vencidas': return [null, -1]
    default: return null
  }
}

/**
 * Los clientes que pasan los filtros, cada uno solo con SUS facturas que
 * pasan, y su saldo recalculado sobre esas.
 *
 * @param {Array} clientes  como los arma el servicio: { clienteNombre, identificacion, facturas: [...] }
 * @param {{ estado?: string, dias?: string, search?: string }} filtros
 */
export function filtrarDeudores(clientes, filtros = {}) {
  const texto = normalizarBusqueda(filtros.search)
  const estado = filtros.estado && filtros.estado !== 'todos' ? filtros.estado : null
  const rango = rangoDias(filtros.dias)

  const salida = []
  for (const c of clientes || []) {
    if (texto && !normalizarBusqueda(`${c.clienteNombre || ''} ${c.identificacion || ''}`).includes(texto)) continue
    const facturas = (c.facturas || []).filter((f) => {
      if (estado && estadoFactura(f) !== estado) return false
      if (rango) {
        const [min, max] = rango
        if (f.diasRestantes === null || f.diasRestantes === undefined) return false
        if (min !== null && f.diasRestantes < min) return false
        if (max !== null && f.diasRestantes > max) return false
      }
      return true
    })
    if (facturas.length === 0) continue
    const totalSaldo = Math.round(facturas.reduce((s, f) => s + Number(f.saldo || 0), 0) * 100) / 100
    salida.push({ ...c, facturas, totalSaldo })
  }
  return salida
}

/**
 * Las tarjetas de arriba, sobre la cartera ENTERA (no sobre lo filtrado):
 * son las que se tocan para filtrar, y si cambiaran con el filtro dejarían
 * de decir cuánto hay en cada grupo.
 */
export function resumenDeudores(clientes) {
  let totalPorCobrar = 0
  let totalVencido = 0
  let totalFacturas = 0
  let proximasMonto = 0
  let proximasCantidad = 0
  for (const c of clientes || []) {
    for (const f of c.facturas || []) {
      const saldo = Number(f.saldo || 0)
      totalPorCobrar += saldo
      totalFacturas += 1
      if (estadoFactura(f) === 'VENCIDA') totalVencido += saldo
      if (f.diasRestantes !== null && f.diasRestantes !== undefined && f.diasRestantes >= 0 && f.diasRestantes <= 7) {
        proximasMonto += saldo
        proximasCantidad += 1
      }
    }
  }
  const r = (v) => Math.round(v * 100) / 100
  return {
    totalPorCobrar: r(totalPorCobrar),
    totalVencido: r(totalVencido),
    totalFacturas,
    totalClientes: (clientes || []).length,
    proximasAVencer: { monto: r(proximasMonto), cantidad: proximasCantidad }
  }
}
