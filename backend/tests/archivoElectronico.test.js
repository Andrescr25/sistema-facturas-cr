const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { archivar, identidad, validarContenido, urlArchivo, descargarArchivo, ErrorArchivo, hash } = require('../scripts/independencia/lib/archivo-electronico');
const { argumentos, mensajeSeguro } = require('../scripts/independencia/archivar-ventas-electronicas');

const factura = (id = 1) => ({ id: String(id), date: '2026-09-01', status: 'closed',
  numberTemplate: { fullNumber: `001-${id}`, isElectronic: true, documentType: 'invoice' },
  stamp: { uuid: '506' + String(id).padStart(47, '0') } });
const pdf = Buffer.from('%PDF-1.7\nOriginal de prueba\n%%EOF\n');
const xml = d => Buffer.from(`<FacturaElectronica xmlns="urn:prueba"><Clave>${d.stamp.uuid}</Clave><ds:Signature xmlns:ds="urn:firma"><ds:SignatureValue>prueba</ds:SignatureValue></ds:Signature></FacturaElectronica>`);
const urls = d => ({ ...d, pdf: `https://cdn3.alegra.com/${d.id}.pdf?firma=privada`, xml: `https://alegra.s3.amazonaws.com/${d.id}.xml?firma=privada` });
function origen(docs = [factura()]) {
  const llamadas = [];
  return { llamadas, async get(ruta, params) {
    llamadas.push({ ruta, params });
    if (ruta === '/invoices') return { success: true, data: docs.slice(params.start, params.start + 30) };
    const d = docs.find(d => ruta === `/invoices/${d.id}`);
    return { success: Boolean(d), data: d && urls(d) };
  } };
}
async function carpeta(t) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'zz-archivo-electronico-'));
  t.after(() => fs.rm(raiz, { recursive: true }));
  return path.join(raiz, 'ventas');
}
const descargar = async url => { const u = new URL(url); const d = factura(Number(path.basename(u.pathname).split('.')[0])); return u.pathname.endsWith('.xml') ? xml(d) : pdf; };

test('argumentos: todos o un período inclusivo, destino absoluto y sin flags repetidos', () => {
  assert.deepEqual(argumentos(['--todos', '--destino=/tmp/ventas']), { destino: '/tmp/ventas', p: null, aLaVez: 3 });
  assert.deepEqual(argumentos(['--desde=2026-09-01', '--hasta=2026-09-30', '--destino=/tmp/ventas']).p, { desde: '2026-09-01', hasta: '2026-09-30' });
  for (const args of [[], ['--todos', '--destino=ventas'], ['--todos', '--todos', '--destino=/tmp/v'],
    ['--todos', '--desde=2026-09-01', '--destino=/tmp/v'], ['--desde=2026-02-30', '--hasta=2026-03-01', '--destino=/tmp/v']]) assert.throws(() => argumentos(args));
});

test('enlaces: HTTPS de los hosts comprobados, sin credenciales, puertos ni red local', () => {
  assert.equal(urlArchivo({ url: 'https://alegra.s3.amazonaws.com/doc.xml?firma=privada' }).hostname, 'alegra.s3.amazonaws.com');
  for (const u of ['http://cdn3.alegra.com/x', 'https://127.0.0.1/x', 'https://cdn3.alegra.com.local/x',
    'https://cdn3.alegra.com@localhost/x', 'https://usuario:clave@cdn3.alegra.com/x', 'https://cdn3.alegra.com:444/x', null]) assert.throws(() => urlArchivo(u), ErrorArchivo);
});

test('una redirección hacia la red local se rechaza antes de contactarla', async () => {
  let llamadas = 0;
  await assert.rejects(descargarArchivo('https://cdn3.alegra.com/x', { http: { get: async (_u, opciones) => {
    llamadas++; assert.equal(opciones.auth, undefined); assert.equal(opciones.maxRedirects, 0);
    return { status: 302, headers: { location: 'https://127.0.0.1/config' } };
  } } }), ErrorArchivo);
  assert.equal(llamadas, 1);
});

test('descarga sin autenticación: redirección revisada hacia S3 y bytes originales', async () => {
  const llamadas = [];
  const b = await descargarArchivo('https://cdn3.alegra.com/x', { http: { get: async (u, opciones) => {
    llamadas.push(u); assert.equal(opciones.auth, undefined);
    return llamadas.length === 1 ? { status: 302, headers: { location: 'https://alegra.s3.amazonaws.com/x' } } : { status: 200, data: pdf };
  } } });
  assert.deepEqual(b, pdf); assert.equal(llamadas.length, 2);
});

