/**
 * El catálogo de módulos del sistema: la lista contra la que se reparten los
 * permisos.
 *
 * ESTA ES LA FUENTE ÚNICA. El frontend tiene su espejo en
 * frontend/src/utils/modulos.js —necesita los íconos y las rutas de React,
 * que no pueden viajar desde acá— y hay un test que compara las dos listas y
 * falla si se separan (tests/modulosSincronizados.test.js). Ya pasó en este
 * sistema que una misma regla vivía en cuatro lugares y se arreglaba de a
 * uno; acá el desvío se ve en la primera corrida de pruebas.
 *
 * CÓMO SE AUTORIZA
 * `rutasApi` son los prefijos de la API que pertenecen SOLO a ese módulo.
 * Quien no tenga el permiso recibe 403 al llamarlos. Los prefijos que no
 * aparecen en ninguna lista son de uso compartido (ver COMPARTIDAS abajo) y
 * quedan disponibles para cualquiera que haya entrado: son las consultas de
 * catálogo y contactos que casi toda pantalla necesita para funcionar.
 */

const MODULOS = [
  {
    clave: 'dashboard',
    nombre: 'Dashboard',
    grupo: 'General',
    ruta: '/',
    rutasApi: ['/dashboard']
  },

  // ---- Ventas ----
  {
    clave: 'facturacion',
    nombre: 'Facturación',
    grupo: 'Ventas',
    ruta: '/facturacion',
    rutasApi: ['/facturacion']
  },
  {
    clave: 'cotizaciones',
    nombre: 'Cotizaciones',
    grupo: 'Ventas',
    ruta: '/cotizaciones',
    rutasApi: ['/cotizaciones']
  },
  {
    clave: 'facturas-bodega',
    nombre: 'Facturas en Bodega',
    grupo: 'Ventas',
    ruta: '/facturas-bodega',
    // La pantalla llama a /alegra/bodega (el router de Alegra también lo
    // monta): sin este prefijo, esas rutas caían en /alegra, compartida, y
    // cualquier usuario con sesión podía marcar facturas como despachadas.
    rutasApi: ['/bodega', '/alegra/bodega', '/faltantes']
  },
  {
    clave: 'clientes',
    nombre: 'Clientes',
    grupo: 'Ventas',
    ruta: '/clientes',
    // La ficha del cliente (/clientes) y el portal, que se administra desde
    // la misma pantalla: invitar, revocar y facturar los pedidos que mandan.
    rutasApi: ['/portal-clientes', '/clientes']
  },
  {
    clave: 'cuentas-por-cobrar',
    nombre: 'Cuentas por Cobrar',
    grupo: 'Ventas',
    ruta: '/cuentas-por-cobrar',
    rutasApi: ['/cuentas-por-cobrar']
  },
  {
    clave: 'reporte-clientes',
    nombre: 'Reporte Clientes',
    grupo: 'Ventas',
    ruta: '/reportes/clientes',
    // El Excel pertenece al módulo aunque el reporte antiguo comparta prefijo.
    rutasApi: ['/reportes/faltantes/cliente/exportar', '/alegra/reportes/faltantes/cliente/exportar']
  },
  {
    clave: 'impresion',
    nombre: 'Impresión',
    grupo: 'Ventas',
    ruta: '/impresion',
    rutasApi: ['/reimpresion']
  },

  // ---- Compras ----
  {
    clave: 'revision-precios',
    nombre: 'Revisión de Precios',
    grupo: 'Compras',
    ruta: '/revision-precios',
    // '/compras' es la misma pantalla: "Enviar a Alegra" pasó a ser
    // "Registrar compra" (independencia-alegra, sección 8). No es un módulo
    // aparte a propósito — nace con permiso nuevo obligaría a repartirlo de
    // nuevo a quien ya tenía acceso a Revisión de Precios.
    rutasApi: ['/revision-precios', '/productos-revision', '/compras']
  },
  {
    clave: 'gestionar-relaciones',
    nombre: 'Gestionar Relaciones',
    grupo: 'Compras',
    ruta: '/gestionar-relaciones',
    rutasApi: []   // trabaja sobre /productos y /facturas, compartidas
  },
  {
    clave: 'reporte-proveedores',
    nombre: 'Reporte Proveedores',
    grupo: 'Compras',
    ruta: '/reportes/proveedores',
    rutasApi: ['/proveedores', '/reportes/faltantes/proveedor/exportar', '/alegra/reportes/faltantes/proveedor/exportar']
  },
  {
    clave: 'pagos-proveedores',
    nombre: 'Pago Proveedores',
    grupo: 'Compras',
    ruta: '/pagos-proveedores',
    rutasApi: ['/pagos-proveedores']
  },
  {
    clave: 'pagos-recurrentes',
    nombre: 'Pagos Recurrentes',
    grupo: 'Compras',
    ruta: '/pagos-recurrentes',
    rutasApi: ['/pagos-recurrentes']
  },

  // ---- Inventario ----
  {
    clave: 'inventario-auditoria',
    nombre: 'Auditoría Inventario',
    grupo: 'Inventario',
    ruta: '/inventario-auditoria',
    rutasApi: ['/inventario-auditorias']
  },
  {
    clave: 'gestion-catalogo',
    nombre: 'Gestión de Catálogo',
    grupo: 'Inventario',
    ruta: '/gestion-catalogo',
    // /maestro: productos y categorías propios (lo que esta pantalla edita).
    // La Gestión de Catálogo vieja (/alegra/catalog) se retiró el 2026-10-04.
    rutasApi: ['/maestro']
  },

  // ---- Finanzas ----
  {
    clave: 'rentabilidad',
    nombre: 'Rentabilidad',
    grupo: 'Finanzas',
    ruta: '/rentabilidad',
    rutasApi: ['/rentabilidad']
  },
  {
    clave: 'reporte-contador',
    nombre: 'Reporte Contador',
    grupo: 'Finanzas',
    ruta: '/reporte-contador',
    rutasApi: ['/reporte-contador']
  },

  // ---- Herramientas ----
  {
    clave: 'catalogo-agente',
    nombre: 'Catálogo del agente',
    grupo: 'Herramientas',
    ruta: '/catalogo-agente',
    rutasApi: ['/catalogo-agente']
  },
  {
    clave: 'configuracion',
    nombre: 'Configuración',
    grupo: 'Herramientas',
    ruta: '/configuracion',
    rutasApi: ['/admin', '/configuracion']
  }
];

