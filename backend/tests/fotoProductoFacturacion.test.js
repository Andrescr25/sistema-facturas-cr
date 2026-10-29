/**
 * En Facturación, la línea de cada producto ofrece ver su foto (2026-10-28).
 *
 * El usuario: «agregues una forma de ver la imagen del producto que estoy
 * facturando; puede ser que yo lo añada y ahí me salga un logo pequeño para
 * ver la img… y que sea completamente responsive».
 *
 * La foto no viajaba a Facturación: la copia que cada dispositivo guarda del
 * catálogo la descartaba. Acá se cuida que ahora viaje, que el botón salga
 * solo si hay foto, y que se adapte al ancho sin lógica propia.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sinComentarios } = require('./dobles/sinComentarios');

const FRONT = path.resolve(__dirname, '../../frontend/src');
const front = (...p) => sinComentarios(fs.readFileSync(path.join(FRONT, ...p), 'utf8'));
const back = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

describe('la foto llega a Facturación', () => {
  test('la copia del catálogo conserva la foto, con la forma que ya entiende fotoDe', async () => {
    const servicio = front('services', 'facturacionService.js');
    assert.match(servicio, /images: p\.imagen_url \? \[\{ url: p\.imagen_url, favorite: true \}\] : \[\]/);
    const { fotoDe } = await import(pathToFileURL(path.join(FRONT, 'utils/cacheImagenesCatalogo.js')));
    assert.equal(fotoDe({ images: [{ url: '/archivos/productos/7-a.webp', favorite: true }] }), '/archivos/productos/7-a.webp');
    assert.equal(fotoDe({ images: [] }), null, 'sin foto no hay botón');
    assert.equal(fotoDe({}), null, 'una copia vieja, guardada antes de este cambio, tampoco rompe');
    assert.equal(fotoDe(undefined), null, 'una línea cuyo producto ya no está en el catálogo');
  });

  test('el servidor ya entrega la ruta de la foto en la lectura de Facturación', () => {
    assert.match(back('modules', 'productos', 'productos.service.js'), /precio_sin_iva: p\.precio_sin_iva, precio_con_iva: p\.precio_con_iva, imagen_url: p\.imagen_url/);
  });

  test('la foto cuenta en la huella: así cada dispositivo renueva su copia vieja una vez, sola', () => {
    const fuente = back('modules', 'productos', 'productos.service.js');
    const huella = fuente.slice(fuente.indexOf('async function huellaParaOperar'), fuente.indexOf('/** Proveedores con productos'));
    assert.match(huella, /p\.cabys, p\.unidad, p\.imagen_url\)/);
    assert.doesNotMatch(huella, /costo_con_iva|oculto/, 'el costo y ocultar siguen sin renovar el catálogo');
  });
});

describe('el botón de la foto en la línea de la factura', () => {
  const boton = front('components', 'facturacion', 'VerFotoProducto.jsx');
  const linea = front('components', 'facturacion', 'LineaFactura.jsx');
  const pagina = front('pages', 'Facturacion.jsx');

  test('solo aparece si el producto tiene foto, y la foto no se pide hasta tocarlo', () => {
    assert.match(boton, /if \(!foto\) return null/);
    assert.match(boton, /\{abierta && \(\s*<Modal/);
    assert.match(boton, /aria-label=\{`Ver foto de \$\{nombre\}`\}/);
  });

  test('es responsive sin lógica propia: botón táctil de 40 px y el modal del sistema', () => {
    assert.match(boton, /import Modal from '\.\.\/ui\/Modal'/);
    assert.match(boton, /h-10 w-10/, 'el mismo tamaño que el botón de quitar, que un dedo acierta');
    assert.match(boton, /max-h-\[60vh\] w-auto max-w-full[^"]*object-contain/, 'la foto cabe entera, sin recortarla ni deformarla');
    assert.doesNotMatch(boton, /innerWidth|isMobile|matchMedia/, 'el ancho lo decide CSS, no JavaScript');
  });

  test('sin señal o con una foto rota se dice, en vez de dejar un cuadro vacío', () => {
    assert.match(boton, /onError=\{\(\) => setEstado\('fallida'\)\}/);
    assert.match(boton, /No se pudo cargar la foto/);
    assert.match(boton, /onLoad=\{\(\) => setEstado\('lista'\)\}/);
    assert.match(boton, /urlArchivo\(foto\)/, 'la ruta se completa con el origen de la API, como en el resto de las pantallas');
  });

  test('la línea lo muestra junto al botón de quitar', () => {
    assert.match(linea, /import VerFotoProducto from '\.\/VerFotoProducto'/);
    assert.match(linea, /<VerFotoProducto nombre=\{item\.name\} referencia=\{item\.reference\} foto=\{foto\} \/>/);
    assert.ok(linea.indexOf('<VerFotoProducto') < linea.indexOf('aria-label={`Quitar'), 'primero la foto, después quitar');
  });

  test('la página busca la foto en el catálogo por producto y no la copia a la línea', () => {
    assert.match(pagina, /const productosPorId = useMemo\(\(\) => new Map\(productos\.map\(\(p\) => \[p\.id, p\]\)\), \[productos\]\)/);
    assert.match(pagina, /foto=\{fotoDe\(productosPorId\.get\(item\.productoId \?\? item\.id\)\)\}/);
    // Un gancho después de un return condicional tumba la pantalla (ver el comentario de la página).
    assert.ok(pagina.indexOf('const productosPorId') < pagina.indexOf('if (loading && productos.length === 0)'));
    const lineas = front('hooks', 'useLineasFacturacion.js');
    assert.doesNotMatch(lineas, /images|imagen/, 'la foto no se copia a la línea: no viaja a la cola de facturas pendientes');
  });
});
