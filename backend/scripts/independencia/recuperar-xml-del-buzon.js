/**
 * Recupera del buzón los XML de facturas y notas de crédito de proveedor que
 * ya se recibieron pero nunca se guardaron (bloqueo/el-xml-no-se-guarda).
 *
 * SOLO LEE, con `markSeen: false` — ningún correo se marca ni se toca. LEE
 * de Gmail y ESCRIBE en la base local y en `backend/almacenamiento-privado/`.
 * Se puede correr las veces que haga falta: una fila que ya tiene `xml_ruta`
 * se salta.
 *
 * NECESITA UNA LLAVE EXPLÍCITA que no es `PERMITIR_SALIDAS`: el buzón no es
 * un canal de salida, es uno que esta rama COMPARTE con producción, y el
 * riesgo real es competir con el monitoreo de `main` sobre el mismo correo.
 * Ver config/aislado.js → lecturaBuzonPermitida().
 *
 *   PERMITIR_LECTURA_BUZON=true node scripts/independencia/recuperar-xml-del-buzon.js [--limite=50]
 *
 * Busca por el NOMBRE del adjunto (`archivo_xml`), no por `email_id`: ese es
 * un número de secuencia IMAP, posicional y volátil, y 69 de 862 facturas ni
 * lo tienen. Usa la búsqueda extendida de Gmail (`X-GM-RAW filename:...`),
 * que no es parte del estándar IMAP pero es lo único que busca por nombre de
 * adjunto sin bajar el buzón entero.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const aislado = require('../../config/aislado');
if (!aislado.lecturaBuzonPermitida()) {
  console.error('✗ No se puede leer el buzón sin PERMITIR_LECTURA_BUZON=true (ver config/aislado.js).');
  console.error('  Es una llave A PROPÓSITO: el buzón es el mismo que usa producción.');
  process.exit(1);
}

const Imap = require('imap');
const { simpleParser } = require('mailparser');
const imapConfig = require('../../config/imap');
const { pool } = require('../../config/database');
const almacenamiento = require('../../src/integrations/almacenamiento');
const { recuperarXmlDelBuzon } = require('../../src/modules/compras/recuperarXmlDelBuzon');

const argumento = (nombre) => {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado ? Number(encontrado.split('=')[1]) : null;
};

/** Abre la conexión IMAP y deja el buzón (INBOX) listo para buscar. */
function conectar() {
  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    imap.once('error', reject);
    imap.once('ready', () => {
      imap.openBox('INBOX', true, (error) => { // true = solo lectura
        if (error) return reject(error);
        resolve(imap);
      });
    });
    imap.connect();
  });
}

/**
 * Busca por el nombre exacto del adjunto con la búsqueda extendida de
 * Gmail. Devuelve UIDs, los más recientes primero: un nombre repetido entre
 * proveedores es más probable que se resuelva con el correo más reciente,
 * pero `recuperarUno` de todos modos verifica la clave antes de aceptar.
 */
function buscarPorArchivo(imap) {
  return (nombreArchivo) => new Promise((resolve, reject) => {
    // Comillas dobles escapadas: X-GM-RAW es una cadena de búsqueda de Gmail,
    // no un criterio IMAP estándar, y `filename:` con espacios necesita ir
    // entre comillas para no partirse en varios términos.
    const consulta = `filename:"${nombreArchivo.replace(/"/g, '')}"`;
    imap.search([['X-GM-RAW', consulta]], (error, uids) => {
      if (error) return reject(error);
      resolve((uids || []).slice().reverse());
    });
  });
}

/** Baja un mensaje por UID y lo parsea. Devuelve sus adjuntos. */
function bajarAdjunto(imap) {
  return (uid) => new Promise((resolve, reject) => {
    const fetch = imap.fetch([uid], { bodies: '', markSeen: false });
    let procesado = false;
    fetch.on('message', (msg) => {
      msg.on('body', (stream) => {
        simpleParser(stream, (error, parsed) => {
          if (error) return reject(error);
          procesado = true;
          resolve(parsed.attachments || []);
        });
      });
    });
    fetch.once('error', reject);
    fetch.once('end', () => {
      if (!procesado) resolve([]); // el mensaje no tenía cuerpo que parsear
    });
  });
}

async function main() {
  console.log('🔌 Conectando al buzón (solo lectura, PERMITIR_LECTURA_BUZON=true)...');
  const imap = await conectar();
  console.log('✓ Conectado.\n');

  const dependencias = {
    pool,
    almacenamiento,
    buscarPorArchivo: buscarPorArchivo(imap),
    bajarAdjunto: bajarAdjunto(imap),
    limite: argumento('limite'),
    avisar: (texto) => console.log(texto)
  };

  console.log('📄 Facturas de proveedor...');
  const facturas = await recuperarXmlDelBuzon({ ...dependencias, tabla: 'facturas_proveedores' });

  console.log('\n💳 Notas de crédito de proveedor...');
  const notas = await recuperarXmlDelBuzon({ ...dependencias, tabla: 'nota_credito_proveedor' });

  imap.end();

  for (const [nombre, r] of [['Facturas', facturas], ['Notas de crédito', notas]]) {
    console.log(`\n${nombre}: ${r.recuperado} de ${r.total} recuperados (${(r.bytes / 1024).toFixed(0)} KB).`);
    if (r.no_encontrado) console.log(`  ${r.no_encontrado} no aparecieron en el buzón (correo borrado, o llegó por otro canal).`);
    if (r.no_coincide_con_clave) console.log(`  ${r.no_coincide_con_clave} tenían un adjunto con ese nombre, pero de otro comprobante.`);
    if (r.sin_nombre_de_archivo) console.log(`  ${r.sin_nombre_de_archivo} no tienen ni el nombre del archivo guardado — no hay por dónde buscarlos.`);
    if (r.fallo_busqueda || r.fallo_guardado || r.fallo_actualizacion) {
      console.log(`  Fallos: ${r.fallo_busqueda || 0} al buscar, ${r.fallo_guardado || 0} al guardar, ${r.fallo_actualizacion || 0} al actualizar.`);
      for (const d of r.detalle.filter((x) => x.motivo).slice(0, 10)) console.log(`    ${d.id}: ${d.motivo}`);
    }
  }

  console.log('\nSe puede volver a correr: lo ya recuperado (xml_ruta IS NOT NULL) se salta.');
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se pudo recuperar del buzón:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