/**
 * Prefijos de API que NO pertenecen a un módulo: los usa media aplicación
 * para consultar el catálogo de Alegra, los productos o los contactos. Se
 * listan explícito para dejar dicho que quedan al alcance de cualquiera que
 * haya entrado al sistema — no son un olvido.
 *
 * No exponen decisiones de plata (márgenes, saldos, costos por proveedor):
 * eso vive en los módulos de arriba, que sí piden permiso.
 *
 * GANA EL PREFIJO MÁS ESPECÍFICO, sea de módulo o compartido (ver
 * `clasificarRuta`): '/alegra/bodega' (Facturas en Bodega) le gana a
 * '/alegra'. Así un módulo puede ser dueño de un pedazo de un prefijo
 * compartido sin cerrarle a nadie el resto.
 */
const COMPARTIDAS = [
  '/auth',        // entrar, ver quién soy, cambiar mi propia contraseña
  '/alegra',      // catálogo, contactos e imágenes de Alegra
  '/productos',   // el catálogo local
  '/reportes',    // reporte de clientes y de proveedores comparten prefijo
  // Impuestos, métodos de pago, plazos, cuentas y productos activos; la foto
  // de cada referencia (Bodega) y las fotos sugeridas (Gestión de Catálogo y
  // Relacionar Productos). Solo lecturas.
  '/catalogos',
  // Los teléfonos de un cliente y a quién ya se le mandó un documento: lo
  // leen Facturación, Cotizaciones, Cuentas por Cobrar y Clientes antes de
  // mandar un WhatsApp. Solo lecturas; cada envío es una ruta de su módulo.
  // Estaba sin clasificar: pasaba igual, pero por omisión y no por decisión.
  '/envios-whatsapp'
];

/** Solo para administradores: gestionar usuarios y sus permisos. */
const RUTAS_ADMIN = ['/usuarios'];

/**
 * Acciones que exigen administrador AUNQUE la persona tenga el módulo.
 *
 * Decisión del usuario, 2026-10-03 (sección 14 del checklist): anular una
 * factura, anular un cobro y reabrir una caja ya cerrada. Las tres deshacen
 * plata ya contada. Crear o anular una nota de crédito y editar una factura
 * emitida las sigue haciendo quien tenga el módulo —Impresión edita facturas
 * todos los días al rebajar faltantes—, y cerrar la caja también: es el
 * trabajo de quien cobra.
 *
 * `clave` es el nombre con que la pantalla pregunta si puede mostrar el botón
 * (el espejo está en frontend/src/utils/modulos.js y una prueba los compara).
 * Lo que protege de verdad es `requirePermiso`: el botón escondido es cosmética.
 */