test('fallos de descarga no publican el error con enlace firmado ni auth', async () => {
  await assert.rejects(descargarArchivo('https://cdn3.alegra.com/x', { http: { get: async () => { throw new Error('https://usuario:clave@cdn3.alegra.com/?firma=privada'); } } }), e => !/clave|firma=/.test(e.message));
  assert.doesNotMatch(mensajeSeguro(new Error('Axios: Bearer privado')), /Axios|Bearer|privado/);
});

test('una descarga transitoria reintenta solo GET, con espera y límite acotados', async () => {
  let llamadas = 0; const esperas = [];
  const buffer = await descargarArchivo('https://cdn3.alegra.com/x', { esperar: async ms => esperas.push(ms),
    http: { get: async () => {
      llamadas++;
      if (llamadas === 1) throw Object.assign(new Error('URL privada'), { code: 'ECONNRESET' });
      return llamadas === 2 ? { status: 503 } : { status: 200, data: pdf };
    } } });
  assert.deepEqual(buffer, pdf); assert.equal(llamadas, 3); assert.deepEqual(esperas, [1000, 2000]);
  llamadas = 0;
  await assert.rejects(descargarArchivo('https://cdn3.alegra.com/x', { esperar: async () => assert.fail('No esperar un 403'),
    http: { get: async () => { llamadas++; return { status: 403 }; } } }), ErrorArchivo);
  assert.equal(llamadas, 1);
});

test('un fallo HTTP del detalle queda distinguido de una identidad que cambió', async t => {
  const destino = await carpeta(t), client = origen(); const get = client.get;
  client.get = async (ruta, params) => ruta === '/invoices/1' ? { success: false, status: 403 } : get(ruta, params);
  const m = await archivar({ destino, client, descargar });
  assert.equal(m.completo, false); assert.match(m.fallos[0].motivo, /detalle del original \(HTTP 403\)/);
  assert.equal((await fs.readdir(path.join(destino, 'documentos'))).length, 0);
});

test('un PDF truncado, HTML y XML de otra factura no se archivan como originales válidos', async () => {
  const d = identidad(factura());
  await validarContenido(pdf, 'pdf', d); await validarContenido(xml(factura()), 'xml', d);
  for (const b of [Buffer.from('<html>403</html>'), Buffer.from('%PDF-1.7\ntruncado')]) await assert.rejects(validarContenido(b, 'pdf', d), ErrorArchivo);
  await assert.rejects(validarContenido(xml(factura(2)), 'xml', d), /clave fiscal/);
  await assert.rejects(validarContenido(Buffer.from(`<FacturaElectronica><Clave>${d.clave}</Clave></FacturaElectronica>`), 'xml', d), /firma/);
  await assert.rejects(validarContenido(Buffer.from('<!DOCTYPE x [<!ENTITY y "x">]><FacturaElectronica/>'), 'xml', d), /XML admitido/);
});

test('tiquetes electrónicos usan su raíz propia; una factura no se acepta como tiquete', async () => {
  const d = identidad({ ...factura(), numberTemplate: { ...factura().numberTemplate, documentType: 'saleTicket' } });
  await assert.rejects(validarContenido(xml(factura()), 'xml', d), /clave fiscal/);
  await validarContenido(Buffer.from(xml(factura()).toString().replaceAll('FacturaElectronica', 'TiqueteElectronico')), 'xml', d);
});

test('identidad: no inventa clave, número o emisión y controla el filtro de fechas', () => {
  for (const d of [{ ...factura(), id: '../ajeno' }, { ...factura(), stamp: {} }, { ...factura(), status: 'draft' },
    { ...factura(), numberTemplate: { ...factura().numberTemplate, isElectronic: 'true' } }]) assert.throws(() => identidad(d), ErrorArchivo);
  assert.throws(() => identidad(factura(), { desde: '2026-10-01', hasta: '2026-10-04' }), /ignoró/);
});

test('archivo completo: bytes, permisos, clave y hashes; sin URLs privadas en el manifiesto', async t => {
  const destino = await carpeta(t), client = origen();
  const m = await archivar({ destino, client, descargar });
  assert.equal(m.completo, true); assert.equal(m.resumen.archivadas, 1);
  for (const tipo of ['pdf', 'xml']) {
    const r = m.documentos['1'].archivos[tipo]; const nombre = path.join(destino, r.ruta);
    assert.equal(hash(await fs.readFile(nombre)), r.sha256); assert.equal((await fs.stat(nombre)).mode & 0o777, 0o600);
  }
  assert.equal((await fs.stat(destino)).mode & 0o777, 0o700);
  const json = await fs.readFile(path.join(destino, 'manifiesto.json'), 'utf8'); assert.doesNotMatch(json, /https:|firma=privada/);
  assert.ok(client.llamadas.some(l => l.ruta === '/invoices/1' && l.params.fields === 'pdf,xml'));
  await assert.rejects(fs.stat(path.join(destino, '.en-curso')), { code: 'ENOENT' });
});

