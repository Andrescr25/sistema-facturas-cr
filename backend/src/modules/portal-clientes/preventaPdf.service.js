const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { RAIZ_PRIVADA } = require('../../integrations/almacenamiento');
const { COLUMNAS, DESDE, VISIBLE, mapProducto } = require('../catalogo-clientes/consultaProducto');
const { obtenerInicio } = require('./portal-clientes.inicio.service');
const { ofertasPorBaja } = require('../catalogo-clientes/catalogo-clientes.service');
const { mapaVigentesPropios } = require('../../utils/descuentosExceso');
const { generarPdfCatalogo } = require('./preventa.pdf');
const { incorporarFotos } = require('./preventaFotos.service');
const DIRECTORIO = path.join(RAIZ_PRIVADA, 'preventa-pdf');
const MAX_BYTES = 20 * 1024 * 1024;
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const uuid = id => typeof id === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id);

async function modeloCatalogo(clienteId, cicloId, alcance = 'completo') {
  if (!['completo', 'seleccion'].includes(alcance)) throw httpError(400, 'Elegí catálogo completo o selección personalizada.');
  const contexto = await require('./preventa.service').preparar(clienteId, cicloId);
  const [filas, descuentos, portada, bajas] = await Promise.all([
    query(`SELECT ${COLUMNAS} ${DESDE} WHERE ${VISIBLE} ORDER BY cat.nombre NULLS LAST, p.nombre, p.id`),
    mapaVigentesPropios(), obtenerInicio(idValido(clienteId)), ofertasPorBaja()
  ]);
  // Lista blanca idéntica al catálogo; no elegir productos, precios o cliente
  // desde el cuerpo del navegador. La selección usa el historial de ESA ficha.
  const productos = filas.rows.map(r => mapProducto(r, descuentos));
  const porId = new Map(productos.map(p => [p.id, p]));
  const antes = new Map(bajas.filter(b => porId.get(b.productoId)?.precio === b.precioAhora)
    .map(b => [b.productoId, b.precioAntes]));
  const papel = p => ({ id: p.id, codigo: `P-${p.id}`, referencia: p.referencia,
    nombre: p.nombre, categoria: p.categoria, precio: p.precio,
    precioAnterior: p.precioLista || antes.get(p.id) || null, imagen: p.imagen });
  const usados = new Set(), secciones = [];
  const agregar = (titulo, ids) => {
    const lista = [];
    for (const id of ids) {
      if (usados.has(id) || !porId.has(id)) continue;
      usados.add(id); lista.push(papel(porId.get(id)));
    }
    if (lista.length) secciones.push({ titulo, productos: lista });
  };
  agregar('Tus productos habituales', portada.habituales.map(p => p.id));
  agregar('Para volver a pedir', portada.perdidos.map(p => p.id));
  agregar('Ofertas y precios rebajados', [...portada.ofertas.map(p => p.id), ...bajas.map(p => p.productoId)]);
  const fallback = alcance === 'seleccion' && usados.size === 0;
  if (alcance === 'completo' || fallback) {
    for (const categoria of new Set(productos.map(p => p.categoria))) {
      agregar(categoria, productos.filter(p => p.categoria === categoria).map(p => p.id));
    }
  }
  if (!usados.size) throw httpError(409, 'Todavía no hay productos visibles con precio para preparar el PDF.');
  return { clienteId: idValido(clienteId), cliente: contexto.cliente, ciclo: contexto.ciclo,
    negocio: process.env.CATALOGO_NEGOCIO || 'Distribuidora Tachi', fecha: hoyEnCostaRica(),
    referencia: `R${contexto.ciclo.id}-C${contexto.clienteId}`, alcance, fallback,
    total: usados.size, secciones };
}
async function preparar(clienteId, { cicloId, alcance } = {}) {
  const modelo = await modeloCatalogo(clienteId, cicloId, alcance);
  const fotos = await incorporarFotos(modelo);
  const pdf = await generarPdfCatalogo(modelo);
  if (pdf.length > MAX_BYTES) throw httpError(413, 'El PDF es demasiado grande. Prepará la selección personalizada.');
  const id = randomUUID();
  const documento = { id, clienteId: modelo.clienteId, cicloId: modelo.ciclo.id,
    semana: modelo.ciclo.semana, alcance: modelo.alcance, fallback: modelo.fallback,
    productos: modelo.total, fotos: fotos.incluidas, sinFoto: fotos.faltantes, fecha: modelo.fecha, bytes: pdf.length, sha256: sha(pdf),
    nombreArchivo: `catalogo-ruta-${modelo.ciclo.id}-cliente-${modelo.clienteId}-${modelo.ciclo.semana}.pdf` };
  // Copia privada: el envío reutiliza EXACTAMENTE lo revisado aunque cambie
  // un precio. Los archivos no se montan en /archivos ni conceden acceso.
  await fs.mkdir(DIRECTORIO, { recursive: true, mode: 0o700 });
  const destino = path.join(DIRECTORIO, id);
  try {
    await fs.writeFile(destino + '.pdf', pdf, { flag: 'wx', mode: 0o600 });
    await fs.writeFile(destino + '.json', JSON.stringify(documento), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    await fs.unlink(destino + '.pdf').catch(() => {}); throw e;
  }
  return documento;
}
async function leer(clienteId, cicloId, id) {
  if (!uuid(id)) throw httpError(400, 'Prepará el PDF antes de enviarlo.');
  let documento, pdf;
  try {
    documento = JSON.parse(await fs.readFile(path.join(DIRECTORIO, id + '.json'), 'utf8'));
    if (documento.clienteId !== idValido(clienteId) || documento.cicloId !== idValido(cicloId)) {
      throw httpError(404, 'Ese PDF no corresponde al cliente y semana elegidos.');
    }
    // Revalidar al descargar y al enviar; cerrar el ciclo no permite generar
    // pedidos nuevos desde un documento que quedó abierto en otro navegador.
    await require('./preventa.service').preparar(clienteId, cicloId);
    pdf = await fs.readFile(path.join(DIRECTORIO, id + '.pdf'));
  } catch (e) {
    if (e.code === 'ENOENT') throw httpError(404, 'Ese PDF ya no está disponible. Prepará uno nuevo.');
    throw e;
  }
  if (sha(pdf) !== documento.sha256) throw httpError(409, 'El PDF guardado cambió. Prepará uno nuevo antes de enviar.');
  return { documento, pdf };
}
module.exports = { preparar, leer, modeloCatalogo };
