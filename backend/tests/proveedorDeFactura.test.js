const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

/**
 * El proveedor que no existe se crea al registrar su factura, con sus datos
 * (2026-11-25, el usuario: «que al momento de registrar la compra el sistema
 * cree este proveedor con todos sus datos»).
 *
 * Lo que se cuida: que lo firmado en el XML mande, que sin XML alcance con lo
 * del buzón, que un dato inválido quede vacío en vez de frenar la compra, y
 * que un proveedor que ya existe se use tal cual, sin bitácora de «crear».
 */

const rutaAlmacen = path.join(__dirname, '..', 'src', 'integrations', 'almacenamiento', 'index.js');
const rutaServicio = path.join(__dirname, '..', 'src', 'modules', 'proveedores', 'proveedorDeFactura.js');

const XML = `<?xml version="1.0" encoding="utf-8"?>
<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
  <Clave>50625112600310292086700100002010000000029100000001</Clave>
  <NumeroConsecutivo>00100002010000000029</NumeroConsecutivo>
  <FechaEmision>2026-11-25T10:00:00-06:00</FechaEmision>
  <Emisor>
    <Nombre>3-102-920867 S.R.L</Nombre>
    <Identificacion><Tipo>02</Tipo><Numero>3102920867</Numero></Identificacion>
    <NombreComercial>ZZ Pesca del Valle</NombreComercial>
    <Ubicacion><Provincia>2</Provincia><Canton>01</Canton><Distrito>01</Distrito><OtrasSenas>100 m norte del parque</OtrasSenas></Ubicacion>
    <Telefono><CodigoPais>506</CodigoPais><NumTelefono>24401234</NumTelefono></Telefono>
    <CorreoElectronico>Ventas@PescaDelValle.com</CorreoElectronico>
  </Emisor>
  <CondicionVenta>02</CondicionVenta>
  <PlazoCredito>30</PlazoCredito>
  <ResumenFactura><CodigoTipoMoneda><CodigoMoneda>CRC</CodigoMoneda><TipoCambio>1</TipoCambio></CodigoTipoMoneda><TotalComprobante>7500.00</TotalComprobante></ResumenFactura>
</FacturaElectronica>`;

const FACTURA = {
  id: 'f-1', numero_consecutivo: '00100002010000000029', proveedor_cedula: '3102920867',
  proveedor_nombre: '3-102-920867 S.R.L', proveedor_email: 'DREAMSUCCESS1993@GMAIL.COM', proveedor_telefono: null,
  xml_ruta: 'compras-proveedor/xml-prueba.xml'
};

function montar({ xml = XML, existentes = [] } = {}) {
  const log = [];
  require.cache[rutaAlmacen] = {
    id: rutaAlmacen, filename: rutaAlmacen, loaded: true,
    exports: { leerArchivoPrivado: async () => (xml ? Buffer.from(xml) : null) }
  };
  delete require.cache[rutaServicio];
  const db = {
    query: async (sql, params = []) => {
      const texto = String(sql).replace(/\s+/g, ' ').trim();
      log.push({ sql: texto, params });
      if (/FROM proveedor WHERE/.test(texto)) return { rows: existentes.map((p) => ({ ...p })) };
      if (/FROM plazo_credito/.test(texto)) return { rows: { 0: [{ id: 1 }], 30: [{ id: 5 }] }[params[0]] || [] };
      if (/INSERT INTO proveedor/.test(texto)) {
        const columnas = texto.match(/INSERT INTO proveedor \(([^)]+)\)/)[1].split(', ');
        return { rows: [{ id: 90, ...Object.fromEntries(columnas.map((c, i) => [c, params[i]])), recien_creado: true }] };
      }
      if (/INSERT INTO bitacora_cambio/.test(texto)) return { rows: [{ id: '1' }] };
      return { rows: [] };
    }
  };
  return { servicio: require(rutaServicio), db, log };
}

const insertado = (log) => {
  const l = log.find((x) => /INSERT INTO proveedor/.test(x.sql));
  const columnas = l.sql.match(/INSERT INTO proveedor \(([^)]+)\)/)[1].split(', ');
  return Object.fromEntries(columnas.map((c, i) => [c, l.params[i]]));
};

beforeEach(() => { for (const r of [rutaAlmacen, rutaServicio]) delete require.cache[r]; });

