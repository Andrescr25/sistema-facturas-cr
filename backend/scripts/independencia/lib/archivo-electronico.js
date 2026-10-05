/** Originales de ventas de Alegra. No emite, no carga facturas ni toca SQL. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseStringPromise, processors } = require('xml2js');
const { fechaValida } = require('./conciliacion-ventas');
const { getLectura } = require('./conciliacion-cobros');

class ErrorArchivo extends Error {}
const MAXIMO = 20 * 1024 * 1024;
// Hosts comprobados en los enlaces de fields=pdf,xml. Nunca mandar la
// autenticación de la API al CDN, ni seguir un enlace hacia la red local.
const HOSTS = new Set(['cdn.alegra.com', 'cdn1.alegra.com', 'cdn2.alegra.com', 'cdn3.alegra.com', 'alegra.s3.amazonaws.com']);
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const idValido = id => /^[1-9]\d*$/.test(String(id));

function urlArchivo(valor) {
  let url;
  try { url = new URL(typeof valor === 'string' ? valor : valor?.url); }
  catch { throw new ErrorArchivo('Alegra no entregó un enlace de archivo válido.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !HOSTS.has(url.hostname)) {
    throw new ErrorArchivo('El host de descarga no está reconocido; revisar sin publicar el enlace.');
  }
  return url;
}

/** GET sin credenciales y redirecciones revisadas una por una. */
async function descargarArchivo(valor, { http = require('axios'), esperar = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  // Solo GET y fallos transitorios: una conexión rota no deja pendientes
  // todos los documentos de una tanda, ni repite errores de datos o acceso.
  for (let intento = 0; intento < 3; intento++) {
    try { return await descargarIntento(valor, http); }
    catch (e) {
      if (!(e instanceof ErrorArchivo) || !e.transitorio || intento === 2) throw e;
      await esperar((intento + 1) * 1000);
    }
  }
}

async function descargarIntento(valor, http) {
  let url = urlArchivo(valor);
  for (let salto = 0; salto <= 3; salto++) {
    let respuesta;
    try {
      respuesta = await http.get(url.href, { responseType: 'arraybuffer', timeout: 30000,
        maxContentLength: MAXIMO, maxRedirects: 0, validateStatus: () => true });
    } catch (e) {
      const fallo = new ErrorArchivo('No se pudo descargar el archivo; reintentar conserva lo ya guardado.');
      fallo.transitorio = /ECONNABORTED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENETUNREACH/.test(e.code || '');
      throw fallo;
    }
    if ([301, 302, 303, 307, 308].includes(respuesta.status)) {
      if (!respuesta.headers?.location) break;
      url = urlArchivo(new URL(respuesta.headers.location, url).href);
      continue;
    }
    if (respuesta.status !== 200) {
      const fallo = new ErrorArchivo('El enlace de descarga no respondió 200.');
      fallo.transitorio = [429, 500, 502, 503, 504].includes(respuesta.status);
      throw fallo;
    }
    const buffer = Buffer.from(respuesta.data);
    if (!buffer.length || buffer.length > MAXIMO) throw new ErrorArchivo('Archivo vacío o demasiado grande.');
    return buffer;
  }
  throw new ErrorArchivo('La descarga redirigió demasiadas veces.');
}

function identidad(d, p = null) {
  if (!d || !idValido(d.id) || !fechaValida(d.date) || !['open', 'closed', 'void'].includes(d.status) ||
      d.numberTemplate?.isElectronic !== true) throw new ErrorArchivo('Factura electrónica con id, fecha o estado inválido.');
  if (!['invoice', 'saleTicket'].includes(d.numberTemplate?.documentType)) throw new ErrorArchivo('Tipo electrónico de venta no reconocido.');
  if (typeof d.numberTemplate?.fullNumber !== 'string' || !d.numberTemplate.fullNumber.trim()) throw new ErrorArchivo('Alegra no informó el número de la factura electrónica.');
  if (!/^\d{50}$/.test(d.stamp?.uuid || '')) throw new ErrorArchivo('Alegra no informó una clave fiscal de 50 dígitos.');
  if (p && (d.date < p.desde || d.date > p.hasta)) throw new ErrorArchivo('Alegra ignoró el período solicitado.');
  return { alegraId: String(d.id), numero: d.numberTemplate.fullNumber, fecha: d.date,
    tipo: d.numberTemplate.documentType, clave: d.stamp.uuid };
}

async function validarContenido(buffer, tipo, doc) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAXIMO) throw new ErrorArchivo('Archivo vacío o demasiado grande.');
  if (tipo === 'pdf') {
    if (!/^%PDF-\d\.\d/.test(buffer.subarray(0, 12).toString('ascii')) || !buffer.subarray(-2048).includes(Buffer.from('%%EOF'))) {
      throw new ErrorArchivo('La descarga no es un PDF completo.');
    }
    return;
  }
  let xml, datos;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Entidades no permitidas');
    datos = await parseStringPromise(xml, { explicitArray: false, tagNameProcessors: [processors.stripPrefix] });
  } catch { throw new ErrorArchivo('La descarga no es un XML admitido.'); }
  const raiz = doc.tipo === 'saleTicket' ? 'TiqueteElectronico' : 'FacturaElectronica';
  const factura = datos[raiz];
  // Se comprueba pertenencia y presencia de firma. No se presenta esto como
  // una validación criptográfica ni una consulta del estado de Hacienda.
  if (!factura || factura.Clave !== doc.clave || !factura.Signature) {
    throw new ErrorArchivo('El XML no coincide con la clave fiscal o no contiene la firma.');
  }
}

