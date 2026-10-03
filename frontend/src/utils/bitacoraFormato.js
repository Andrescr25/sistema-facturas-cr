/**
 * Cómo se lee una línea de la bitácora.
 *
 * SIN IMPORTS A PROPÓSITO: lo carga `bitacoraFormato.test.js` desde el backend
 * con `new Function`, igual que `rentabilidadFormato.js`. Una sola línea
 * `import` acá rompe esa prueba.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/**
 * 'AAAA-MM-DD HH:MM:SS' → '10 mar 2031, 9:15 a. m.'
 *
 * Se arma a mano, sin `new Date(texto)`: la columna no lleva zona horaria y
 * el navegador la correría según dónde esté. Lo guardado es la hora de acá.
 */
export function fechaHora(cuando) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(cuando || ''))
  if (!m) return ''
  const [, anio, mes, dia, hora, minuto] = m
  const h = Number(hora)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${Number(dia)} ${MESES[Number(mes) - 1]} ${anio}, ${h12}:${minuto} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/** Los campos con nombre propio; el resto se lee de su nombre técnico. */
const CAMPOS = {
  precio_sin_iva: 'Precio sin IVA',
  costo_con_iva: 'Costo con IVA',
  impuesto_id: 'Impuesto',
  categoria_id: 'Categoría',
  subcategoria_id: 'Subcategoría',
  plazo_credito_id: 'Plazo de crédito',
  limite_credito: 'Límite de crédito',
  tipo_identificacion: 'Tipo de identificación',
  identificacion: 'Identificación',
  telefono_whatsapp: 'WhatsApp',
  imagen_url: 'Foto',
  cabys: 'CABYS',
  alegra_id: 'Id en Alegra',
  activo: 'Activo',
  oculto: 'Oculto en los catálogos'
}

export function nombreDeCampo(campo) {
  if (CAMPOS[campo]) return CAMPOS[campo]
  const texto = String(campo || '').replace(/_id$/, '').replace(/_/g, ' ').trim()
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : ''
}

/** Un valor de la foto, para una persona: sí/no en vez de true/false. */
export function valorLegible(valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (valor === 'true') return 'Sí'
  if (valor === 'false') return 'No'
  return String(valor)
}

/** "José Andrés editó el producto TUBO PVC 1/2". */
export function frase(linea) {
  const que = linea.titulo || `#${linea.entidadId}`
  return `${linea.usuarioNombre} ${linea.accionVerbo} · ${linea.entidadNombre} ${que}`
}

/**
 * El tono de cada acción, con los roles de color del sistema: crear es bueno,
 * anular o borrar es lo que hay que poder encontrar rápido.
 */
export function tonoDeAccion(accion) {
  if (accion === 'crear' || accion === 'activar' || accion === 'facturar') return 'bg-exito-100 text-exito-700'
  if (accion === 'anular' || accion === 'borrar' || accion === 'desactivar') return 'bg-peligro-100 text-peligro-700'
  if (accion === 'editar') return 'bg-primario-100 text-primario-700'
  return 'bg-neutro-100 text-neutro-600'
}
