const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/**
 * La rama independencia-alegra no puede tocar el mundo real.
 *
 * El `.env` es el mismo para todas las ramas y apunta a producción. Estas
 * pruebas fijan las tres reglas de config/aislado.js: la base tiene que ser
 * local, a Alegra solo se le lee, y no salen mensajes ni correos.
 *
 * Bajo `node --test` las salidas quedan libres para que las demás pruebas
 * puedan usar dobles; acá se quita NODE_TEST_CONTEXT a propósito para ver el
 * bloqueo tal como actúa en el servidor.
 */

const raiz = path.join(__dirname, '..');
const aislado = require('../config/aislado');

const SUPABASE = 'postgresql://postgres.abc:x@aws-0-us-east-2.pooler.supabase.com:6543/postgres';
const LOCAL = 'postgresql://tachi:x@localhost:5434/tachi';

describe('la base tiene que ser local', () => {
  test('acepta localhost, 127.0.0.1 y ::1', () => {
    for (const url of [LOCAL, 'postgresql://a:b@127.0.0.1:5432/x', 'postgresql://a:b@[::1]:5432/x']) {
      assert.equal(aislado.revisarBase({ DATABASE_URL: url }).permitida, true, url);
    }
  });

  test('rechaza la base de producción y dice cuál es', () => {
    const r = aislado.revisarBase({ DATABASE_URL: SUPABASE });
    assert.equal(r.permitida, false);
    assert.match(r.motivo, /pooler\.supabase\.com/);
  });

  test('sin DATABASE_URL no se conecta a ciegas', () => {
    assert.equal(aislado.revisarBase({}).permitida, false);
  });

  test('un nombre de host que solo contiene "localhost" no engaña', () => {
    const r = aislado.revisarBase({ DATABASE_URL: 'postgresql://a:b@localhost.evil.com:5432/x' });
    assert.equal(r.permitida, false);
  });

  test('la base remota solo se permite a propósito', () => {
    assert.equal(aislado.revisarBase({ DATABASE_URL: SUPABASE, PERMITIR_BASE_REMOTA: 'true' }).permitida, true);
    assert.equal(aislado.revisarBase({ DATABASE_URL: SUPABASE, PERMITIR_BASE_REMOTA: '1' }).permitida, false);
  });

  test('las dos puertas a la base revisan ANTES de conectar', () => {
    const db = fs.readFileSync(path.join(raiz, 'config', 'database.js'), 'utf8');
    assert.ok(db.indexOf('asegurarBaseLocal()') > -1 && db.indexOf('asegurarBaseLocal()') < db.indexOf('new Pool('),
      'config/database.js tiene que revisar antes de crear el Pool');
    const prisma = fs.readFileSync(path.join(raiz, 'lib', 'prisma.js'), 'utf8');
    assert.ok(prisma.indexOf('asegurarBaseLocal()') > -1 && prisma.indexOf('asegurarBaseLocal()') < prisma.indexOf('new PrismaClient('),
      'lib/prisma.js tiene que revisar antes de crear el cliente');
    const setup = fs.readFileSync(path.join(raiz, 'setupDatabase.js'), 'utf8');
    assert.ok(setup.indexOf('asegurarBaseLocal()') < setup.indexOf('new Pool('), 'setupDatabase.js crea tablas: también revisa');
  });

  test('.env.aislado no se sube a git', () => {
    const ignorados = fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8').split('\n').map(l => l.trim());
    assert.ok(ignorados.includes('.env.aislado'), 'backend/.gitignore tiene que ignorar .env.aislado');
  });
});

describe('nada sale al mundo real', () => {
  let contextoPrueba;
  beforeEach(() => { contextoPrueba = process.env.NODE_TEST_CONTEXT; delete process.env.NODE_TEST_CONTEXT; delete process.env.PERMITIR_SALIDAS; });
  afterEach(() => { if (contextoPrueba !== undefined) process.env.NODE_TEST_CONTEXT = contextoPrueba; delete process.env.PERMITIR_SALIDAS; });

  test('fuera de las pruebas, las salidas están bloqueadas por omisión', () => {
    assert.equal(aislado.salidasBloqueadas({}), true);
    assert.equal(aislado.salidasBloqueadas({ PERMITIR_SALIDAS: 'true' }), false);
    assert.equal(aislado.salidasBloqueadas({ PERMITIR_SALIDAS: 'si' }), true, 'solo "true" exacto abre la llave');
    assert.equal(aislado.salidasBloqueadas({ NODE_TEST_CONTEXT: 'child-v8' }), false);
  });

  test('Alegra: una escritura se frena antes de salir; una lectura pasa', async () => {
    const { getInstance } = require('../src/integrations/alegra/alegra.client');
    const cliente = getInstance();
    const interceptor = cliente.api.interceptors.request.handlers.find(Boolean);
    for (const method of ['post', 'put', 'delete', 'patch']) {
      await assert.rejects(
        Promise.resolve(interceptor.fulfilled({ method, url: '/invoices' })),
        e => e.code === 'SALIDA_BLOQUEADA' && e.status === 423,
        `${method} tendría que bloquearse`
      );
    }
    const lectura = await interceptor.fulfilled({ method: 'get', url: '/items' });
    assert.equal(lectura.url, '/items');
  });

  test('WhatsApp: no llega a llamar a Evolution', async () => {
    const rutaAxios = require.resolve('axios');
    const rutaCliente = require.resolve('../src/integrations/whatsapp/whatsapp.client');
    const axiosReal = require.cache[rutaAxios];
    const llamadas = [];
    require.cache[rutaAxios] = { id: rutaAxios, filename: rutaAxios, loaded: true,
      exports: { post: async (...a) => { llamadas.push(a); return { data: {} }; } } };
    delete require.cache[rutaCliente];
    try {
      process.env.WHATSAPP_API_URL = 'https://evolution.ejemplo';
      process.env.WHATSAPP_API_KEY = 'k';
      process.env.WHATSAPP_INSTANCE_NAME = 'i';
      const wa = require(rutaCliente);
      await assert.rejects(wa.enviarTexto({ telefono: '88272453', mensaje: 'hola' }), e => e.code === 'SALIDA_BLOQUEADA');
      assert.equal(llamadas.length, 0, 'axios.post no se tiene que haber llamado');
    } finally {
      if (axiosReal) require.cache[rutaAxios] = axiosReal; else delete require.cache[rutaAxios];
      delete require.cache[rutaCliente];
    }
  });

  test('correo: se frena antes de armar el transporte', async () => {
    const mailer = require('../services/mailer');
    await assert.rejects(
      mailer.enviarCorreo({ para: 'contador@ejemplo.com', asunto: 'x', texto: 'x' }),
      e => e.code === 'SALIDA_BLOQUEADA'
    );
  });

  test('el buzón de facturas no se empieza a leer', () => {
    const servicio = fs.readFileSync(path.join(raiz, 'services', 'emailService.js'), 'utf8');
    const inicio = servicio.indexOf('startMonitoring() {');
    const guarda = servicio.indexOf('salidasBloqueadas()', inicio);
    const conecta = servicio.indexOf('this.connect();', inicio);
    assert.ok(inicio > -1 && guarda > inicio && guarda < conecta, 'startMonitoring tiene que revisar antes de conectar al IMAP');
  });
});
