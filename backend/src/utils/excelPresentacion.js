const { CFB, utils } = require('xlsx');

// Los mismos roles de tailwind.config.js, expresados en RGB para SpreadsheetML.
// SheetJS CE conserva números/fechas, pero no escribe rellenos ni paneles:
// se completa SU XML recién generado, nunca un archivo subido por un usuario.
const PALETA = {
  primario: '12263F', primarioSuave: 'DCE3ED', blanco: 'FFFFFF',
  neutro: '374151', neutroSuave: 'F9FAFB', borde: 'E5E7EB',
  alerta: '92400E', alertaSuave: 'FEF3C7', exito: '065F46', exitoSuave: 'D1FAE5',
  peligro: '991B1B', peligroSuave: 'FEE2E2', nota: '6B21A8'
};
const ATRIBUTO = (texto) => String(texto).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function ampliar(xml, etiqueta, contenido) {
  let primero;
  xml = xml.replace(new RegExp(`<${etiqueta} count="(\\d+)"[^>]*>([\\s\\S]*?)</${etiqueta}>`), (_, n, antes) => {
    primero = Number(n);
    return `<${etiqueta} count="${primero + contenido.length}">${antes}${contenido.join('')}</${etiqueta}>`;
  });
  if (primero === undefined) throw new Error(`El Excel no contiene ${etiqueta}.`);
  return { xml, primero };
}

function estilos(xml) {
  const fuente = (color, tamano = 11, negrita = false) => `<font><sz val="${tamano}"/><color rgb="FF${color}"/><name val="Aptos"/>${negrita ? '<b/>' : ''}</font>`;
  let r = ampliar(xml, 'fonts', [
    fuente(PALETA.neutro), fuente(PALETA.blanco, 11, true), fuente(PALETA.primario, 22, true),
    fuente(PALETA.neutro, 10), fuente(PALETA.primario, 11, true),
    fuente(PALETA.alerta, 11, true), fuente(PALETA.exito, 11, true), fuente(PALETA.peligro, 11, true)
  ]);
  const f = r.primero;
  r = ampliar(r.xml, 'fills', [PALETA.blanco, PALETA.neutroSuave, PALETA.primario, PALETA.primarioSuave, PALETA.alertaSuave, PALETA.exitoSuave, PALETA.peligroSuave]
    .map(color => `<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`));
  const fondo = r.primero;
  r = ampliar(r.xml, 'borders', [`<border><left/><right/><top/><bottom style="hair"><color rgb="FF${PALETA.borde}"/></bottom><diagonal/></border>`]);
  const borde = r.primero;
  const originales = r.xml.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/)[1].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g);
  const nuevos = [], cache = new Map();
  const roles = {
    cuerpo: [f, fondo, borde], alterna: [f, fondo + 1, borde], cabecera: [f + 1, fondo + 2, 0],
    titulo: [f + 2, fondo, 0], subtitulo: [f + 4, fondo, 0], ayuda: [f + 3, fondo, 0],
    seccion: [f + 1, fondo + 2, 0], total: [f + 4, fondo + 3, borde],
    alerta: [f + 5, fondo + 4, borde], exito: [f + 6, fondo + 5, borde], peligro: [f + 7, fondo + 6, borde]
  };
  function id(original, rol, numero) {
    const clave = `${original}/${rol}/${numero}`;
    if (cache.has(clave)) return cache.get(clave);
    const [font, fill, border] = roles[rol] || roles.cuerpo;
    const formato = (originales[original || 0].match(/numFmtId="(\d+)"/) || [null, 0])[1];
    const indice = originales.length + nuevos.length;
    nuevos.push(`<xf numFmtId="${formato}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${numero ? 'right' : 'left'}" vertical="center" wrapText="1" indent="1"/></xf>`);
    cache.set(clave, indice);
    return indice;
  }
  return { id, finalizar: () => ampliar(r.xml, 'cellXfs', nuevos).xml };
}

