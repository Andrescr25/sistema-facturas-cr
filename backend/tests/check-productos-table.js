const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/database');

async function check() {
  const result = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'productos'
    ORDER BY ordinal_position
  `);
  console.log(result.rows);
  process.exit(0);
}

check().catch(err => { console.error(err); process.exit(1); });
