/**
 * Recupera, desde el buzón, los XML de facturas y notas de crédito de
 * proveedor que ya se recibieron pero nunca se guardaron.
 *
 * NO SE BUSCA POR `email_id`. Es un número de secuencia IMAP —posicional y
 * volátil: cambia si se borra cualquier correo anterior— y 69 de 862
 * facturas ni siquiera lo tienen. La llave es `archivo_xml`, el NOMBRE real
 * del adjunto, que sí se guardó desde el día uno; se verifica después contra
 * `clave` (única en las 862), porque dos proveedores distintos pueden mandar
 * el adjunto con el mismo nombre genérico ("factura.xml").
 *
 * PURO EN LO QUE IMPORTA: `buscarPorArchivo` y `bajarAdjunto` se reciben
 * inyectados, así que esto se prueba sin abrir una conexión IMAP real. La
 * implementación de verdad —la que sí habla con Gmail— vive en
 * `scripts/independencia/recuperar-xml-del-buzon.js`, que es el único lugar
 * que de verdad toca el buzón.
 *
 * REINTENTABLE: solo se procesan filas con `xml_ruta IS NULL`. Una segunda
 * corrida no vuelve a tocar lo que ya se recuperó.
 */

const TABLAS_VALIDAS = new Set(['facturas_proveedores', 'nota_credito_proveedor']);

/** El patrón `<Clave>` de 50 dígitos, igual al que usa `emailService.js`. */
function claveDelContenido(buffer) {
  const m = buffer.toString('utf8').match(/<Clave>(\d{50})<\/Clave>/);
  return m ? m[1] : null;
}

/**
 * Intenta recuperar el XML de una sola fila del buzón.
 * No lanza: devuelve en qué terminó, porque el trabajo es de cientos de
 * facturas y una que falla no puede detener el resto.
 */
async function recuperarUno(fila, { buscarPorArchivo, bajarAdjunto, guardarArchivo, actualizarRuta }) {
  if (!fila.archivo_xml) {
    return { id: fila.id, estado: 'sin_nombre_de_archivo' };
  }

  let uids;
  try {
    uids = await buscarPorArchivo(fila.archivo_xml);
  } catch (error) {
    return { id: fila.id, estado: 'fallo_busqueda', motivo: error.message };
  }
  if (!uids || uids.length === 0) {
    return { id: fila.id, estado: 'no_encontrado' };
  }

  for (const uid of uids) {
    let adjuntos;
    try {
      adjuntos = await bajarAdjunto(uid);
    } catch {
      continue; // este correo no se pudo bajar; se prueba con el siguiente UID
    }

    const adjunto = (adjuntos || []).find((a) => a.filename === fila.archivo_xml);
    if (!adjunto) continue;

    // La clave manda sobre el nombre: si no coincide, este adjunto es de
    // OTRA factura que casualmente se llama igual.
    if (fila.clave) {
      const clave = claveDelContenido(adjunto.content);
      if (clave && clave !== fila.clave) continue;
    }

    let guardado;
    try {
      guardado = await guardarArchivo({ carpeta: 'compras-proveedor', prefijo: 'xml', buffer: adjunto.content, extension: 'xml' });
    } catch (error) {
      return { id: fila.id, estado: 'fallo_guardado', motivo: error.message };
    }

    try {
      await actualizarRuta(fila.id, guardado.ruta);
    } catch (error) {
      return { id: fila.id, estado: 'fallo_actualizacion', motivo: error.message };
    }

    return { id: fila.id, estado: 'recuperado', ruta: guardado.ruta, bytes: guardado.bytes };
  }

  return { id: fila.id, estado: 'no_coincide_con_clave' };
}

/**
 * Recorre una tabla (`facturas_proveedores` o `nota_credito_proveedor`) y
 * recupera lo que falte. Se procesa una fila a la vez, no en paralelo: es
 * una sola conexión IMAP y el buzón real no aguanta pedidos simultáneos.
 */
async function recuperarXmlDelBuzon({ pool, buscarPorArchivo, bajarAdjunto, almacenamiento, tabla = 'facturas_proveedores', limite = null, avisar = () => {} }) {
  if (!TABLAS_VALIDAS.has(tabla)) {
    throw new Error(`recuperarXmlDelBuzon: tabla no permitida "${tabla}"`);
  }

  const { rows } = await pool.query(
    `SELECT id, archivo_xml, clave FROM ${tabla}
      WHERE xml_ruta IS NULL AND archivo_xml IS NOT NULL
      ORDER BY fecha_emision ASC${limite ? ` LIMIT ${Number(limite)}` : ''}`
  );

  const conteo = {
    total: rows.length, recuperado: 0, no_encontrado: 0, no_coincide_con_clave: 0,
    sin_nombre_de_archivo: 0, fallo_busqueda: 0, fallo_guardado: 0, fallo_actualizacion: 0
  };
  const detalle = [];
  let bytes = 0;
  let hechas = 0;

  const actualizarRuta = async (id, ruta) => {
    await pool.query(`UPDATE ${tabla} SET xml_ruta = $1 WHERE id = $2`, [ruta, id]);
  };

  for (const fila of rows) {
    const r = await recuperarUno(fila, {
      buscarPorArchivo, bajarAdjunto, guardarArchivo: almacenamiento.guardarArchivo, actualizarRuta
    });
    conteo[r.estado] = (conteo[r.estado] || 0) + 1;
    if (r.estado === 'recuperado') bytes += r.bytes || 0;
    else detalle.push(r);
    if (++hechas % 25 === 0) avisar(`  ${hechas}/${rows.length}…`);
  }

  return { ...conteo, bytes, detalle };
}

module.exports = { recuperarUno, recuperarXmlDelBuzon, claveDelContenido };
