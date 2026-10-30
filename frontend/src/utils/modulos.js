/**
 * Espejo del catálogo de módulos que vive en
 * backend/src/modules/usuarios/modulos.js, que es la fuente única.
 *
 * Existe acá porque el menú necesita el ícono y la ruta de React, y esos no
 * pueden viajar desde el servidor. Lo que sí tiene que coincidir son las
 * CLAVES: hay un test en el backend (tests/permisosModulos.test.js) que
 * compara las dos listas y falla si se separan. Si agregás un módulo, va en
 * los dos lados o las pruebas lo marcan.
 *
 * Esto NO autoriza nada: solo decide qué se dibuja. Quien sepa la URL de la
 * API la llama igual — el permiso lo hace valer requirePermiso en el backend.
 */

export const MODULOS = [
  { clave: 'dashboard', nombre: 'Dashboard', grupo: 'General', ruta: '/' },

  { clave: 'facturacion', nombre: 'Facturación', grupo: 'Ventas', ruta: '/facturacion' },
  { clave: 'cotizaciones', nombre: 'Cotizaciones', grupo: 'Ventas', ruta: '/cotizaciones' },
  { clave: 'facturas-bodega', nombre: 'Facturas en Bodega', grupo: 'Ventas', ruta: '/facturas-bodega' },
  { clave: 'clientes', nombre: 'Clientes', grupo: 'Ventas', ruta: '/clientes' },
  { clave: 'preventa', nombre: 'Preventa', grupo: 'Ventas', ruta: '/preventa' },
  { clave: 'seguimiento-agentes', nombre: 'Seguimiento de agentes', grupo: 'Ventas', ruta: '/seguimiento' },
  { clave: 'entregas', nombre: 'Carga y Entregas', grupo: 'Ventas', ruta: '/entregas' },
  { clave: 'cuentas-por-cobrar', nombre: 'Cuentas por Cobrar', grupo: 'Ventas', ruta: '/cuentas-por-cobrar' },
  { clave: 'reporte-clientes', nombre: 'Reporte Clientes', grupo: 'Ventas', ruta: '/reportes/clientes' },
  { clave: 'impresion', nombre: 'Impresión', grupo: 'Ventas', ruta: '/impresion' },

  { clave: 'revision-precios', nombre: 'Revisión de Precios', grupo: 'Compras', ruta: '/revision-precios' },
  { clave: 'gestionar-relaciones', nombre: 'Gestionar Relaciones', grupo: 'Compras', ruta: '/gestionar-relaciones' },
  { clave: 'reporte-proveedores', nombre: 'Reporte Proveedores', grupo: 'Compras', ruta: '/reportes/proveedores' },
  { clave: 'pagos-proveedores', nombre: 'Pago Proveedores', grupo: 'Compras', ruta: '/pagos-proveedores' },
  { clave: 'pagos-recurrentes', nombre: 'Pagos Recurrentes', grupo: 'Compras', ruta: '/pagos-recurrentes' },
  { clave: 'gastos-operativos', nombre: 'Gastos operativos', grupo: 'Compras', ruta: '/gastos-operativos' },

  { clave: 'inventario-auditoria', nombre: 'Auditoría Inventario', grupo: 'Inventario', ruta: '/inventario-auditoria' },
  { clave: 'gestion-catalogo', nombre: 'Gestión de Catálogo', grupo: 'Inventario', ruta: '/gestion-catalogo' },

  { clave: 'caja-general', nombre: 'Caja General', grupo: 'Finanzas', ruta: '/caja-general' },
  { clave: 'rentabilidad', nombre: 'Rentabilidad', grupo: 'Finanzas', ruta: '/rentabilidad' },
  { clave: 'reporte-contador', nombre: 'Reporte Contador', grupo: 'Finanzas', ruta: '/reporte-contador' },

  { clave: 'catalogo-agente', nombre: 'Catálogo del agente', grupo: 'Herramientas', ruta: '/catalogo-agente' },
  { clave: 'configuracion', nombre: 'Configuración', grupo: 'Herramientas', ruta: '/configuracion' }
]

/**
 * Permisos de ACCIÓN dentro de un módulo: se otorgan aparte aunque la persona
 * tenga el módulo, y en el tablero salen debajo de él. Espeja
 * `PERMISOS_DE_ACCION` del backend (usuarios/modulos.js); una prueba compara
 * las claves.
 *
 * `precio-factura`: sin él, Facturación no deja tocar precio ni descuento
 * (2026-10-29, el usuario: «el precio y descuento no lo puede tocar»).
 * `cobro-factura`: sin él, no ofrece cobrar al facturar («de momento este no
 * podrá cobrar»). `facturas-todas`: sin él, solo ve las facturas que hizo
 * («el agente ve solo sus facturas»). `rutas-todas`: sin él, Preventa muestra
 * solo las rutas que se le asignaron. Quien lo hace valer es el servidor;
 * esto solo decide qué se dibuja.
 */
