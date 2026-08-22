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
    clave: 'facturas-bodega',
    nombre: 'Facturas en Bodega',
    grupo: 'Ventas',
    ruta: '/facturas-bodega',
    rutasApi: ['/bodega', '/faltantes']
  },
  {
    clave: 'clientes',
    nombre: 'Clientes',
    grupo: 'Ventas',
    ruta: '/clientes',
    // El portal de clientes se administra desde acá: invitar, revocar y
    // facturar los pedidos que mandan.
    rutasApi: ['/portal-clientes']
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
    rutasApi: []   // usa /reportes, que comparte con Reporte Proveedores
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
    rutasApi: ['/revision-precios', '/productos-revision']
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
    rutasApi: ['/proveedores']
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
    rutasApi: []   // usa /alegra/catalog, compartida con Revisión de Precios
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
    rutasApi: ['/admin', '/duplicados-electronica']
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
 */
const COMPARTIDAS = [
  '/auth',        // entrar, ver quién soy, cambiar mi propia contraseña
  '/alegra',      // catálogo, contactos e imágenes de Alegra
  '/productos',   // el catálogo local
  '/facturas',    // consulta de facturas, la usan varias pantallas
  '/reportes'     // reporte de clientes y de proveedores comparten prefijo
];

/** Solo para administradores: gestionar usuarios y sus permisos. */
const RUTAS_ADMIN = ['/usuarios'];

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
 * A qué módulo pertenece un prefijo de la API, o null si es compartida.
 * Devuelve el módulo con el prefijo MÁS LARGO que coincida, para que
 * '/alegra/catalog' pudiera ganarle a '/alegra' si algún día hiciera falta.
 */
function moduloDeRuta(ruta) {
  let mejor = null;
  for (const m of MODULOS) {
    for (const prefijo of m.rutasApi) {
      if ((ruta === prefijo || ruta.startsWith(`${prefijo}/`))
        && (!mejor || prefijo.length > mejor.prefijo.length)) {
        mejor = { clave: m.clave, prefijo };
      }
    }
  }
  return mejor ? mejor.clave : null;
}

function esCompartida(ruta) {
  return COMPARTIDAS.some(p => ruta === p || ruta.startsWith(`${p}/`));
}

function esRutaAdmin(ruta) {
  return RUTAS_ADMIN.some(p => ruta === p || ruta.startsWith(`${p}/`));
}

module.exports = {
  MODULOS, CLAVES, COMPARTIDAS, RUTAS_ADMIN,
  porGrupo, moduloDeRuta, esCompartida, esRutaAdmin
};
