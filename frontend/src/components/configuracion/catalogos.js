import { Percent, CreditCard, Calendar, Wallet } from 'lucide-react'

/**
 * Los cuatro catálogos de Configuración, descritos una sola vez.
 *
 * La tabla y el formulario son los mismos para los cuatro: lo que cambia es
 * esta descripción. Agregar un campo es agregarlo acá (y a la lista blanca
 * del servidor), no copiar otra pantalla.
 */

export const TIPOS_IMPUESTO = {
  general: 'General',
  reducido: 'Reducido',
  transitorio: 'Transitorio',
  exento: 'Exento',
  sin_credito: 'Sin derecho a crédito',
  bienes_usados: 'Bienes usados'
}

export const TIPOS_CUENTA = {
  efectivo: 'Efectivo',
  banco: 'Banco',
  tarjeta_credito: 'Tarjeta de crédito'
}

const opciones = (mapa) => Object.entries(mapa).map(([valor, texto]) => ({ valor, texto }))
const numero = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 2 })

export const CATALOGOS = [
  {
    clave: 'impuestos',
    datos: 'impuestos',
    texto: 'Impuestos',
    singular: 'impuesto',
    uno: 'un impuesto',
    icono: Percent,
    descripcion: 'Tarifas de IVA. La tarifa se guarda como número y nunca se deduce de un código.',
    columnas: [
      { campo: 'nombre', titulo: 'Nombre', principal: true },
      { campo: 'tarifa', titulo: 'Tarifa', formato: v => `${numero.format(Number(v))} %` },
      { campo: 'tipo', titulo: 'Tipo', formato: v => TIPOS_IMPUESTO[v] || v }
    ],
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 80 },
      { campo: 'tarifa', etiqueta: 'Tarifa (%)', tipo: 'numero', requerido: true, min: 0, max: 100, paso: '0.01' },
      { campo: 'tipo', etiqueta: 'Tipo', tipo: 'opcion', requerido: true, opciones: opciones(TIPOS_IMPUESTO) }
    ],
    nuevo: { nombre: '', tarifa: '', tipo: 'reducido' }
  },
  {
    clave: 'metodos-pago',
    datos: 'metodosPago',
    texto: 'Métodos de pago',
    singular: 'método de pago',
    uno: 'un método de pago',
    icono: CreditCard,
    descripcion: 'Con qué se puede pagar. Los que piden referencia obligan a anotar el número del comprobante.',
    columnas: [
      { campo: 'nombre', titulo: 'Nombre', principal: true },
      { campo: 'clave', titulo: 'Clave' },
      { campo: 'pide_referencia', titulo: 'Referencia', formato: v => (v ? 'La pide' : 'No') }
    ],
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 60 },
      { campo: 'clave', etiqueta: 'Clave interna', tipo: 'texto', requerido: true, max: 30, ayuda: 'Minúsculas, números y guion bajo. Por ejemplo: sinpe_movil' },
      { campo: 'pide_referencia', etiqueta: 'Pide el número de comprobante', tipo: 'si_no' },
      { campo: 'orden', etiqueta: 'Orden en las listas', tipo: 'numero', min: 0, max: 999, paso: '1' }
    ],
    nuevo: { nombre: '', clave: '', pide_referencia: false, orden: 10 }
  },
  {
    clave: 'plazos',
    datos: 'plazos',
    texto: 'Plazos',
    singular: 'plazo',
    uno: 'un plazo',
    icono: Calendar,
    descripcion: 'Plazos de crédito que se le pueden dar a un cliente.',
    columnas: [
      { campo: 'nombre', titulo: 'Nombre', principal: true },
      { campo: 'dias', titulo: 'Días', formato: v => (Number(v) === 0 ? 'Contado' : `${v} días`) }
    ],
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 40 },
      { campo: 'dias', etiqueta: 'Días', tipo: 'numero', requerido: true, min: 0, max: 3650, paso: '1' }
    ],
    nuevo: { nombre: '', dias: '' }
  },
  {
    clave: 'cuentas',
    datos: 'cuentas',
    texto: 'Cuentas de dinero',
    singular: 'cuenta',
    uno: 'una cuenta',
    icono: Wallet,
    descripcion: 'Dónde entra y sale la plata: cajas, bancos y tarjetas.',
    columnas: [
      { campo: 'nombre', titulo: 'Nombre', principal: true },
      { campo: 'tipo', titulo: 'Tipo', formato: v => TIPOS_CUENTA[v] || v },
      { campo: 'numero', titulo: 'Número', formato: v => v || '—' }
    ],
    campos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, max: 80 },
      { campo: 'tipo', etiqueta: 'Tipo', tipo: 'opcion', requerido: true, opciones: opciones(TIPOS_CUENTA) },
      { campo: 'numero', etiqueta: 'Número de cuenta o SINPE', tipo: 'texto', max: 60 },
      { campo: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', max: 500 },
      { campo: 'saldo_inicial', etiqueta: 'Saldo inicial', tipo: 'numero', min: -1000000000000, max: 1000000000000, paso: '0.01' }
    ],
    nuevo: { nombre: '', tipo: 'efectivo', numero: '', descripcion: '', saldo_inicial: 0 }
  }
]

export const catalogoPorClave = (clave) => CATALOGOS.find(c => c.clave === clave)
