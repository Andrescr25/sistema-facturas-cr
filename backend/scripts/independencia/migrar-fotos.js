/**
 * Baja las fotos que hoy viven en Alegra y las guarda como nuestras
 * (rama independencia-alegra).
 *
 * LEE de Alegra (solo GET, y solo si una dirección venció) y ESCRIBE en la
 * base local y en `backend/almacenamiento/`. Se puede correr las veces que
 * haga falta: los productos con foto propia se saltan.
 *
 * Uso:  node scripts/independencia/migrar-fotos.js [--limite=50] [--a-la-vez=5]
 *
 * DÓNDE SE CORRE IMPORTA. La foto se guarda en el disco de la máquina que
 * corre esto y en la base queda solo la ruta ("/archivos/productos/…"), que
 * después sirve EL SERVIDOR desde su propio disco. Corrido desde una
 * computadora contra la base de producción, deja las 1.844 fotos en esa
 * computadora y a producción apuntando a archivos que no tiene: todos los
 * catálogos sin foto. Contra una base remota solo corre si `ALMACENAMIENTO_DIR`
 * dice dónde está el disco que persiste, es decir, en el servidor.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const { pool } = require('../../config/database');
const { getClient } = require('./lib/lectura-alegra');
const { migrarFotos } = require('../../src/modules/productos/migrarFotos');
const { esBaseLocal } = require('../../config/aislado');

/** Por qué no se puede correr acá, o null si se puede. */
function motivoParaNoCorrer(env = process.env) {
  if (esBaseLocal(env.DATABASE_URL) || env.ALMACENAMIENTO_DIR) return null;
  return 'La base es remota y no está definido ALMACENAMIENTO_DIR: las fotos quedarían en el disco de esta ' +
    'máquina y la base apuntando a archivos que el servidor no tiene. Correr esto en el servidor, con ' +
    'ALMACENAMIENTO_DIR en su disco persistente.';
}

const argumento = (nombre) => {
  const encontrado = process.argv.find(a => a.startsWith(`--${nombre}=`));
  return encontrado ? Number(encontrado.split('=')[1]) : null;
};

async function main() {
  const motivo = motivoParaNoCorrer();
  if (motivo) throw new Error(motivo);
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

if (require.main === module) {
  main()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error('✗ No se migraron las fotos:', error.message);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}

module.exports = { motivoParaNoCorrer };
