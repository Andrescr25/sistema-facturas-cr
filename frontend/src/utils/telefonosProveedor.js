export const MAX_TELEFONOS_PROVEEDOR = 10

/** Una fila representa un destino. No pegar números ni rescatar dígitos de
 * anotaciones: se muestra y confirma a quién llega el pedido. */
export function revisarTelefonoProveedor(valor) {
  const texto = String(valor ?? '').trim()
  if (!texto) return { error: 'Escribí el número de WhatsApp.' }
  if (!/^\+?[\d \t().-]+$/.test(texto)) return { error: 'Escribí un solo número, sin nombres ni anotaciones.' }
  const digitos = texto.replace(/[ \t().-]/g, '').replace(/^\+/, '')
  const nacional = digitos.length === 11 && digitos.startsWith('506') ? digitos.slice(3) : digitos
  if (!/^\d{8}$/.test(nacional)) return { error: 'Usá un número de Costa Rica de 8 dígitos, con +506 opcional.' }
  return { numero: `506${nacional}`, nacional, formateado: `${nacional.slice(0, 4)} ${nacional.slice(4)}` }
}

export function filasTelefonosProveedor(valor) {
  return String(valor ?? '').split(/\r?\n/).map(t => t.trim()).filter(Boolean)
}

export function revisarTelefonosProveedor(filas) {
  const usados = new Set(), errores = [], numeros = []
  for (const fila of filas) {
    if (!String(fila).trim()) { errores.push(''); continue }
    const telefono = revisarTelefonoProveedor(fila)
    const error = telefono.error || (usados.has(telefono.numero) ? 'Este número ya está registrado.' : '')
    errores.push(error)
    if (!error) { usados.add(telefono.numero); numeros.push(telefono.formateado) }
  }
  const error = filas.length > MAX_TELEFONOS_PROVEEDOR ? `Podés registrar hasta ${MAX_TELEFONOS_PROVEEDOR} números.` : errores.find(Boolean) || ''
  return { valor: numeros.join('\n') || null, errores, error }
}
