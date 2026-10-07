---
id: modulo/exportaciones-reportes
tipo: modulo
titulo: Excel de los reportes propios — filtros, datos guardados y descarga sin escrituras
estado: vigente
archivos:
  - backend/src/modules/rutas/operacionCiclo.service.js
  - backend/tests/operacionCiclos.test.js
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/components/ContextoCicloDocumento.jsx
  - frontend/src/hooks/useFiltroCicloOperacion.js
  - backend/src/utils/exportarExcel.js
  - backend/src/modules/dashboard/dashboard.excel.js
  - backend/src/modules/rentabilidad/rentabilidad.excel.js
  - backend/src/modules/rentabilidad/rentabilidad.service.js
  - backend/src/modules/reports/report.excel.js
  - backend/src/modules/reports/report.service.js
  - backend/src/modules/reports/report.routes.js
  - backend/src/modules/usuarios/modulos.js
  - frontend/src/services/exportarExcelService.js
  - frontend/src/components/ui/BotonExportarExcel.jsx
  - frontend/src/hooks/useRentabilidad.js
  - frontend/src/pages/Dashboard.jsx
  - frontend/src/pages/Rentabilidad.jsx
  - frontend/src/pages/ReporteClientes.jsx
  - frontend/src/pages/ReporteProveedores.jsx
  - frontend/src/components/reporte-proveedores/ListaProveedores.jsx
  - backend/tests/exportarExcel.test.js
  - backend/tests/reportesExcelPropios.test.js
  - backend/tests/rentabilidad.test.js
