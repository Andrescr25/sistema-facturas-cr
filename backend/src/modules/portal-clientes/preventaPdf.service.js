const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { query } = require('../../../config/database');
const { httpError, idValido } = require('../../utils/validacion');
const { hoyEnCostaRica } = require('../../utils/fechaCR');
const { RAIZ_PRIVADA } = require('../../integrations/almacenamiento');
const { COLUMNAS, DESDE, VISIBLE, mapProducto } = require('../catalogo-clientes/consultaProducto');
const { obtenerInicio } = require('./portal-clientes.inicio.service');
const { ofertasPorBajaDePrecio } = require('../precios/ofertasPorBaja');
const { categoriasEnOrden } = require('../productos/taxonomiaTablas');
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
  const [filas, descuentos, portada, bajas, categorias] = await Promise.all([
    query(`SELECT ${COLUMNAS}, s.nombre AS subcategoria_nombre, s.orden AS subcategoria_orden
      ${DESDE} LEFT JOIN subcategoria s ON s.id=p.subcategoria_id AND s.activo AND s.categoria=cat.nombre
      WHERE ${VISIBLE} ORDER BY p.nombre, p.id`),
    mapaVigentesPropios(), obtenerInicio(idValido(clienteId)), ofertasPorBajaDePrecio({ limite: null }), categoriasEnOrden()
  ]);
  // Personalizar define QUÉ productos se incluyen; la taxonomía define DÓNDE
  // aparecen. Oferta/liquidación son etiquetas, nunca secciones duplicadas.
  const productos = filas.rows.map(r => ({ ...mapProducto(r, descuentos),
    subcategoria: r.subcategoria_nombre || 'Otros', ordenSubcategoria: r.subcategoria_orden }));
  const porId = new Map(productos.map(p => [p.id, p]));
  const antes = new Map(bajas.filter(b => {
    const p = porId.get(b.productoId);
    // En liquidación el precio final ya lleva su descuento. La baja se
    // compara con el precio base actual, y NO se descuenta otra vez.
    return p && (p.precioLista || p.precio) === b.precioAhora && b.precioAntes > b.precioAhora;
  }).map(b => [b.productoId, b.precioAntes]));
  const seleccionados = new Set([...portada.habituales, ...portada.perdidos].map(p => p.id));
  for (const id of antes.keys()) seleccionados.add(id);
  for (const id of descuentos.keys()) if (porId.has(Number(id))) seleccionados.add(Number(id));
  const fallback = alcance === 'seleccion' && !productos.some(p => seleccionados.has(p.id));
  const incluidos = alcance === 'completo' || fallback ? productos : productos.filter(p => seleccionados.has(p.id));
  if (!incluidos.length) throw httpError(409, 'Todavía no hay productos visibles con precio para preparar el PDF.');
  // Orden/nombre visible vienen del MISMO servicio que Gestión y el agente.
  // Subcategorías: orden manual y empate natural; Otros queda al final.
  const configuradas = new Map(categorias.map(c => [c.name, c]));
  const grupos = new Map();
  const papel = p => ({ id: p.id, codigo: `P-${p.id}`, referencia: p.referencia,
    nombre: p.nombre, categoria: configuradas.get(p.categoria)?.nombreVisible || p.categoria,
    subcategoria: p.subcategoria, precio: p.precio,
    precioAnterior: antes.get(p.id) || p.precioLista || null, imagen: p.imagen,
    etiquetas: [...(antes.has(p.id) ? ['Oferta'] : []), ...(p.descuento > 0 ? ['Liquidación'] : [])] });
  for (const p of incluidos) {
    if (!grupos.has(p.categoria)) grupos.set(p.categoria, new Map());
    const subgrupos = grupos.get(p.categoria);
    if (!subgrupos.has(p.subcategoria)) subgrupos.set(p.subcategoria, { orden: p.ordenSubcategoria, productos: [] });
    subgrupos.get(p.subcategoria).productos.push(papel(p));
  }
  const natural = (a, b) => a.localeCompare(b, 'es', { numeric: true });
  const secciones = [];
  const nombres = [...grupos.keys()].sort((a, b) =>
    (configuradas.get(a)?.orden ?? Number.MAX_SAFE_INTEGER) - (configuradas.get(b)?.orden ?? Number.MAX_SAFE_INTEGER) || natural(a, b));
  for (const categoria of nombres) {
    const subgrupos = [...grupos.get(categoria)].sort(([a, ga], [b, gb]) => {
      if (a === 'Otros') return 1;
      if (b === 'Otros') return -1;
      return (ga.orden ?? Number.MAX_SAFE_INTEGER) - (gb.orden ?? Number.MAX_SAFE_INTEGER) || natural(a, b);
    });
    for (const [subcategoria, grupo] of subgrupos) secciones.push({
      titulo: configuradas.get(categoria)?.nombreVisible || categoria, subcategoria,
      productos: grupo.productos.sort((a, b) => natural(a.nombre, b.nombre) || a.id - b.id)
    });
  }
  return { clienteId: idValido(clienteId), cliente: contexto.cliente, ciclo: contexto.ciclo,
    negocio: process.env.CATALOGO_NEGOCIO || 'Distribuidora Tachi', fecha: hoyEnCostaRica(),
    referencia: `R${contexto.ciclo.id}-C${contexto.clienteId}`, alcance, fallback,
    total: incluidos.length, secciones };
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