describe('proveedorDeFactura', () => {
  test('no existe: lo crea con todo lo que firma el XML', async () => {
    const { servicio, db, log } = montar();
    const r = await servicio.proveedorDeFactura(db, FACTURA, 4);
    assert.equal(r.creado, true);
    assert.equal(r.proveedor.id, 90);
    assert.equal(r.proveedor.recien_creado, undefined, 'la marca interna no sale');
    const p = insertado(log);
    assert.equal(p.nombre, '3-102-920867 S.R.L');
    assert.equal(p.tipo_identificacion, 'CJ');
    assert.equal(p.identificacion, '3102920867', 'la cédula del buzón, tal cual: es la llave de sus compras');
    assert.equal(p.correo, 'ventas@pescadelvalle.com', 'el del XML manda sobre el del buzón');
    assert.equal(p.telefono, '2440 1234');
    assert.equal(p.plazo_credito_id, 5, 'crédito a 30 días = el plazo de 30 días');
    assert.match(p.observaciones, /factura 00100002010000000029/);
    assert.match(p.observaciones, /Nombre comercial: ZZ Pesca del Valle/);
    assert.match(p.observaciones, /Dirección: 100 m norte del parque/);
    const b = log.find((x) => /INSERT INTO bitacora_cambio/.test(x.sql));
    assert.ok(b, 'queda en la bitácora');
    assert.ok(b.params.includes('crear'));
  });

  test('sin XML legible: alcanza con lo del buzón', async () => {
    const { servicio, db, log } = montar({ xml: null });
    const r = await servicio.proveedorDeFactura(db, FACTURA, 4);
    assert.equal(r.creado, true);
    const p = insertado(log);
    assert.equal(p.nombre, '3-102-920867 S.R.L');
    assert.equal(p.identificacion, '3102920867');
    assert.equal(p.correo, 'dreamsuccess1993@gmail.com');
    assert.equal(p.tipo_identificacion, null);
    assert.equal(p.telefono, null);
    assert.equal(p.plazo_credito_id, null);
  });

  test('un XML de otra cédula no se usa', async () => {
    const { servicio, db, log } = montar({ xml: XML.replace('<Numero>3102920867</Numero>', '<Numero>3101008166</Numero>') });
    await servicio.proveedorDeFactura(db, FACTURA, 4);
    const p = insertado(log);
    assert.equal(p.correo, 'dreamsuccess1993@gmail.com');
    assert.equal(p.tipo_identificacion, null);
  });

  test('un teléfono o correo que no sirve queda vacío y no frena', async () => {
    const xml = XML.replace('<NumTelefono>24401234</NumTelefono>', '<NumTelefono>123</NumTelefono>')
      .replace('Ventas@PescaDelValle.com', 'sin arroba');
    const { servicio, db, log } = montar({ xml });
    const r = await servicio.proveedorDeFactura(db, { ...FACTURA, proveedor_email: 'tampoco' }, 4);
    assert.equal(r.creado, true);
    const p = insertado(log);
    assert.equal(p.telefono, null);
    assert.equal(p.correo, null);
  });

  test('de contado: el plazo de 0 días', async () => {
    const { servicio, db, log } = montar({ xml: XML.replace('<CondicionVenta>02</CondicionVenta>', '<CondicionVenta>01</CondicionVenta>') });
    await servicio.proveedorDeFactura(db, FACTURA, 4);
    assert.equal(insertado(log).plazo_credito_id, 1);
  });

  test('ya existe: se usa ese, sin crear ni escribir bitácora', async () => {
    const { servicio, db, log } = montar({ existentes: [{ id: 18, nombre: 'Grupo FAVARCIA S.A.', identificacion: '3102920867' }] });
    const r = await servicio.proveedorDeFactura(db, FACTURA, 4);
    assert.deepEqual(r, { proveedor: { id: 18, nombre: 'Grupo FAVARCIA S.A.', identificacion: '3102920867' }, creado: false });
    assert.equal(log.some((x) => /INSERT INTO/.test(x.sql)), false);
    assert.match(log[0].sql, /ltrim\(regexp_replace\(identificacion/, 'compara sin guiones, espacios ni ceros al inicio');
  });

  test('dos fichas con la misma cédula: 409, no adivina', async () => {
    const { servicio, db } = montar({ existentes: [{ id: 1 }, { id: 2 }] });
    await assert.rejects(() => servicio.proveedorDeFactura(db, FACTURA, 4), (e) => e.status === 409);
  });

  test('sin cédula en la factura: 422', async () => {
    const { servicio, db } = montar();
    await assert.rejects(() => servicio.proveedorDeFactura(db, { ...FACTURA, proveedor_cedula: '' }, 4), (e) => e.status === 422);
  });
});
