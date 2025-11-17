const fs = require('fs');
const path = require('path');
const XmlParser = require('../services/xmlParser');

const filename = '00100001010000069896.xml';
const samplePath = path.join(__dirname, 'samples', filename);

const detectFacturaCR = (name) => {
  const claveMatch = name.match(/(\d{50})/);

  const isFacturaCR = (
    name.startsWith('FE-') ||
    name.startsWith('TE-') ||
    name.startsWith('NC-') ||
    name.startsWith('ND-') ||
    claveMatch ||
    name.includes('FacturaElectronica') ||
    name.includes('Factura_XML') ||
    name.match(/^[0-9]{50}/) ||
    (name.includes('Factura') && name.includes('XML')) ||
    name.includes('TiqueteElectronico') ||
    name.includes('NotaCredito') ||
    name.includes('NotaDebito')
  );

  return { isFacturaCR, claveMatch };
};

(async () => {
  console.log('🔬 Probando detección de factura CR...');
  console.log(`   Archivo: ${filename}`);

  const detection = detectFacturaCR(filename);
  console.log(`   ¿Detectada como factura CR? ${detection.isFacturaCR ? 'Sí' : 'No'}`);
  console.log(`   Clave encontrada en nombre: ${detection.claveMatch ? detection.claveMatch[1] : 'Ninguna'}`);

  if (!fs.existsSync(samplePath)) {
    console.error('❌ No se encontró el XML de muestra en:', samplePath);
    process.exit(1);
  }

  const xmlContent = fs.readFileSync(samplePath, 'utf8');
  const parser = new XmlParser();

  try {
    const factura = await parser.parseFacturaXML(xmlContent);
    parser.validateFacturaCR(factura);

    console.log('\n✅ El XML se parsea correctamente:');
    console.log(`   Número consecutivo: ${factura.numeroConsecutivo}`);
    console.log(`   Clave: ${factura.clave}`);
    console.log(`   Proveedor: ${factura.emisor.nombre} (${factura.emisor.identificacion.numero})`);
    console.log(`   Productos encontrados: ${factura.productos.length}`);
    console.log(`   Total comprobante: ${factura.resumen.totales.comprobante}`);
  } catch (error) {
    console.error('❌ Error parseando o validando la factura:', error.message);
  }
})();

