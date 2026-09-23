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
    // Debajo de /alegra (compartida), pero más específico: gana este. Antes
    // estaba vacío y cualquiera con sesión podía borrar productos o cambiar
    // categorías en Alegra en lote. Lo que otras pantallas necesitan leer de
    // acá adentro está en COMPARTIDAS, con su prefijo propio.
    rutasApi: ['/alegra/catalog']
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
 *
 * GANA EL PREFIJO MÁS ESPECÍFICO, sea de módulo o compartido (ver
 * `clasificarRuta`): '/alegra/catalog' (Gestión de Catálogo) le gana a
 * '/alegra', y '/alegra/catalog/search-images' (compartida) le gana a
 * '/alegra/catalog'. Así un módulo puede ser dueño de un pedazo de un prefijo
 * compartido sin cerrarle a nadie el resto.
 */
const COMPARTIDAS = [
  '/auth',        // entrar, ver quién soy, cambiar mi propia contraseña
  '/alegra',      // catálogo, contactos e imágenes de Alegra
  '/productos',   // el catálogo local
  '/facturas',    // consulta de facturas, la usan varias pantallas
  '/reportes',    // reporte de clientes y de proveedores comparten prefijo
  // Lecturas de /alegra/catalog que usan pantallas de otros módulos:
  '/alegra/catalog/search-images',           // Relacionar Productos (sugerir foto)
  '/alegra/catalog/imagenes-por-referencia', // Bodega (foto de cada línea)
  '/alegra/catalog/image-proxy'              // miniaturas (además es pública, ver auth.middleware)
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
 * De quién es una ruta: el prefijo MÁS LARGO que calce, entre los de los
 * módulos y los compartidos. `null` si ninguno calza.
 *
 * Antes se miraba primero si era compartida, y eso dejaba abierto cualquier
 * módulo que viviera debajo de un prefijo compartido — Gestión de Catálogo,
 * debajo de /alegra, quedaba al alcance de cualquiera con sesión.
 */
function clasificarRuta(ruta) {
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

function esRutaAdmin(ruta) {
  return RUTAS_ADMIN.some(p => ruta === p || ruta.startsWith(`${p}/`));
}

module.exports = {
  MODULOS, CLAVES, COMPARTIDAS, RUTAS_ADMIN,
  porGrupo, clasificarRuta, moduloDeRuta, esCompartida, esRutaAdmin
};
