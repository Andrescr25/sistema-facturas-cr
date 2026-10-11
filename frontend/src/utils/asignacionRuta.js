/**
 * Las cuentas de "Asignar clientes" de una ruta, sin nada de pantalla.
 * SIN IMPORTS: backend/tests/asignacionRutaPantalla.test.js lo importa tal cual.
 *
 * LA MARCA ES UN CAMBIO, NO UN ESTADO. Cada cliente está o no está en la
 * ruta; tocarlo dice "quiero lo contrario de lo que hay", y tocarlo de nuevo
 * deshace el toque. Por eso lo que se guarda es un mapa `id → de dónde lo
 * vi` (su ruta al momento de tocarlo; null = sin ruta), en el orden en que
 * se tocaron:
 *
 *   · si venía de ESTA ruta, la marca lo saca;
 *   · si venía de otra o de ninguna, la marca lo trae.
 *
 * El "de dónde lo vi" viaja al servidor: si entre tanto alguien lo movió, el
 * servidor no pisa ese cambio. Y el orden de los toques es el orden en que
 * entran al recorrido.
 */

/** Sin acentos ni mayúsculas: "Orotiná" se encuentra tecleando "orotina". */
const plano = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** 'esta' | 'otra' | 'sin-ruta' — dónde está el cliente HOY, antes de cualquier marca. */
export function estadoDe(cliente, rutaId) {
  if (cliente.ruta_id === null || cliente.ruta_id === undefined) return 'sin-ruta'
  return Number(cliente.ruta_id) === Number(rutaId) ? 'esta' : 'otra'
}

/**
 * Dónde queda el cliente, para leerlo en la tarjeta. Quien arma las rutas
 * las conoce por lugar, no por nombre.
 */
export function lugarDe(cliente) {
  const zona = [cliente.distrito, cliente.canton].map(v => String(v || '').trim()).filter(Boolean)
  // "Orotina, Orotina" no dice dos cosas.
  const sinRepetir = zona.filter((v, i) => zona.findIndex(o => plano(o) === plano(v)) === i)
  return sinRepetir.join(', ') || String(cliente.provincia || '').trim() || ''
}

/** ¿El cliente coincide con lo tecleado? Busca en el nombre Y en el lugar. */
export function coincide(cliente, busqueda) {
  const palabras = plano(busqueda).split(/\s+/).filter(Boolean)
  if (!palabras.length) return true
  const texto = plano([cliente.nombre, cliente.canton, cliente.distrito, cliente.barrio,
    cliente.otras_senas, cliente.provincia, cliente.ruta_nombre].filter(Boolean).join(' '))
  return palabras.every(p => texto.includes(p))
}

/** Tocar un cliente: pone la marca, o la quita si ya la tenía. Devuelve OTRO mapa. */
export function alternar(marcas, cliente) {
  const nuevas = new Map(marcas)
  if (nuevas.has(cliente.id)) nuevas.delete(cliente.id)
  else nuevas.set(cliente.id, cliente.ruta_id ?? null)
  return nuevas
}

/** ¿Va a quedar en la ruta cuando se guarde? */
export function quedaEnRuta(marcas, cliente, rutaId) {
  const esta = estadoDe(cliente, rutaId) === 'esta'
  return marcas.has(cliente.id) ? !esta : esta
}

/**
 * Marcar de una vez todos los de la lista que todavía no están ni marcados.
 * No toca los que ya están en la ruta (no hay nada que cambiarles) ni
 * desmarca los que se van a sacar.
 */
export function marcarTodos(marcas, visibles, rutaId) {
  const nuevas = new Map(marcas)
  for (const c of visibles) {
    if (estadoDe(c, rutaId) !== 'esta' && !nuevas.has(c.id)) nuevas.set(c.id, c.ruta_id ?? null)
  }
  return nuevas
}

/** Cuántos de la lista se marcarían con "marcar todos". */
export function porMarcar(marcas, visibles, rutaId) {
  return visibles.filter(c => estadoDe(c, rutaId) !== 'esta' && !marcas.has(c.id)).length
}

/**
 * Lo que se le manda al servidor, y lo que hay que avisarle a la persona.
 * `movidos` son los que dejan OTRA ruta: eso se confirma antes de guardar.
 */
export function cambiosDe(marcas, clientes, rutaId) {
  const ficha = new Map(clientes.map(c => [c.id, c]))
  const agregar = []
  const quitar = []
  const movidos = []
  for (const [id, desde] of marcas) {
    const c = ficha.get(id)
    if (!c) continue
    if (desde !== null && Number(desde) === Number(rutaId)) quitar.push(id)
    else {
      agregar.push({ clienteId: id, desdeRutaId: desde ?? null })
      if (desde !== null) movidos.push(c)
    }
  }
  return { agregar, quitar, movidos, total: agregar.length + quitar.length }
}

/**
 * Después de recargar la lista: se conservan solo las marcas que siguen
 * siendo ciertas. Si alguien movió al cliente mientras tanto, esa marca ya
 * no dice lo que la persona vio y se suelta.
 */
export function marcasVigentes(marcas, clientes) {
  const ficha = new Map(clientes.map(c => [c.id, c]))
  const vigentes = new Map()
  for (const [id, desde] of marcas) {
    const c = ficha.get(id)
    if (c && (c.ruta_id ?? null) === (desde ?? null)) vigentes.set(id, desde)
  }
  return vigentes
}

/** "3 agregados · 1 quitado", para el aviso de que ya quedó guardado. */
export function hechoDe({ agregar, quitar }) {
  const partes = []
  if (agregar.length) partes.push(`${agregar.length} ${agregar.length === 1 ? 'agregado' : 'agregados'}`)
  if (quitar.length) partes.push(`${quitar.length} ${quitar.length === 1 ? 'quitado' : 'quitados'}`)
  return partes.join(' · ')
}

/** "3 se agregan · 1 se quita", para la barra de guardar. */
export function resumenDe({ agregar, quitar }) {
  const partes = []
  if (agregar.length) partes.push(`${agregar.length} ${agregar.length === 1 ? 'se agrega' : 'se agregan'}`)
  if (quitar.length) partes.push(`${quitar.length} ${quitar.length === 1 ? 'se quita' : 'se quitan'}`)
  return partes.join(' · ')
}
