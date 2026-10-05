/** Precarga de los CLI hijos. Nunca permite escoger la base compartida. */
const path = require('node:path');
const { validarBase } = require('./ensayo-corte');
validarBase(process.env.BASE_ENSAYO);
require('dotenv').config({ path: path.join(__dirname, '../../../.env'), quiet: true });
const guard = require('../../../config/aislado');
guard.asegurarBaseLocal();
const u = new URL(process.env.DATABASE_URL);
if (!guard.esBaseLocal(u.toString()) || u.port !== '5434') throw new Error('El ensayo exige el Postgres local en 5434.');
u.pathname = '/' + process.env.BASE_ENSAYO;
process.env.DATABASE_URL = u.toString();
for (const llave of ['PERMITIR_BASE_REMOTA', 'PERMITIR_SALIDAS', 'PERMITIR_LECTURA_BUZON', 'NODE_TEST_CONTEXT']) delete process.env[llave];
process.env.ENABLE_EMAIL_MONITORING = 'false';
process.env.ENABLE_WHATSAPP_PING = 'false';
guard.asegurarBaseLocal();
if (!guard.salidasBloqueadas() || guard.lecturaBuzonPermitida()) throw new Error('El ensayo debe conservar las salidas y el buzón bloqueados.');