test('repetir verifica y reutiliza sin pedir detalle, descargar ni cambiar los originales', async t => {
  const destino = await carpeta(t);
  await archivar({ destino, client: origen(), descargar });
  const anterior = await fs.stat(path.join(destino, 'documentos/1.xml'));
  const client = origen();
  const m = await archivar({ destino, client, descargar: async () => assert.fail('No descargar de nuevo') });
  assert.equal(m.resumen.reutilizadas, 1); assert.ok(m.completo);
  assert.equal(client.llamadas.filter(l => l.ruta !== '/invoices').length, 0);
  assert.equal((await fs.stat(path.join(destino, 'documentos/1.xml'))).mtimeMs, anterior.mtimeMs);
});

test('un XML pendiente conserva el PDF y el reintento trae solo lo que falta', async t => {
  const destino = await carpeta(t);
  let m = await archivar({ destino, client: origen(), descargar: async u => { if (u.includes('.xml')) throw new ErrorArchivo('Enlace vencido'); return pdf; } });
  assert.equal(m.completo, false); assert.equal(m.fallos.length, 1); assert.ok(m.documentos['1'].archivos.pdf);
  const antes = await fs.stat(path.join(destino, 'documentos/1.pdf'));
  m = await archivar({ destino, client: origen(), descargar: async u => { assert.ok(u.includes('.xml')); return xml(factura()); } });
  assert.ok(m.completo); assert.equal((await fs.stat(path.join(destino, 'documentos/1.pdf'))).mtimeMs, antes.mtimeMs);
});

test('un original alterado produce pendiente; nunca se sustituye con una descarga', async t => {
  const destino = await carpeta(t);
  await archivar({ destino, client: origen(), descargar });
  const nombre = path.join(destino, 'documentos/1.pdf'); await fs.writeFile(nombre, 'alterado');
  const m = await archivar({ destino, client: origen(), descargar: async () => assert.fail('No pisar') });
  assert.equal(m.completo, false); assert.match(m.fallos[0].motivo, /cambió/); assert.equal(await fs.readFile(nombre, 'utf8'), 'alterado');
});

test('un detalle de otra factura no genera archivos; también compara clave y fecha', async t => {
  const destino = await carpeta(t), client = origen(); const get = client.get;
  client.get = async (ruta, params) => ruta === '/invoices' ? get(ruta, params) : { success: true, data: urls(factura(2)) };
  const m = await archivar({ destino, client, descargar: async () => assert.fail('No descargar el documento ajeno') });
  assert.equal(m.completo, false); assert.equal(m.resumen.archivadas, 0); assert.deepEqual(await fs.readdir(path.join(destino, 'documentos')), []);
});

test('una factura electrónica fuera de la copia propia se archiva igualmente por su id de Alegra', async t => {
  const destino = await carpeta(t), docs = [factura(1), factura(999)];
  const m = await archivar({ destino, client: origen(docs), descargar });
  assert.ok(m.completo); assert.deepEqual(Object.keys(m.documentos), ['1', '999']); assert.equal(m.resumen.archivadas, 2);
});

test('facturas no electrónicas y borradores se cuentan en la lectura, no como pendientes emitidos', async t => {
  const destino = await carpeta(t), normal = { ...factura(2), numberTemplate: { ...factura(2).numberTemplate, isElectronic: false } };
  const m = await archivar({ destino, client: origen([factura(), normal, { ...factura(3), status: 'draft', stamp: {} }]), descargar });
  assert.equal(m.resumen.facturasLeidas, 3); assert.equal(m.resumen.electronicas, 1); assert.ok(m.completo);
});

test('una lectura vacía revisada no olvida originales de la lectura anterior', async t => {
  const destino = await carpeta(t); await archivar({ destino, client: origen(), descargar });
  const m = await archivar({ destino, client: origen([]), descargar });
  assert.equal(m.completo, false); assert.deepEqual(m.fueraDeLectura, ['1']); assert.ok(m.documentos['1'].archivos.xml);
  assert.ok((await fs.stat(path.join(destino, 'documentos/1.xml'))).size);
});

test('página fallida no produce un certificado completo ni borra los originales confirmados', async t => {
  const destino = await carpeta(t); await archivar({ destino, client: origen(), descargar });
  await assert.rejects(archivar({ destino, client: { get: async () => ({ success: false, status: 403 }) }, descargar }));
  assert.equal(JSON.parse(await fs.readFile(path.join(destino, 'manifiesto.json'), 'utf8')).completo, false);
  assert.deepEqual(await fs.readFile(path.join(destino, 'documentos/1.pdf')), pdf);
});

