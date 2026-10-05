/**
 * Baja las fotos que hoy viven en Alegra y las guarda como nuestras
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET, y solo si una dirección venció) y ESCRIBE en la
 * base local y en `backend/almacenamiento/`. Se puede correr las veces que
 * haga falta: los productos con foto propia se saltan.
 *
 * Uso:  node scripts/independencia/migrar-fotos.js [--limite=50] [--a-la-vez=5]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('./lib/lectura-alegra');
const { migrarFotos } = require('../../src/modules/productos/migrarFotos');

const argumento = (nombre) => {
  const encontrado = process.argv.find(a => a.startsWith(`--${nombre}=`));
  return encontrado ? Number(encontrado.split('=')[1]) : null;
};

async function main() {
  const inicio = Date.now();
  const r = await migrarFotos({
    pool,
    alegra: getClient(),
    limite: argumento('limite'),
    concurrencia: argumento('a-la-vez') || 5,
    avisar: (texto) => console.log(texto)
  });

  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`✓ Fotos propias: ${r.migrada} de ${r.total} en ${segundos} s (${(r.bytes / 1024 / 1024).toFixed(1)} MB).`);
  if (r.cambio_mientras_tanto) console.log(`  ${r.cambio_mientras_tanto} cambiaron mientras se bajaban y se dejaron como estaban.`);
  if (r.fallos.length) {
    console.log(`  ${r.fallos.length} no se pudieron bajar:`);
    for (const f of r.fallos.slice(0, 20)) console.log(`    producto ${f.id}: ${f.motivo}`);
    if (r.fallos.length > 20) console.log(`    …y ${r.fallos.length - 20} más. Se pueden reintentar volviendo a correr esto.`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('✗ No se migraron las fotos:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
