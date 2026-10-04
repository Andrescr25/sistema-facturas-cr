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
  { clave: 'cuentas-por-cobrar', nombre: 'Cuentas por Cobrar', grupo: 'Ventas', ruta: '/cuentas-por-cobrar' },
  { clave: 'reporte-clientes', nombre: 'Reporte Clientes', grupo: 'Ventas', ruta: '/reportes/clientes' },
  { clave: 'impresion', nombre: 'Impresión', grupo: 'Ventas', ruta: '/impresion' },

  { clave: 'revision-precios', nombre: 'Revisión de Precios', grupo: 'Compras', ruta: '/revision-precios' },
  { clave: 'gestionar-relaciones', nombre: 'Gestionar Relaciones', grupo: 'Compras', ruta: '/gestionar-relaciones' },
  { clave: 'reporte-proveedores', nombre: 'Reporte Proveedores', grupo: 'Compras', ruta: '/reportes/proveedores' },
  { clave: 'pagos-proveedores', nombre: 'Pago Proveedores', grupo: 'Compras', ruta: '/pagos-proveedores' },
  { clave: 'pagos-recurrentes', nombre: 'Pagos Recurrentes', grupo: 'Compras', ruta: '/pagos-recurrentes' },

  { clave: 'inventario-auditoria', nombre: 'Auditoría Inventario', grupo: 'Inventario', ruta: '/inventario-auditoria' },
  { clave: 'gestion-catalogo', nombre: 'Gestión de Catálogo', grupo: 'Inventario', ruta: '/gestion-catalogo' },

  { clave: 'rentabilidad', nombre: 'Rentabilidad', grupo: 'Finanzas', ruta: '/rentabilidad' },
  { clave: 'reporte-contador', nombre: 'Reporte Contador', grupo: 'Finanzas', ruta: '/reporte-contador' },

  { clave: 'catalogo-agente', nombre: 'Catálogo del agente', grupo: 'Herramientas', ruta: '/catalogo-agente' },
  { clave: 'configuracion', nombre: 'Configuración', grupo: 'Herramientas', ruta: '/configuracion' }
]

/** Ruta de React -> clave del módulo, para filtrar el menú. */
export const CLAVE_POR_RUTA = Object.fromEntries(MODULOS.map(m => [m.ruta, m.clave]))

/** Los módulos agrupados, como se muestran en el tablero de permisos. */
export function porGrupo() {
  const grupos = []
  for (const m of MODULOS) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.grupo === m.grupo) ultimo.modulos.push(m)
    else grupos.push({ grupo: m.grupo, modulos: [m] })
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
export const ACCIONES_SOLO_ADMIN = ['anular-factura', 'anular-cobro', 'reabrir-caja']

export function puedeAccion(usuario, clave) {
  if (!usuario) return false
  if (ACCIONES_SOLO_ADMIN.includes(clave)) return Boolean(usuario.esAdmin)
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