test('un archivo en enlace simbólico o fuera del alcance no se lee ni reemplaza', async t => {
  const destino = await carpeta(t); await archivar({ destino, client: origen(), descargar });
  const nombre = path.join(destino, 'documentos/1.pdf'); await fs.unlink(nombre); const ajeno = path.join(path.dirname(destino), 'ajeno.pdf');
  await fs.writeFile(ajeno, pdf, { mode: 0o600 }); await fs.symlink(ajeno, nombre);
  const m = await archivar({ destino, client: origen(), descargar }); assert.equal(m.completo, false);
  assert.deepEqual(await fs.readFile(ajeno), pdf); assert.ok((await fs.lstat(nombre)).isSymbolicLink());
});

test('un alcance distinto, manifiesto corrupto, otra descarga o carpeta con archivos se rechaza', async t => {
  const destino = await carpeta(t); await archivar({ destino, client: origen(), descargar });
  await assert.rejects(archivar({ destino, client: origen(), descargar, p: { desde: '2026-09-01', hasta: '2026-09-30' } }), /otro alcance/);
  await fs.writeFile(path.join(destino, '.en-curso'), 'otra descarga', { mode: 0o600 });
  await assert.rejects(archivar({ destino, client: origen(), descargar }), /bloqueo/); await fs.unlink(path.join(destino, '.en-curso'));
  await fs.writeFile(path.join(destino, 'manifiesto.json'), 'no es JSON');
  await assert.rejects(archivar({ destino, client: origen(), descargar }), /no se reemplazó/);
  assert.equal(await fs.readFile(path.join(destino, 'manifiesto.json'), 'utf8'), 'no es JSON');
});

test('el archivo fiscal se rechaza dentro del repositorio', async () => {
  await assert.rejects(archivar({ destino: path.join(__dirname, 'zz-archivo'), client: origen(), descargar }), /fuera de cualquier repositorio/);
});

test('páginas cortas con concurrencia no saltan documentos ni certifican un hueco', async t => {
  const destino = await carpeta(t), docs = Array.from({ length: 14 }, (_, i) => factura(i + 1));
  const client = origen(docs), get = client.get;
  client.get = async (ruta, params) => ruta === '/invoices'
    ? { success: true, data: docs.slice(params.start, params.start + 5) } : get(ruta, params);
  const m = await archivar({ destino, client, descargar, aLaVez: 3 });
  assert.ok(m.completo); assert.equal(m.resumen.archivadas, 14);
  const nuevo = path.join(path.dirname(destino), 'hueco');
  await assert.rejects(archivar({ destino: nuevo, client: { get: async (_ruta, params) => ({ success: true,
    data: params.start === 30 ? [factura(31)] : [] }) }, descargar }), /terminó/);
  assert.equal(JSON.parse(await fs.readFile(path.join(nuevo, 'manifiesto.json'), 'utf8')).completo, false);
});

test('varios escritores conservan cada confirmación y el último manifiesto completo', async t => {
  const destino = await carpeta(t), docs = Array.from({ length: 8 }, (_, i) => factura(i + 1));
  const m = await archivar({ destino, client: origen(docs), aLaVez: 5, descargar: async u => {
    await new Promise(r => setTimeout(r, Number(new URL(u).pathname.split('.')[0].slice(1)) % 3));
    return descargar(u);
  } });
  assert.ok(m.completo); assert.equal(m.resumen.archivadas, 8);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(destino, 'manifiesto.json'), 'utf8')), m);
  assert.equal((await fs.readdir(path.join(destino, 'documentos'))).length, 16);
  assert.ok(Object.values(m.documentos).every(d => d.archivos.pdf && d.archivos.xml));
});

test('un listado sin clave pide el detalle antes de declarar pendiente el original', async t => {
  const destino = await carpeta(t), client = origen([{ ...factura(), stamp: {} }]);
  const get = client.get;
  client.get = async (ruta, params) => ruta === '/invoices/1' ? { success: true, data: urls(factura()) } : get(ruta, params);
  const m = await archivar({ destino, client, descargar });
  assert.ok(m.completo); assert.equal(m.resumen.archivadas, 1);
});

test('un original sin clave también en la ficha se reporta, sin impedir archivar los demás', async t => {
  const destino = await carpeta(t), client = origen([factura(), { ...factura(2), stamp: {} }]);
  const m = await archivar({ destino, client, descargar });
  assert.equal(m.completo, false); assert.equal(m.resumen.electronicas, 2); assert.equal(m.resumen.archivadas, 1);
  assert.deepEqual(m.fallos, [{ alegraId: '2', motivo: 'Alegra no informó una clave fiscal de 50 dígitos.' }]);
  assert.deepEqual(Object.keys(m.documentos), ['1']);
});