export const PERMISOS_DE_ACCION = [
  { clave: 'precio-factura', modulo: 'facturacion', nombre: 'Cambiar precio y descuento' },
  { clave: 'cobro-factura', modulo: 'facturacion', nombre: 'Cobrar al facturar' },
  { clave: 'facturas-todas', modulo: 'facturacion', nombre: 'Ver las facturas de todos' },
  { clave: 'rutas-todas', modulo: 'preventa', nombre: 'Ver todas las rutas' }
]

/** Ruta de React -> clave del módulo, para filtrar el menú. */
export const CLAVE_POR_RUTA = Object.fromEntries(MODULOS.map(m => [m.ruta, m.clave]))

/** Los módulos agrupados, como se muestran en el tablero de permisos. */
export function porGrupo() {
  const grupos = []
  for (const m of MODULOS) {
    const ultimo = grupos[grupos.length - 1]
    const conAcciones = { ...m, acciones: PERMISOS_DE_ACCION.filter(a => a.modulo === m.clave) }
    if (ultimo && ultimo.grupo === m.grupo) ultimo.modulos.push(conAcciones)
    else grupos.push({ grupo: m.grupo, modulos: [conAcciones] })
  }
  return grupos
}

/**
 * Rutas que no son un módulo pero exigen ser administrador.
 *
 * Sin esta lista quedaban abiertas: no están en el catálogo, así que
 * `puedeVer` las trataba como "ruta interna" y las dejaba pasar. La API sí
 * las rechaza (403), pero la pantalla igual se abría y se llenaba de errores
 * en vez de decir que no hay acceso. Espeja RUTAS_ADMIN del backend.
 */
export const RUTAS_ADMIN = ['/usuarios']

/**
 * Acciones que solo hace un administrador AUNQUE la persona tenga el módulo.
 *
 * Decisión del usuario (2026-10-03): anular una factura, anular un cobro y
 * reabrir una caja ya cerrada. Espeja `ACCIONES_ADMIN` del backend
 * (usuarios/modulos.js); una prueba compara las dos listas.
 *
 * Esto solo decide si se DIBUJA el botón. Quien protege es el servidor, que
 * responde 403 aunque alguien llame la ruta a mano.
 */
export const ACCIONES_SOLO_ADMIN = ['anular-factura', 'anular-cobro', 'reabrir-caja', 'corregir-entrega']

export function puedeAccion(usuario, clave) {
  if (!usuario) return false
  if (ACCIONES_SOLO_ADMIN.includes(clave)) return Boolean(usuario.esAdmin)
  if (PERMISOS_DE_ACCION.some(a => a.clave === clave)) {
    return Boolean(usuario.esAdmin) || (usuario.modulos || []).includes(clave)
  }
  return true
}

/**
 * ¿Este usuario ve esta ruta?
 *
 * Una ruta que no está en el catálogo (por ejemplo /relacionar-productos/:id,
 * que es un paso interno de Revisión de Precios) se deja pasar: no es una
 * pantalla del menú y bloquearla rompería un flujo sin decir por qué.
 */
export function puedeVer(usuario, ruta) {
  if (!usuario) return false
  if (usuario.esAdmin) return true

  if (RUTAS_ADMIN.some(p => ruta === p || ruta.startsWith(`${p}/`))) return false

  const clave = CLAVE_POR_RUTA[ruta]
  if (!clave) return true
  return (usuario.modulos || []).includes(clave)
}

/**
 * La primera pantalla que esta persona puede ver: el inicio (Dashboard) si lo
 * tiene, y si no, su primer módulo en el orden del menú. Null si no ve ninguno.
 *
 * Sin esto, quien no tiene Dashboard —el agente de ventas, 2026-10-29— entraba
 * al sistema y caía en «No tiene acceso a esta pantalla», con un «Volver al
 * inicio» que lo devolvía a lo mismo.
 */
export function inicioDe(usuario) {
  if (puedeVer(usuario, '/')) return '/'
  return MODULOS.find(m => m.ruta !== '/' && puedeVer(usuario, m.ruta))?.ruta ?? null
}