const ACCIONES_ADMIN = [
  { clave: 'anular-factura', metodo: 'PATCH', patron: /^\/facturacion\/facturas\/[^/]+\/anular$/, que: 'anular una factura' },
  { clave: 'anular-cobro', metodo: 'PATCH', patron: /^\/cuentas-por-cobrar\/propios\/abonos\/[^/]+\/anular$/, que: 'anular un cobro' },
  { clave: 'reabrir-caja', metodo: 'POST', patron: /^\/cuentas-por-cobrar\/propios\/caja\/reabrir$/, que: 'reabrir una caja cerrada' }
];

/**
 * La ruta como la va a entender Express, que es más permisivo que una
 * comparación de textos: no distingue mayúsculas y acepta la barra final.
 *
 * SIN ESTO EL PERMISO SE SALTABA CAMBIANDO UNA LETRA. Medido el 2026-10-03
 * con un usuario común: `/api/usuarios` respondía 403 y `/api/Usuarios`
 * respondía 200. El guardián comparaba '/Usuarios' contra '/usuarios', no
 * calzaba con nada, la trataba como ruta sin clasificar y la dejaba pasar; y
 * Express, que no distingue mayúsculas, la entregaba al módulo. Así se abría
 * cualquier módulo —y la gestión de usuarios— a cualquiera con sesión.
 */
function normalizarRuta(ruta) {
  let texto = String(ruta || '');
  // Por si llega codificada (%55suarios): se clasifica lo que de verdad dice.
  try { texto = decodeURIComponent(texto); } catch { /* se queda como vino */ }
  texto = texto.toLowerCase().replace(/\/{2,}/g, '/');
  return texto.length > 1 ? texto.replace(/\/+$/, '') : texto;
}

const CLAVES = MODULOS.map(m => m.clave);

/** Los módulos agrupados como se muestran en la pantalla de permisos. */
function porGrupo() {
  const grupos = [];
  for (const m of MODULOS) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grupo === m.grupo) ultimo.modulos.push(m);
    else grupos.push({ grupo: m.grupo, modulos: [m] });
  }
  return grupos;
}

/**
 * De quién es una ruta: el prefijo MÁS LARGO que calce, entre los de los
 * módulos y los compartidos. `null` si ninguno calza.
 *
 * Antes se miraba primero si era compartida, y eso dejaba abierto cualquier
 * módulo que viviera debajo de un prefijo compartido — Gestión de Catálogo,
 * debajo de /alegra, quedaba al alcance de cualquiera con sesión.
 */
function clasificarRuta(rutaCruda) {
  const ruta = normalizarRuta(rutaCruda);
  const calza = (p) => ruta === p || ruta.startsWith(`${p}/`);
  let mejor = null;
  for (const m of MODULOS) {
    for (const prefijo of m.rutasApi) {
      if (calza(prefijo) && (!mejor || prefijo.length > mejor.prefijo.length)) {
        mejor = { tipo: 'modulo', clave: m.clave, prefijo };
      }
    }
  }
  for (const prefijo of COMPARTIDAS) {
    if (calza(prefijo) && (!mejor || prefijo.length > mejor.prefijo.length)) {
      mejor = { tipo: 'compartida', clave: null, prefijo };
    }
  }
  return mejor;
}

/** A qué módulo pertenece una ruta, o null si es compartida o no tiene dueño. */
function moduloDeRuta(ruta) {
  const c = clasificarRuta(ruta);
  return c && c.tipo === 'modulo' ? c.clave : null;
}

function esCompartida(ruta) {
  const c = clasificarRuta(ruta);
  return Boolean(c) && c.tipo === 'compartida';
}

function esRutaAdmin(rutaCruda) {
  const ruta = normalizarRuta(rutaCruda);
  return RUTAS_ADMIN.some(p => ruta === p || ruta.startsWith(`${p}/`));
}

/** La acción de solo-administrador que es esta petición, o null. */
function accionDeAdmin(metodo, rutaCruda) {
  const ruta = normalizarRuta(rutaCruda);
  const m = String(metodo || '').toUpperCase();
  return ACCIONES_ADMIN.find(a => a.metodo === m && a.patron.test(ruta)) || null;
}

module.exports = {
  MODULOS, CLAVES, COMPARTIDAS, RUTAS_ADMIN, ACCIONES_ADMIN,
  porGrupo, clasificarRuta, moduloDeRuta, esCompartida, esRutaAdmin, accionDeAdmin, normalizarRuta
};
