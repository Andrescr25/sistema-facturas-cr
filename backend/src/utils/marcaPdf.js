/**
 * La marca, para los PDF que salen del sistema.
 *
 * Vivía dentro de orders-whatsapp.service.js, que genera la orden de compra.
 * Al hacer el PDF de las cotizaciones había que elegir entre copiar los
 * colores —y que se separen el día que alguien retoque uno— o sacarlos acá.
 *
 * Los colores están muestreados de los píxeles del logo: el naranja es el
 * único acento y se reserva para lo que hay que ver primero.
 */

const path = require('path');
const { diaDeBase } = require('./fechaCR');

const MARCA = {
  naranja: '#E9501C',
  naranjaSuave: '#FDEEE8',
  naranjaOscuro: '#B0410F',
  gris: '#616161',
  tinta: '#1A1A1A',
  grisSuave: '#8A8A8A',
  linea: '#E4E4E4',
  cebra: '#FAFAFA',
  panel: '#F5F5F5'
};

const LOGO = path.join(__dirname, '../../assets/logo-tachi.png');
const LOGO_RATIO = 276 / 1000; // alto/ancho del PNG original

/**
 * La Helvetica que trae pdfkit NO tiene el símbolo del colón (₡, U+20A1):
 * imprime `¡` en su lugar. El primer PDF de cotización salió con todos los
 * montos como "¡29.296".
 *
 * DejaVu sí lo tiene y su licencia permite redistribuirla, así que va en el
 * repo — no se toma del sistema operativo porque el contenedor de Render no
 * tiene las mismas fuentes que un Mac. Ver assets/fuentes/POR-QUE.md.
 */
const FUENTES = {
  normal: path.join(__dirname, '../../assets/fuentes/DejaVuSans.ttf'),
  negrita: path.join(__dirname, '../../assets/fuentes/DejaVuSans-Bold.ttf')
};

/** Registra las fuentes en un documento y devuelve sus nombres. */
function registrarFuentes(doc) {
  const fs = require('fs');
  if (fs.existsSync(FUENTES.normal) && fs.existsSync(FUENTES.negrita)) {
    doc.registerFont('cuerpo', FUENTES.normal);
    doc.registerFont('cuerpoNegrita', FUENTES.negrita);
    return { normal: 'cuerpo', negrita: 'cuerpoNegrita' };
  }
  // Sin las fuentes el documento sale igual, solo que el ₡ se ve mal. Mejor
  // eso que no generar el PDF.
  console.warn('⚠️ No se encontraron las fuentes DejaVu: el símbolo ₡ puede verse mal en el PDF.');
  return { normal: 'Helvetica', negrita: 'Helvetica-Bold' };
}

/** Los datos del negocio que van al pie de cada documento. */
const NEGOCIO = {
  nombre: 'Distribuidora Tachi',
  cedula: '204050474',
  telefono: '8647 7036',
  email: 'tachifacturas@gmail.com',
  direccion: 'Rincón de Zaragoza, Palmares, Alajuela'
};

/** ₡1.234.567, con el punto de miles y sin el espacio duro de es-CR. */
function colones(n) {
  const entero = Math.round(Number(n) || 0);
  return `₡${entero.toLocaleString('es-CR').replace(/ /g, '.')}`;
}

/** Igual, pero con dos decimales para precios unitarios. */
function colonesExacto(n) {
  const v = Number(n) || 0;
  return `₡${v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, '.')}`;
}

/**
 * "10 de setiembre de 2026".
 *
 * Acepta texto ("2026-09-10") y también un Date, que es como Postgres
 * devuelve las columnas DATE. Recortar `String(unDate)` a diez caracteres da
 * "Wed Sep 10", y de ahí salía un "Invalid Date" impreso donde va la fecha de
 * la factura. Las cotizaciones no lo notaron porque sus fechas vienen de
 * Alegra como texto.
 */
const fechaLarga = (f) => {
  if (!f) return '';
  // De un Date se leen sus partes LOCALES (diaDeBase): pasar por toISOString
  // lo corre a UTC y en Costa Rica (−6) una fecha a medianoche cambia de día.
  const iso = diaDeBase(f);
  if (!iso) return String(f);
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return String(f);
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * El medio de pago, en español.
 *
 * Las 5.398 facturas copiadas lo guardan como lo llama Alegra ("cash",
 * "transfer"), y al reimprimir una el cliente leía un tecnicismo en inglés.
 * Las nuevas ya nacen con el nombre de nuestro catálogo.
 */
const MEDIOS = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  'credit-card': 'Tarjeta de crédito',
  'debit-card': 'Tarjeta de débito',
  check: 'Cheque',
  sinpe_movil: 'SINPE Móvil'
};

function medioDePago(valor) {
  if (!valor) return null;
  const clave = String(valor).trim().toLowerCase();
  if (MEDIOS[clave]) return MEDIOS[clave];
  return String(valor).charAt(0).toUpperCase() + String(valor).slice(1).toLowerCase();
}

module.exports = {
  MARCA, LOGO, LOGO_RATIO, NEGOCIO, FUENTES, registrarFuentes, colones, colonesExacto, fechaLarga, medioDePago
};
