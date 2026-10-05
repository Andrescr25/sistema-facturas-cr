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
    rutasApi: [],
    // No tiene prefijo propio: su pantalla trabaja con las relaciones
    // proveedor ↔ producto, que son de Revisión de Precios
    // ('/productos-revision'), y lee la lista de proveedores para el filtro.
    // Quien tenía SOLO este módulo recibía 403 en cada llamada: veía la
    // pantalla en el menú y no cargaba nada. Decisión del usuario
    // (2026-10-04): usa esas rutas. Ver `modulosQuePuedenUsar`.
    tambienUsa: [
      { prefijo: '/productos-revision' },
      // Solo la lista, y solo leerla: no el resto de lo que cuelga de ahí.
      { prefijo: '/proveedores', exacta: true, metodos: ['GET'] }
    ]
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
    // "Limpiar faltantes procesados" es un botón de esta pantalla y de ninguna
    // otra. Su ruta cuelga de '/reportes' (y de '/alegra/reportes'), que son
    // compartidas: cualquiera con sesión podía borrar los faltantes ya
    // procesados. Decisión del usuario (2026-10-04): es de Configuración.
    rutasApi: [
      '/admin', '/duplicados-electronica',
      '/reportes/faltantes/proveedor/limpiar', '/alegra/reportes/faltantes/proveedor/limpiar'
    ]
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

/**
 * La ruta como la va a entender Express, que es más permisivo que una
 * comparación de textos: no distingue mayúsculas y acepta la barra final.
 *
 * SIN ESTO EL PERMISO SE SALTABA CAMBIANDO UNA LETRA. Medido el 2026-10-03:
 * `/api/usuarios` respondía 403 y `/api/Usuarios` respondía 200. El guardián
 * comparaba '/Usuarios' contra '/usuarios', no calzaba con nada, la trataba
 * como ruta sin clasificar y la dejaba pasar; y Express, que no distingue
 * mayúsculas, la entregaba al módulo. Así se abría cualquier módulo —y la
 * gestión de usuarios— a cualquiera con sesión, incluso a una cuenta ya
 * desactivada con el token todavía vigente.
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

/**
 * Los módulos con los que se puede usar una ruta: su dueño y los que la
 * tienen prestada (`tambienUsa`). Vacío si la ruta no es de ningún módulo.
 *
 * UNA RUTA TIENE UN SOLO DUEÑO, y así sigue: el dueño es quien responde por
 * ella y el que nombra el mensaje de "no tiene acceso". Prestar es para la
 * pantalla que trabaja con los datos de otro módulo sin tener API propia. Lo
 * prestado se dice ruta por ruta, con `exacta` y `metodos` cuando no hace
 * falta todo el prefijo: prestar de más es abrir de más.
 */
function modulosQuePuedenUsar(rutaCruda, metodo = 'GET') {
  const dueno = moduloDeRuta(rutaCruda);
  if (!dueno) return [];

  const ruta = normalizarRuta(rutaCruda);
  const verbo = String(metodo || 'GET').toUpperCase();
  const prestada = MODULOS
    .filter(m => (m.tambienUsa || []).some(p =>
      (p.exacta ? ruta === p.prefijo : (ruta === p.prefijo || ruta.startsWith(`${p.prefijo}/`))) &&
      (!p.metodos || p.metodos.includes(verbo))))
    .map(m => m.clave);

  return [dueno, ...prestada.filter(c => c !== dueno)];
}

module.exports = {
  MODULOS, CLAVES, COMPARTIDAS, RUTAS_ADMIN,
  porGrupo, clasificarRuta, moduloDeRuta, esCompartida, esRutaAdmin, normalizarRuta,
  modulosQuePuedenUsar
};
