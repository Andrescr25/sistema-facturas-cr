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
    // Marcar una factura como despachada y registrar lo que faltó.
    rutasApi: ['/bodega']
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
    clave: 'preventa',
    nombre: 'Preventa',
    grupo: 'Ventas',
    ruta: '/preventa',
    // Agenda interna; separada del catálogo por enlace y del portal.
    rutasApi: ['/preventa']
  },
  {
    clave: 'ingresos',
    nombre: 'Mis ingresos',
    grupo: 'Ventas',
    ruta: '/ingresos',
    // El empleado ve lo que va ganando y marca su jornada (2026-10-30). Lee
    // SIEMPRE lo de su propia sesión: con el permiso no se ve a otro.
    rutasApi: ['/ingresos']
  },
  {
    clave: 'entregas',
    nombre: 'Carga y Entregas',
    grupo: 'Ventas',
    ruta: '/entregas',
    // Permiso propio para agente/chofer sin abrir cuentas o ficha de clientes.
    rutasApi: ['/entregas']
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
    // El Excel pertenece al módulo aunque el reporte comparta prefijo con el
    // de proveedores. '/faltantes' son los ajustes de entrega (guardar y
    // quitar), que solo hace esta pantalla: cambiarle a un cliente lo que se
    // le entregó. Y debajo de '/reportes/faltantes/cliente/facturas' están
    // mandar una factura a la cola de impresión y recuperarla: botones de
    // esta pantalla que, por colgar de '/reportes' (compartida), podía usar
    // cualquiera con sesión. Decisión del usuario, 2026-10-04.
    // 2026-10-05: la lista/selector incorporan Maps del recorrido fijo,
    // por lo que su lectura también exige el permiso del reporte.
    rutasApi: ['/reportes/faltantes/cliente', '/reportes/faltantes/cliente/exportar', '/reportes/faltantes/cliente/facturas', '/faltantes']
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
    rutasApi: ['/revision-precios', '/productos-revision', '/compras'],
    tambienUsa: [{ prefijo: '/gastos-operativos/desde-factura', exacta: true, metodos: ['POST'] }]
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
      // Solo la lista, y solo leerla: de '/proveedores' cuelgan también las
      // fichas y las asignaciones, que se escriben.
      { prefijo: '/proveedores', exacta: true, metodos: ['GET'] }
    ]
  },
  {
    clave: 'reporte-proveedores',
    nombre: 'Reporte Proveedores',
    grupo: 'Compras',
    ruta: '/reportes/proveedores',
    // '/orden-compra' es la orden de compra que arma esta pantalla y nadie
    // más: cantidades, el PDF, el contacto del proveedor y el envío por
    // WhatsApp a un proveedor de verdad.
    // La procedencia por cliente y sus notas también son del reporte.
    rutasApi: ['/proveedores', '/reportes/faltantes/proveedor', '/reportes/faltantes/notas', '/reportes/faltantes/proveedor/exportar', '/orden-compra']
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
  {
    clave: 'gastos-operativos',
    nombre: 'Gastos operativos',
    grupo: 'Compras',
    ruta: '/gastos-operativos',
    rutasApi: ['/gastos-operativos']
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
    clave: 'caja-general',
    nombre: 'Caja General',
    grupo: 'Finanzas',
    ruta: '/caja-general',
    // Se conserva el servicio de movimientos y su URL. El prefijo específico
    // separa esta lectura de los cobros y cierres que siguen en CxC.
    rutasApi: ['/cuentas-por-cobrar/propios/caja/movimientos']
  },
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
  {
    clave: 'empleados',
    nombre: 'Empleados',
    grupo: 'Finanzas',
    ruta: '/empleados',
    // La planilla (2026-10-30): tarifas, jornadas, lo ganado y lo que se le debe
    // a cada empleado. El usuario: «desde mi panel administrador ver qué hizo,
    // cuántas horas, comisión, viáticos, el total que le debo». Y el día de cada
    // uno (recorrido, ventas, GPS): «el seguimiento de agente, pónmelo dentro de
    // empleados» — fue el módulo `seguimiento-agentes` hasta la migración 075.
    rutasApi: ['/empleados']
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
    // "Limpiar faltantes procesados" es un botón de esta pantalla
    // (Mantenimiento) y de ninguna otra. Su ruta cuelga de '/reportes', que es
    // compartida: cualquiera con sesión podía borrarlos. Decisión del usuario
    // (2026-10-04): es de Configuración.
    rutasApi: ['/admin', '/configuracion', '/reportes/faltantes/proveedor/limpiar']
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
 * `clasificarRuta`): '/reportes/faltantes/cliente/exportar' (Reporte
 * Clientes) le gana a '/reportes'. Así un módulo puede ser dueño de un pedazo
 * de un prefijo compartido sin cerrarle a nadie el resto.
 *
 * '/alegra' ESTUVO ACÁ hasta el 2026-10-04. Era el prefijo de un router que
 * juntaba media aplicación, y compartirlo entero dejó sin permiso, en
 * distintos momentos, la Gestión de Catálogo, Facturación, Bodega, Impresión,
 * los ajustes de entrega y las órdenes de compra. Un prefijo compartido tiene
 * que ser chico y de lectura; lo demás lleva dueño.
 */
const COMPARTIDAS = [
  '/auth',        // entrar, ver quién soy, cambiar mi propia contraseña
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
 * plata ya contada. Anular un pago a un empleado (2026-10-30) también: es
 * plata que ya salió de caja. Crear o anular una nota de crédito y editar una factura
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
  { clave: 'reabrir-caja', metodo: 'POST', patron: /^\/cuentas-por-cobrar\/propios\/caja\/reabrir$/, que: 'reabrir una caja cerrada' },
  { clave: 'corregir-entrega', metodo: 'POST', patron: /^\/entregas\/facturas\/[^/]+\/revision$/, que: 'corregir un registro físico de carga o entrega' },
  { clave: 'anular-pago-empleado', metodo: 'PATCH', patron: /^\/empleados\/pagos\/[^/]+\/anular$/, que: 'anular un pago a un empleado' }
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

/**
 * Permisos de ACCIÓN dentro de un módulo: algo que se otorga aparte, aunque la
 * persona ya tenga el módulo. Se guardan en `usuario_modulo` igual que un
 * módulo (un administrador los tiene todos), pero no son una pantalla: no
 * tienen ruta ni menú, y en el tablero de permisos salen debajo de su módulo.
 *
 * `precio-factura` (2026-10-29, el usuario sobre el agente de ventas: «el
 * precio y descuento no lo puede tocar»). Quien no lo tiene factura al precio
 * de lista, con solo la oferta vigente o el descuento del cliente; lo hace
 * valer el servidor (`facturacion/precioFijo.js`). La migración 068 se lo dio a
 * todos los que ya tenían Facturación: a nadie le cambió nada.
 *
 * `cobro-factura` (misma fecha: «de momento este no podrá cobrar»). Quien no
 * lo tiene factura sin registrar el pago en el momento: la factura queda
 * pendiente y la cobra quien tenga Cuentas por Cobrar. También lo dio la 068
 * a quien ya facturaba.
 *
 * `facturas-todas` (misma fecha: «el agente ve solo sus facturas»). Quien no lo
 * tiene ve, abre e imprime solo las facturas que hizo él
 * (`facturacion/soloSusFacturas.js`). También lo dio la 068.
 *
 * `rutas-todas` (en Preventa, misma fecha: el agente «se hará cargo de las
 * rutas poco a poco»). Quien no lo tiene ve en Preventa solo las rutas que se
 * le marcan en Usuarios (`usuarios/rutasAsignadas.js`). La 069 se lo dio a
 * quien ya tenía Preventa.
 *
 * Espejo en frontend/src/utils/modulos.js; una prueba compara las claves.
 */
const PERMISOS_DE_ACCION = [
  { clave: 'precio-factura', modulo: 'facturacion', nombre: 'Cambiar precio y descuento' },
  { clave: 'cobro-factura', modulo: 'facturacion', nombre: 'Cobrar al facturar' },
  { clave: 'facturas-todas', modulo: 'facturacion', nombre: 'Ver las facturas de todos' },
  { clave: 'rutas-todas', modulo: 'preventa', nombre: 'Ver todas las rutas' }
];

const CLAVES = [...MODULOS.map(m => m.clave), ...PERMISOS_DE_ACCION.map(a => a.clave)];

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

/** La acción de solo-administrador que es esta petición, o null. */
function accionDeAdmin(metodo, rutaCruda) {
  const ruta = normalizarRuta(rutaCruda);
  const m = String(metodo || '').toUpperCase();
  return ACCIONES_ADMIN.find(a => a.metodo === m && a.patron.test(ruta)) || null;
}

module.exports = {
  MODULOS, CLAVES, COMPARTIDAS, RUTAS_ADMIN, ACCIONES_ADMIN, PERMISOS_DE_ACCION,
  porGrupo, clasificarRuta, moduloDeRuta, esCompartida, esRutaAdmin, accionDeAdmin, normalizarRuta,
  modulosQuePuedenUsar
};