async function fueraDeGit(destino) {
  const padre = await fs.realpath(path.dirname(path.resolve(destino)));
  for (let dir = padre; ; dir = path.dirname(dir)) {
    try { await fs.lstat(path.join(dir, '.git')); throw new ErrorArchivo('Guardar comprobantes fuera de cualquier repositorio.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (dir === path.dirname(dir)) break;
  }
  return path.join(padre, path.basename(destino));
}

async function directorioPrivado(dir) {
  try { await fs.mkdir(dir, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const st = await fs.lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o077)) throw new ErrorArchivo('Usar una carpeta privada, sin enlaces, con permisos 0700.');
}

async function archivoRegular(nombre) {
  const st = await fs.lstat(nombre);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) || st.size > MAXIMO) {
    throw new ErrorArchivo('Un archivo del respaldo no es privado o regular.');
  }
  return fs.readFile(nombre);
}

/** fsync + enlace exclusivo: ni un archivo previo ni un enlace se pisan. */
async function guardarOriginal(nombre, buffer) {
  const temporal = `${nombre}.${crypto.randomUUID()}.tmp`;
  const f = await fs.open(temporal, 'wx', 0o600);
  try {
    await f.writeFile(buffer); await f.sync(); await f.close();
    try { await fs.link(temporal, nombre); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Recupera el caso de un cierre después de guardar, pero antes del
      // manifiesto. Solo adopta el archivo si sus bytes coinciden al descargar.
      if (hash(await archivoRegular(nombre)) !== hash(buffer)) throw new ErrorArchivo('Ya existe un original distinto; no se sobrescribió.');
    }
  } finally { await f.close().catch(() => {}); await fs.unlink(temporal); }
}

