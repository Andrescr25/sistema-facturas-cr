/** Flujo real para un clon desechable. Los dobles cubren solo salidas externas. */
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const zz = s => `ZZ cadena ${s} ${randomUUID().slice(0, 8)}`;

async function crear(db, { factor = 1, prepararFisico = true } = {}) {
  require('../../config/aislado').asegurarBaseLocal();
  assert.equal(process.env.PROBAR_BASE_LOCAL, '1');
  assert.ok(process.env.NODE_TEST_CONTEXT, 'La simulación solo corre con node --test.');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /^\/tachi_codex_[a-z0-9_]+$/);
  assert.ok(Number.isFinite(factor) && factor > 0);
  const avisos = require('../../src/modules/portal-clientes/avisoPedidoNuevo');
  const avisoOriginal = avisos.avisar;
  // Las preferencias reales de correo/WhatsApp no participan en el ensayo.
  avisos.avisar = async () => {};
  const cargar = (carpeta, nombre) => require(`../../src/modules/${carpeta}/${nombre}`);
  const s = {
    rutas: cargar('rutas', 'rutas.service'), clientes: cargar('clientes', 'clientes.service'),
    portal: cargar('portal-clientes', 'portal-clientes.cliente.service'), carrito: cargar('portal-clientes', 'portal-clientes.carrito.service'),
    agente: cargar('catalogo-agente', 'pedidos-agente.service'), pedidos: cargar('portal-clientes', 'portal-clientes.pedidos.service'),
    facturas: cargar('facturacion', 'facturaConsulta.service'), bodega: cargar('warehouse', 'bodegaPropia'),
    ordenes: cargar('orders-whatsapp', 'ordenesCiclo.service'), envio: cargar('orders-whatsapp', 'ordenesCicloEnvio.service'),
    facturaOrden: cargar('orders-whatsapp', 'ordenesCicloFactura.service'), compras: cargar('compras', 'compras.service'),
    recepcion: cargar('orders-whatsapp', 'ordenesCicloRecepcion.service'), cierre: cargar('orders-whatsapp', 'ordenesCicloCierre.service'),
    fisico: cargar('entregas', 'registroFisico.service'), entregas: cargar('entregas', 'entregas.service'),
    necesidades: cargar('reports', 'necesidades.service')
  };
  const actor = (await db.query("INSERT INTO usuario(usuario,nombre,password_hash,es_admin) VALUES($1,'ZZ supervisor cadena','ZZ no login',TRUE) RETURNING id", [zz('actor')])).rows[0].id;
  const ruta = await s.rutas.crearRuta({ nombre: zz('Ruta original') }, actor);
  const a = await s.clientes.crearCliente({ nombre: zz('Cliente A'), ruta_id: ruta.id, ubicacion_maps: 'https://maps.google.com/?q=9.9,-84.1' }, actor);
  const b = await s.clientes.crearCliente({ nombre: zz('Cliente B'), ruta_id: ruta.id, ubicacion_maps: 'https://maps.google.com/?q=9.91,-84.1' }, actor);
  const actual = await s.rutas.crearCiclo(ruta.id, { semana: '2026-10-12' }, actor);
  const proximo = await s.rutas.crearCiclo(ruta.id, { semana: '2026-10-19' }, actor);
  const impuesto = (await db.query('SELECT id FROM impuesto WHERE tarifa=13 AND activo LIMIT 1')).rows[0].id;
  const producto = (await db.query("INSERT INTO producto(nombre,referencia,precio_sin_iva,impuesto_id,cabys) VALUES($1,'ZZ-CAD',100,$2,'4294401030100') RETURNING id", [zz('Producto'), impuesto])).rows[0].id;
  const proveedor = (await db.query("INSERT INTO proveedor(nombre,identificacion,telefono_whatsapp) VALUES($1,$2,'88888888') RETURNING *", [zz('Proveedor'), randomUUID().slice(0, 18)])).rows[0];
  const mapping = (await db.query(`INSERT INTO supplier_product_mapping(id,supplier_name,supplier_cedula,supplier_code,supplier_desc,alegra_item_id,alegra_name,producto_id,proveedor_id,factor_conversion)
    VALUES($1,$2,$3,'ZZ-CAD','ZZ Producto','','',$4,$5,$6) RETURNING id`, [randomUUID(), proveedor.nombre, proveedor.identificacion, producto, proveedor.id, factor])).rows[0].id;
  const cuenta = (await db.query("INSERT INTO cliente_portal(cliente_id,nombre) VALUES($1,$2) RETURNING id", [a.id, a.nombre])).rows[0].id;
  const pedidoPortal = async (cicloId, cantidad) => {
    await s.carrito.ponerCantidad(cuenta, producto, cantidad);
    return s.portal.crearPedido(cuenta, { cicloId });
  };
  const pedidoA = await pedidoPortal(actual.id, 6);
  const pedidoB = (await s.agente.crear(actor, { clienteId: b.id, cicloId: actual.id, claveIdempotencia: randomUUID(), lineas: [{ productoId: producto, cantidad: 4 }] })).pedido;
  const pedidoProximo = await pedidoPortal(proximo.id, 4);
  const ids = [];
  for (const p of [pedidoA, pedidoB, pedidoProximo]) ids.push((await s.pedidos.facturar(p.id, actor)).facturaId);
  // Histórico importado: no fabricar una venta nueva ni un movimiento de stock.
  const historico = (await db.query(`INSERT INTO factura(numero,alegra_id,estado,fecha,cliente_id,cliente_nombre,total)
    VALUES($1,$2,'emitida','2000-01-01',$3,$4,200) RETURNING id`, [zz('HIST'), 'ZZH-' + randomUUID().slice(0, 8), a.id, a.nombre])).rows[0].id;
  await db.query("INSERT INTO factura_linea(factura_id,numero_linea,producto_id,nombre,cantidad,precio_unitario,total) VALUES($1,1,$2,'ZZ Histórico',2,100,200)", [historico, producto]);
  for (const [i, cantidad] of [6, 4, 4, 2].entries()) {
    const id = [...ids, historico][i];
    await s.bodega.registrarFaltantes(id, [{ producto_id: producto, cantidad_faltante: cantidad, tipo_faltante: 'parcial', observaciones: 'ZZ falta de este documento' }], 'ZZ Bodega');
    await db.query('UPDATE faltantes SET proveedor_asignado=$2,proveedor_cedula=$3 WHERE factura_propia_id=$1', [id, proveedor.nombre, proveedor.identificacion]);
    await s.bodega.actualizarEstado(id, { estado: 'procesado' });
  }
  const wa = require('../../src/integrations/whatsapp'), original = wa.enviarDocumento;
  const transportes = [];
  // No hay llamada de red: PDF/destino se capturan en memoria antes del acuse.
  wa.enviarDocumento = async doc => { transportes.push({ telefono: doc.telefono, pdf: doc.pdf }); return { enviado: true, numero: doc.telefono, via: 'interno' }; };
  const d = { db, s, actor, ruta, a, b, actual, proximo, producto, proveedor, mapping, factor, cuenta, pedidos: [pedidoA.id, pedidoB.id, pedidoProximo.id], facturas: ids, historico, transportes, liberar: () => { wa.enviarDocumento = original; avisos.avisar = avisoOriginal; } };
  try {
    d.ordenes = [];
    for (const [cicloId, cantidad] of [[actual.id, 10], [proximo.id, 4], ['sin-ciclo', 2]]) {
      // La demanda/físico usan unidades propias; las cajas del proveedor son
      // enteras. El excedente redondeado no se asigna a otra semana.
      // Bodega ya creó el borrador automático. Revisar ese pedido, como hace
      // la pantalla, conserva la cobertura; fabricar otro compraría dos veces.
      const abiertas = await s.ordenes.listar({ proveedorId: proveedor.id, cicloId });
      assert.equal(abiertas.length, 1, 'debe existir el borrador automático de este contexto');
      let o = await s.ordenes.obtener(abiertas[0].id);
      o = await s.ordenes.editar(o.id, { version: o.version, lineas: [{ productoId: producto, cantidadProveedor: Math.ceil(cantidad / factor) }] }, actor);
      o = await s.ordenes.cambiarEstado(o.id, { version: o.version, estado: 'pendiente_enviar' }, actor);
      o = await s.envio.preparar(o.id, { version: o.version, clave: randomUUID(), telefono: '88888888', mensaje: 'ZZ orden revisada ' + o.referencia }, actor);
      d.ordenes.push(await s.envio.enviar(o.id, o.envios[0].id, { confirmar: true }, actor));
    }
    // Datos del buzón revisados: registro comercial y físico siguen separados.
    d.vinculos = [];
    for (const [i, cantidad] of [10, 4].entries()) {
      const cantidadProveedor = Math.ceil(cantidad / factor);
      const id = randomUUID(), linea = randomUUID(), clave = Array.from(randomBytes(50), n => n % 10).join('');
      await db.query(`INSERT INTO facturas_proveedores(id,clave,numero_consecutivo,proveedor_nombre,proveedor_cedula,fecha_emision,fecha_procesada,total_productos,total_factura,archivo_xml,estado,porcentaje_relacionado)
        VALUES($1,$2,$3,$4,$5,'2026-10-06',NOW(),1,$6,'ZZ.xml','PROCESADA',0)`, [id, clave, 'ZZ-' + randomUUID().slice(0, 8), proveedor.nombre, proveedor.identificacion, cantidadProveedor * 10]);
      await db.query(`INSERT INTO productos_factura_proveedor(id,factura_id,numero_linea,codigo_proveedor,descripcion,cantidad,unidad_medida,precio_unitario,descuento,impuesto,total_linea,producto_id,mapeo_id,estado_relacionado)
        VALUES($1,$2,1,'ZZ-CAD','ZZ Producto',$3,'Unid',10,0,0,$4,$5,$6,'PENDIENTE')`, [linea, id, cantidadProveedor, cantidadProveedor * 10, producto, mapping]);
      const o = d.ordenes[i], p = await s.facturaOrden.proponer(o.id, id);
      const v = await s.facturaOrden.vincular(o.id, { clave: randomUUID(), facturaId: id, version: p.version, revision: p.revision, confirmar: true }, actor);
      const vinculo = v.facturas[0].id;
      const conPdf = await s.facturaOrden.guardarPdf(o.id, vinculo, { clave: randomUUID(), tipo: 'representacion_buzon' }, null, actor);
      const pdfId = conPdf.facturas[0].pdfs[0].id;
      await s.compras.registrarCompra(id, {}, actor);
      d.vinculos.push({ id, vinculo, pdfId });
    }
    await recibir(d, 0, 4);
    await recibir(d, 1, 1);
    if (prepararFisico) {
      await s.rutas.cambiarEstadoCiclo(actual.id, { estado: 'preparacion', estadoAnterior: 'preventa' }, actor);
      await s.rutas.cambiarEstadoCiclo(actual.id, { estado: 'entrega', estadoAnterior: 'preparacion' }, actor);
      d.cargaOriginal = await solicitudFisica(d, 0, 'carga', 3);
      await s.fisico.registrar(ids[0], d.cargaOriginal, actor);
      await evento(d, 0, 'entrega', 1);
      await evento(d, 2, 'carga', 1);
    }
    return d;
  } catch (e) { d.liberar(); throw e; }
}
async function recibir(d, i, cantidad, final = false) {
  const o = d.ordenes[i], p = await d.s.recepcion.consultar(o.id);
  const body = { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, final, motivos: [], lineas: cantidad ? [{ lineaId: p.lineas[0].id, cantidad }] : [] };
  return d.s.recepcion.registrar(o.id, body, d.actor);
}
async function solicitudFisica(d, i, accion, cantidad, motivo = null) {
  const p = await d.s.fisico.consultar(d.facturas[i]);
  return { clave: randomUUID(), version: p.version, revision: p.revision, confirmar: true, accion, lineas: cantidad ? [{ numeroLinea: 1, cantidad }] : [], motivo };
}
async function evento(d, i, accion, cantidad, motivo = null) {
  return d.s.fisico.registrar(d.facturas[i], await solicitudFisica(d, i, accion, cantidad, motivo), d.actor);
}
async function mover(d, { promover = true } = {}) {
  const nueva = await d.s.rutas.crearRuta({ nombre: zz('Ruta posterior') }, d.actor);
  await d.s.clientes.editarCliente(d.a.id, { ruta_id: nueva.id, nombre: zz('A renombrado'), ubicacion_maps: 'https://maps.google.com/?q=10.1,-84.2' }, d.actor);
  await d.s.clientes.editarCliente(d.b.id, { nombre: zz('B renombrado'), ubicacion_maps: 'https://maps.google.com/?q=10.2,-84.3' }, d.actor);
  await d.s.rutas.editarRuta(d.ruta.id, { nombre: zz('Ruta renombrada') }, d.actor);
  const futuro = await d.s.rutas.crearCiclo(d.ruta.id, { semana: '2026-10-26' }, d.actor);
  if (promover) {
    await d.s.rutas.cambiarEstadoCiclo(d.actual.id, { estado: 'cerrado', estadoAnterior: 'entrega' }, d.actor);
    await d.s.rutas.cambiarEstadoCiclo(d.proximo.id, { estado: 'preparacion', estadoAnterior: 'preventa' }, d.actor);
  }
  return { nueva, futuro };
}
module.exports = { crear, recibir, evento, solicitudFisica, mover };