function presentarExcel(buffer, hojas) {
  const zip = CFB.read(buffer, { type: 'buffer' });
  const leer = (ruta) => CFB.find(zip, `/${ruta}`).content.toString('utf8');
  const guardar = (ruta, valor) => CFB.utils.cfb_add(zip, `/${ruta}`, Buffer.from(valor));
  const estilo = estilos(leer('xl/styles.xml'));
  const nombres = [];
  hojas.forEach((opciones, i) => {
    const { nombre, encabezado = 6, columnasFijas = 2, filas = {}, celdas = {}, portada = false } = opciones;
    const ruta = `xl/worksheets/sheet${i + 1}.xml`;
    let xml = leer(ruta);
    xml = xml.replace(/<c\b([^>]*\br="([A-Z]+\d+)"[^>]*)>/g, (_, atributos, direccion) => {
      const { r: fila } = utils.decode_cell(direccion);
      const rol = celdas[direccion] || filas[fila + 1] || (fila === 0 ? 'titulo' : fila === 1 ? 'subtitulo' : fila < encabezado - 1 ? 'ayuda' : fila === encabezado - 1 ? 'cabecera' : fila % 2 ? 'cuerpo' : 'alterna');
      const original = Number((atributos.match(/\bs="(\d+)"/) || [null, 0])[1]);
      const numero = !/\bt="(s|str|inlineStr)"/.test(atributos);
      const limpio = atributos.replace(/\s+s="\d+"/, '');
      return `<c${limpio} s="${estilo.id(original, rol, numero)}">`;
    });
    xml = xml.replace(/<row\b([^>]*\br="(\d+)"[^>]*)>/g, (_, atributos, numero) => {
      const alto = opciones.alturas?.[numero] || (Number(numero) === 1 ? 40 : Number(numero) === encabezado ? 36 : Number(numero) < encabezado ? 26 : 34);
      return `<row${atributos.replace(/\s+(?:ht|customHeight)="[^"]*"/g, '')} ht="${alto}" customHeight="1">`;
    });
    const x = portada ? 0 : columnasFijas;
    const esquina = `${utils.encode_col(x)}${encabezado + 1}`;
    const panel = x ? 'bottomRight' : 'bottomLeft';
    xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,
      `<sheetViews><sheetView showGridLines="0" zoomScale="85" workbookViewId="0"><pane ${x ? `xSplit="${x}" ` : ''}ySplit="${encabezado}" topLeftCell="${esquina}" activePane="${panel}" state="frozen"/><selection pane="${panel}" activeCell="${esquina}" sqref="${esquina}"/></sheetView></sheetViews>`);
    const propiedades = `<sheetPr><tabColor rgb="FF${PALETA[opciones.color || 'primario']}"/><pageSetUpPr fitToPage="1"/></sheetPr>`;
    xml = xml.includes('<sheetPr') ? xml.replace(/<sheetPr[^>]*>[\s\S]*?<\/sheetPr>|<sheetPr[^>]*\/>/, propiedades) : xml.replace(/(<worksheet\b[^>]*>)/, `$1${propiedades}`);
    const impresion = `<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup paperSize="${portada ? 9 : 8}" orientation="${portada ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${ATRIBUTO(nombre)}&amp;R${ATRIBUTO('Página &P de &N')}</oddFooter></headerFooter>`;
    // Orden SpreadsheetML: impresión va después de merges/filtros y antes de
    // ignoredErrors. Conservar ese orden evita la reparación al abrir en Excel.
    xml = xml.replace(/<pageMargins\b[^>]*\/>/, '');
    const antes = xml.search(/<(?:ignoredErrors|drawing|legacyDrawing|extLst)\b/);
    xml = antes < 0 ? xml.replace('</worksheet>', `${impresion}</worksheet>`) : xml.slice(0, antes) + impresion + xml.slice(antes);
    guardar(ruta, xml);
    const ref = `'${nombre.replaceAll("'", "''")}'!`;
    const rango = xml.match(/<dimension ref="([^"]+)"/)[1];
    nombres.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${ATRIBUTO(ref)}$1:$${encabezado}</definedName>`,
      `<definedName name="_xlnm.Print_Area" localSheetId="${i}">${ATRIBUTO(ref)}${rango.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>`);
  });
  guardar('xl/styles.xml', estilo.finalizar());
  let libro = leer('xl/workbook.xml');
  libro = libro.includes('</definedNames>') ? libro.replace('</definedNames>', `${nombres.join('')}</definedNames>`) : libro.replace('</sheets>', `</sheets><definedNames>${nombres.join('')}</definedNames>`);
  guardar('xl/workbook.xml', libro);
  return CFB.write(zip, { type: 'buffer', fileType: 'zip', compression: true });
}

module.exports = { presentarExcel };
