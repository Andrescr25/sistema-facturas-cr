// SheetJS ya trae CFB (lector/escritor ZIP). Se reutiliza sin instalar otra
// dependencia; el respaldo incluye los bytes originales, nunca una recreación.
const { CFB } = require('xlsx');
const { leerArchivoPrivado } = require('../../integrations/almacenamiento');
const { httpError } = require('../../utils/validacion');
const MAXIMO = 32 * 1024 * 1024;
async function comprobantes(mes, leer = leerArchivoPrivado) {
  const zip = CFB.utils.cfb_new();
  let bytes = 0,
    faltantes = 0;
  const manifiesto = [
    `Comprobantes de gastos · ${mes.etiqueta}`,
    'Los documentos pendientes también se incluyen.'
  ];
  for (const g of mes.gastos) {
    for (const tipo of ['xml', 'pdf']) {
      const ruta = g[`${tipo}_ruta`];
      const buffer = ruta ? await leer(ruta) : null;
      if (!buffer) {
        faltantes++;
        manifiesto.push(
          `Gasto ${g.id} · factura ${g.numero}: ${tipo.toUpperCase()} no disponible.`
        );
        continue;
      }
      bytes += buffer.length;
      if (bytes > MAXIMO)
        throw httpError(
          413,
          'Los comprobantes del mes superan 32 MB. Descargalos desde sus fichas para compartirlos por otro medio.'
        );
      CFB.utils.cfb_add(zip, `gasto-${g.id}.${tipo}`, buffer);
    }
  }
  CFB.utils.cfb_add(zip, 'LEEME.txt', Buffer.from(manifiesto.join('\n'), 'utf8'));
  return {
    buffer: CFB.write(zip, { type: 'buffer', fileType: 'zip', compression: true }),
    nombre: `comprobantes-gastos-${mes.anio}-${String(mes.mes).padStart(2, '0')}.zip`,
    faltantes
  };
}
module.exports = { comprobantes };
