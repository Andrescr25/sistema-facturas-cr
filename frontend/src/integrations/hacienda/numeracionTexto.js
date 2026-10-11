/**
 * Lo que dice el bloque "Numeración" de Configuración → Hacienda.
 * SIN IMPORTS: backend/tests/haciendaNumeracion.test.js lo importa tal cual.
 */

/** "4902, 4946 y 4947" */
export function enLista(numeros) {
  const n = (numeros || []).map(String)
  if (n.length <= 1) return n.join('')
  return `${n.slice(0, -1).join(', ')} y ${n.at(-1)}`
}

/**
 * Los números ya usados que quedan por delante: se saltan solos. Se dice para
 * que nadie se asuste al ver que después del 4901 sale el 4903.
 */
export function avisoDeUsados({ usadosAdelante = 0, primerosUsados = [] } = {}) {
  if (!usadosAdelante) return ''
  if (usadosAdelante === 1) return `El ${primerosUsados[0]} ya está usado: se salta solo.`
  const resto = usadosAdelante - primerosUsados.length
  return resto > 0
    ? `Ya usados más adelante: ${primerosUsados.join(', ')} y ${resto} más. Se saltan solos.`
    : `Ya usados más adelante: ${enLista(primerosUsados)}. Se saltan solos.`
}

/** Lo escrito en el campo → '' si sirve, o por qué no. */
export function numeroEscrito(valor, proximo) {
  const texto = String(valor ?? '').trim()
  if (!texto) return 'Escribí el número.'
  if (!/^\d{1,10}$/.test(texto) || Number(texto) < 1) return 'Tiene que ser un número entero, sin puntos ni letras.'
  if (String(Number(texto)) === String(proximo)) return 'Ese ya es el próximo número.'
  return ''
}