aristas:
  relacionado: [modulo/exportaciones-operativas-ciclo, modulo/dashboard, modulo/rentabilidad, modulo/faltantes, modulo/reporte-contador, modulo/permisos, leccion/fecha-utc-costa-rica, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-10-06
---

CIERRE DE §13. Inicio, Rentabilidad y los reportes de faltantes por cliente y
proveedor tienen **Exportar Excel**. El Reporte del Contador ya tenía su
exportación; conserva el período revisado, sin volver a traerlo del sistema.
No se añade ninguna dependencia: `xlsx` estaba en el backend.

LAS CINCO DESCARGAS, todas GET bajo `/api`:

| Ruta | Contenido y alcance |
|---|---|
| `/dashboard/exportar` | Los ocho indicadores de Inicio, cantidades y montos por cobrar/vencidos. |
| `/rentabilidad/exportar` | Todos los productos filtrados, sin paginación; resumen y seis series del negocio completo. |
| `/rentabilidad/productos/:productoId/exportar` | Una ficha propia y sus seis series. Un id oculto, inactivo o inválido da 404, igual que el detalle. |
| `/reportes/faltantes/cliente/exportar` | Faltantes y respuestas guardadas de los clientes que coinciden con los filtros. |
| `/reportes/faltantes/proveedor/exportar` | Faltantes registrados de los proveedores que coinciden con nombre y fecha inicial. |

QUÉ SIGNIFICAN LOS FILTROS

- Rentabilidad comparte `obtenerProductosFiltrados` con la lista de la
  pantalla: buscar por palabras sin tildes, categoría, clase, costo y orden.
  La página solo corta esas filas; Excel toma la lista completa de una vez.
  El botón espera a la búsqueda aplicada y a que termine la carga. El libro
  indica que resumen y series son del negocio entero, aunque haya filtros.
- Clientes conserva la selección de tarjetas: la búsqueda por producto o
  proveedor elige clientes completos, y descarga todos sus faltantes. No
  recorta a las líneas que coincidieron. Con un cliente abierto usa
  `cliente_nombre` exacto: "José" no descarga también "José Dos".
- Proveedores conserva su búsqueda en la página, también al volver del
  detalle. Con un proveedor abierto usa su clave exacta (`proveedor`), la
  misma cédula/clave del reporte; no es un contacto de Alegra.

LOS DATOS SON LOS GUARDADOS. El Excel de proveedores dice **Cantidad
faltante**: no es una orden de compra ni incluye cantidades que la persona
editó para pedir, agregados manuales o unidades convertidas del pedido. La
orden conserva su PDF. Clientes incluye cantidad entregada, respuesta,
revisado y estado de la factura, con lo guardado en la base. Ninguna
descarga guarda cambios que estén pendientes en la pantalla.

EXPORTAR NO ASIGNA PROVEEDORES. Abrir los reportes tiene un paso automático
que guarda asignaciones faltantes. Las descargas reutilizan sus consultas y
agrupaciones con `asignarProveedores: false`: un faltante sin asignación se
exporta así. Es importante conservar esa opción cuando cambie el servicio:
la prueba contra PostgreSQL rechaza cualquier SQL que no sea de lectura y
hace fallar una llamada al asignador.

CADA LIBRO trae Información (fecha de Costa Rica, filtros y significado de
las cifras), encabezados aun sin resultados, anchos de columna y autofiltro.
Importes y cantidades son números sumables; IVA y márgenes son porcentajes;
un costo o ganancia desconocidos quedan vacíos. Código, cédula y factura
son texto, conservando ceros. Los textos que empiezan con `=`, `+` o `@`
siguen siendo strings, nunca fórmulas. Las fechas son seriales de calendario
Excel con formato `yyyy-mm-dd`: no se convierten a un instante local.
La ganancia de Rentabilidad conserva su significado: estimada al costo de
hoy, solo con costo confiable; las últimas tres series son promedios.

PERMISOS. Inicio y Rentabilidad heredan su módulo. Cada ruta de exportación
de faltantes tiene un prefijo específico de Reporte Clientes/Proveedores en
`usuarios/modulos.js`. Esos Excel no quedan compartidos por estar debajo de
`/reportes`. (Hasta el 2026-10-04 se montaban también bajo
`/alegra/reportes`; ese prefijo se retiró.)

LA DESCARGA usa el token del cliente API y un blob. `enviarExcel` expone
Content-Disposition por CORS para conservar el nombre entre puertos de
desarrollo. Un error JSON se muestra junto al botón y no se descarga como
un `.xlsx` roto. Cada respuesta lleva `Cache-Control: no-store`; el backend
no escribe archivos ni vuelve a importar períodos del contador.

VERIFICACIÓN (2026-10-03). PostgreSQL real con BEGIN/ROLLBACK: productos y
facturas sin Alegra, proveedor sin asignar intacto, respuestas guardadas,
fecha inicial, código/cédula con ceros y filtros equivalentes a la pantalla.
Chromium, 1440/700 px: descarga y relectura con `xlsx` de Inicio, 35 productos
de Rentabilidad (supera la primera página de 30), detalle propio, filtros y
detalle exacto de clientes/proveedores. Las tablas operativas coinciden
antes/después de las siete URLs (incluido el adaptador). Sin sesión dan 401,
y un usuario con solo Reporte Clientes recibe 403 para los otros reportes.
Un 503 controlado informa su mensaje sin crear archivo. Sin errores JS,
mensajes externos ni limpieza semanal. Todo se prueba en un worktree y una
base desechables separados del trabajo de Claude y de la base compartida.
Integrado sobre los commits de Bitácora/permisos de Claude (`a0337ff`,
`e4f3cf4`): suite completa con `PROBAR_BASE_LOCAL=1`, 1.635 pruebas aprobadas,
sin fallos ni omisiones; frontend compilado. Las siete descargas y Chromium
se comprobaron otra vez con el backend cargando el código combinado.

## Operación por ciclos — 2026-10-05

Bodega/reportes/notas/Excel leen JOIN_CICLO de la factura, nunca ruta actual
del cliente. Filtros rutaId/cicloId estrictos y Sin ciclo; incompatibles
producen vacío, inválidos 400. Recorrido/Maps fijo, semana/orden/anticipado
en documentos. Selector propio por permiso del módulo; solo metadatos,
sin exponer paradas/Maps/saldos en esa consulta. Listas de reportes y notas
ahora tienen dueño específico en usuarios/modulos: llevan contexto privado.
Bodega de un ámbito explícito no se recorta a ventana/límite del conjunto.
Filtros también protegen la lista cacheada en el teléfono; drafts conservados.
Proveedor agrega origen por faltante con cantidad, factura/cliente/parada y
ciclo; notas/exportación mismo ámbito. Agrupación distingue proveedores de
un producto; Excel añade Procedencia y conserva lectura sin asignar.
Consulta filtrada no reutiliza borrador/envío GLOBAL por proveedor: órdenes
persistentes/cobertura/recepción pendientes, no interpretar la consulta como
compra pendiente de recibir. Pedidos sin facturar tampoco se alistan todavía.
Limpieza semanal aún pendiente por código: lanzador seguro y nunca probarla.
Relevo/evidencia en docs/informes/operacion-ciclos-2026-10-05.md.

EXPORTACIÓN OPERATIVA. [[modulo/exportaciones-operativas-ciclo]] añade
Excel de necesidades/órdenes/recorrido, filtros completos y detalle con
procedencia, sin paginación truncada ni escrituras de negocio. Los textos
de etapas anteriores son históricos; archivo/cierre/avance actuales se
conservan al descargar. Sin migración nueva.