async function guardarManifiesto(destino, m) {
  const nombre = path.join(destino, 'manifiesto.json');
  const temporal = `${nombre}.${crypto.randomUUID()}.tmp`;
  const f = await fs.open(temporal, 'wx', 0o600);
  try {
    await f.writeFile(JSON.stringify(m, null, 2) + '\n'); await f.sync(); await f.close();
    await fs.rename(temporal, nombre);
  } finally { await f.close().catch(() => {}); await fs.unlink(temporal).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
}

async function comprobarGuardado(destino, registro, tipo, doc) {
  const esperado = `documentos/${doc.alegraId}.${tipo}`;
  if (registro.ruta !== esperado || !/^[a-f0-9]{64}$/.test(registro.sha256) || !Number.isSafeInteger(registro.bytes)) {
    throw new ErrorArchivo('Registro de archivo inválido en el manifiesto.');
  }
  const buffer = await archivoRegular(path.join(destino, esperado));
  if (buffer.length !== registro.bytes || hash(buffer) !== registro.sha256) throw new ErrorArchivo('Un original guardado cambió o está incompleto; no se sobrescribió.');
  await validarContenido(buffer, tipo, doc);
}

/** Una página corta vuelve a su offset real; no salta filas por asumir 30. */
async function leerInventario(client, p, aLaVez, avisar) {
  const filas = [], ids = new Set();
  for (let grupo = 0; grupo < 2000; grupo++) {
    const paginas = await Promise.all(Array.from({ length: aLaVez }, (_, i) =>
      getLectura(client, '/invoices', { ...(p ? { date_afterOrNow: p.desde, date_beforeOrNow: p.hasta } : {}),
        order_field: 'id', order_direction: 'ASC', start: filas.length + 30 * i, limit: 30 }, avisar)));
    for (const [indice, pagina] of paginas.entries()) {
      if (!pagina?.success || !Array.isArray(pagina.data) || pagina.data.length > 30) throw new ErrorArchivo('Lectura incompleta del historial; reanudar sin certificar.');
      if (pagina.data.length === 0) {
        if (paginas.slice(indice + 1).some(p => !p?.success || !Array.isArray(p.data) || p.data.length)) {
          throw new ErrorArchivo('El listado terminó y después devolvió datos o errores; no se certificó.');
        }
        return filas;
      }
      for (const d of pagina.data) {
        if (!idValido(d?.id) || ids.has(String(d.id)) || (filas.length && Number(d.id) <= Number(filas.at(-1).id))) {
          throw new ErrorArchivo('El listado cambió de orden o repitió ids; repetir con el origen sin cambios.');
        }
        ids.add(String(d.id)); filas.push(d);
      }
      // Las páginas especulativas posteriores se descartan: su offset pudo
      // saltar documentos si el servidor aplicó un límite menor al pedido.
      if (pagina.data.length < 30) break;
    }
    avisar(`/invoices: ${filas.length} documentos leídos`);
  }
  throw new ErrorArchivo('Historial demasiado extenso; lectura incompleta.');
}

async function archivar({ client, destino, p = null, aLaVez = 3, descargar = descargarArchivo, avisar = () => {} }) {
  if (!Number.isInteger(aLaVez) || aLaVez < 1 || aLaVez > 5) throw new ErrorArchivo('Concurrencia entre 1 y 5.');
  destino = await fueraDeGit(destino);
  await directorioPrivado(destino);
  const lock = path.join(destino, '.en-curso');
  let bloqueo;
  try { bloqueo = await fs.open(lock, 'wx', 0o600); }
  catch (e) { if (e.code === 'EEXIST') throw new ErrorArchivo('Ya hay una descarga o un bloqueo pendiente en esta carpeta.'); throw e; }
  let m;
  let escritura = Promise.resolve();
  // Varios documentos se descargan a la vez, pero el manifiesto tiene un
  // solo escritor. Una confirmación anterior no pisa la de otra factura.
  const salvar = () => (escritura = escritura.then(() => guardarManifiesto(destino, m)));
  try {
    await bloqueo.writeFile(String(process.pid)); await bloqueo.close();
    try { m = JSON.parse((await archivoRegular(path.join(destino, 'manifiesto.json'))).toString('utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new ErrorArchivo('No se pudo leer el manifiesto existente; no se reemplazó.'); }
    if (m && (m.version !== 1 || m.origen !== 'alegra-ventas' || JSON.stringify(m.periodo) !== JSON.stringify(p) ||
        !m.documentos || Array.isArray(m.documentos))) throw new ErrorArchivo('El manifiesto pertenece a otro alcance o versión.');
    if (!m) {
      if ((await fs.readdir(destino)).some(n => n !== '.en-curso')) throw new ErrorArchivo('La carpeta tiene otros archivos; elegir una carpeta nueva.');
      m = { version: 1, origen: 'alegra-ventas', periodo: p, documentos: {}, completo: false };
    }
    await directorioPrivado(path.join(destino, 'documentos'));
    m.completo = false; m.lectura = { iniciadaEn: new Date().toISOString() }; m.fallos = [];
    await salvar();
    const listado = await leerInventario(client, p, aLaVez, avisar);
    const seleccion = [];
    let candidatas = 0;
    for (const d of listado) {
      if (!idValido(d?.id) || !fechaValida(d.date) || (p && (d.date < p.desde || d.date > p.hasta))) throw new ErrorArchivo('Listado de facturas fuera del alcance o inválido.');
      if (d.status === 'draft') continue; // No fue emitida y Alegra no ofrece su PDF.
      if (typeof d.numberTemplate?.isElectronic !== 'boolean') throw new ErrorArchivo('El listado no informa si la factura es electrónica.');
      if (d.numberTemplate.isElectronic) {
        candidatas++;
        try { seleccion.push(identidad(d, p)); }
        catch (e) {
          if (!(e instanceof ErrorArchivo)) throw e;
          // Un listado histórico puede omitir la clave. Pedir la ficha
          // antes de declarar el original pendiente, sin inventarle datos.
          const r = await getLectura(client, `/invoices/${d.id}`, { fields: 'pdf,xml' }, avisar);
          try {
            if (!r?.success || String(r.data?.id) !== String(d.id) || r.data?.date !== d.date ||
                (d.numberTemplate.fullNumber != null && r.data?.numberTemplate?.fullNumber !== d.numberTemplate.fullNumber)) throw new ErrorArchivo('No se pudo confirmar la identidad en el detalle.');
            seleccion.push(identidad(r.data, p));
          } catch (fallo) {
            if (!(fallo instanceof ErrorArchivo)) throw fallo;
            m.fallos.push({ alegraId: String(d.id), motivo: fallo.message });
          }
        }
      }
    }
    m.seleccion = seleccion.map(d => d.alegraId);
    m.fueraDeLectura = Object.keys(m.documentos).filter(id => !m.seleccion.includes(id));
    m.resumen = { facturasLeidas: listado.length, electronicas: candidatas, archivadas: 0, reutilizadas: 0, bytes: 0 };
    await salvar();
    const guardarDocumento = async doc => {
      try {
        let existente = m.documentos[doc.alegraId];
        if (existente && JSON.stringify(existente.identidad) !== JSON.stringify(doc)) throw new ErrorArchivo('Cambió la identidad de una factura archivada; revisar sus originales.');
        if (!existente) { existente = m.documentos[doc.alegraId] = { identidad: doc, archivos: {} }; await salvar(); }
        for (const tipo of ['pdf', 'xml']) if (existente.archivos[tipo]) await comprobarGuardado(destino, existente.archivos[tipo], tipo, doc);
        if (existente.archivos.pdf && existente.archivos.xml) m.resumen.reutilizadas++;
        else {
          const r = await getLectura(client, `/invoices/${doc.alegraId}`, { fields: 'pdf,xml' }, avisar);
          if (!r?.success) {
            const estado = Number.isInteger(r?.status) && r.status >= 100 && r.status <= 599 ? ` (HTTP ${r.status})` : '';
            throw new ErrorArchivo(`No se pudo consultar el detalle del original${estado}; reintentar conserva lo ya guardado.`);
          }
          if (JSON.stringify(identidad(r.data, p)) !== JSON.stringify(doc)) throw new ErrorArchivo('El detalle no coincide con el listado; no se certificó esa factura.');
          for (const tipo of ['pdf', 'xml']) if (!existente.archivos[tipo]) {
            const buffer = await descargar(urlArchivo(r.data[tipo]).href);
            await validarContenido(buffer, tipo, doc);
            const ruta = `documentos/${doc.alegraId}.${tipo}`;
            await guardarOriginal(path.join(destino, ruta), buffer);
            existente.archivos[tipo] = { ruta, bytes: buffer.length, sha256: hash(buffer) };
            // Cada original confirmado sobrevive aunque el segundo falle.
            await salvar();
          }
        }
        m.resumen.archivadas++; m.resumen.bytes += existente.archivos.pdf.bytes + existente.archivos.xml.bytes;
      } catch (e) {
        if (!(e instanceof ErrorArchivo)) throw e;
        m.fallos.push({ alegraId: doc.alegraId, motivo: e.message });
      }
      if ((m.resumen.archivadas + m.fallos.length) % 20 === 0) avisar(`Originales: ${m.resumen.archivadas}/${seleccion.length}; fallos: ${m.fallos.length}`);
      await salvar();
    };
    let siguiente = 0, fatal;
    const trabajador = async () => {
      while (!fatal && siguiente < seleccion.length) {
        const doc = seleccion[siguiente++];
        try { await guardarDocumento(doc); } catch (e) { fatal = e; }
      }
    };
    // Se espera incluso al trabajador que sigue descargando cuando otro
    // falla. El bloqueo no se libera con escritores todavía activos.
    await Promise.allSettled(Array.from({ length: aLaVez }, trabajador));
    if (fatal) throw fatal;
    m.lectura.terminadaEn = new Date().toISOString();
    m.completo = m.fallos.length === 0 && m.fueraDeLectura.length === 0 && m.resumen.archivadas === seleccion.length;
    await salvar();
    return m;
  } finally { await bloqueo.close().catch(() => {}); await fs.unlink(lock); }
}

module.exports = { ErrorArchivo, archivar, identidad, validarContenido, urlArchivo, descargarArchivo, hash, fueraDeGit };
