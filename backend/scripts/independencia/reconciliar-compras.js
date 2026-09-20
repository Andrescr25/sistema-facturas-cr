/**
 * Recalcula si cada compra cuadra, usando el XML que ya se haya recuperado.
 *
 * Se corre DESPUÉS de `recuperar-xml-del-buzon.js` (o simplemente después de
 * que entren facturas nuevas, que ya guardan su XML desde el día que se
 * activó esto). Solo LEE archivos y la base local, y ESCRIBE en la base
 * local — no toca Alegra ni el buzón. Se puede correr las veces que haga
 * falta.
 *
 * Uso:  node scripts/independencia/reconciliar-compras.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const { pool } = require('../../config/database');
const almacenamiento = require('../../src/integrations/almacenamiento');
const XmlParser = require('../../services/xmlParser');
const { copiarXmlDeBuzonACompra, reconciliarCompras } = require('../../src/modules/compras/reconciliarCompra');

async function main() {
  console.log('📋 Copiando xml_ruta del buzón a las compras que todavía no la tienen...');
  const copiadas = await copiarXmlDeBuzonACompra(pool);
  console.log(`✓ ${copiadas} compras recibieron su ruta de XML.\n`);

  console.log('🧮 Reconciliando totales contra el XML...');
  const r = await reconciliarCompras({
    pool,
    almacenamiento,
    xmlParser: new XmlParser(),
    avisar: (texto) => console.log(texto)
  });

  console.log(`\n${r.cuadra} de ${r.total} compras con XML cuadran.`);
  if (r.no_cuadra) {
    console.log(`${r.no_cuadra} siguen sin cuadrar (queda anotado en compra.observaciones):`);
    for (const n of r.noCuadran.slice(0, 20)) console.log(`  compra ${n.id}: diferencia ₡${n.diferencia.toFixed(2)}`);
    if (r.noCuadran.length > 20) console.log(`  …y ${r.noCuadran.length - 20} más.`);
  }
  if (r.archivo_no_encontrado) console.log(`${r.archivo_no_encontrado} tenían xml_ruta pero el archivo ya no está en disco.`);
  if (r.xml_invalido) console.log(`${r.xml_invalido} tenían un XML que no se pudo volver a parsear.`);
  console.log(`(${r.sin_xml} compras siguen sin XML recuperado — nada que reconciliar todavía.)`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se pudo reconciliar:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
