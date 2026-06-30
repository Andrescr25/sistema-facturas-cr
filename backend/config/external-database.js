// backend/config/external-database.js
const { Pool } = require('pg');

const externalPool = new Pool({
  connectionString: 'postgresql://facturas_user:FGRFioeY6EgvTUtPmxp5fwDUQbWxQwHs@dpg-d1jileu3jp1c73eae9u0-a.oregon-postgres.render.com/facturas_db',
  ssl: { rejectUnauthorized: false }
});

externalPool.on('error', (err) => {
  console.error('⚠️ Error inesperado en el pool de conexiones externo:', err.message);
});

async function queryExternal(text, params) {
  const client = await externalPool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

module.exports = { queryExternal };