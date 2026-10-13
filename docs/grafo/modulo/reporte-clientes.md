---
id: modulo/reporte-clientes
tipo: modulo
titulo: Reporte de clientes — faltantes por ruta actual y próxima visita
estado: vigente
archivos:
  - backend/src/modules/reports/reporteClientes.service.js
  - backend/src/modules/rutas/rutaActual.service.js
  - backend/src/modules/reports/report.service.js
  - backend/src/modules/reports/report.controller.js
  - backend/src/modules/reports/report.routes.js
  - backend/src/modules/reports/report.excel.js
  - backend/src/modules/clientes/rotacion.js
  - frontend/src/hooks/useFiltroRutaReporteCliente.js
  - frontend/src/hooks/useReporteClientes.js
  - frontend/src/pages/ReporteClientes.jsx
  - frontend/src/components/reporte-clientes/FiltroRuta.jsx
  - frontend/src/components/reporte-clientes/VisitaCliente.jsx
  - frontend/src/components/reporte-clientes/ListaClientes.jsx
  - frontend/src/components/reporte-clientes/ClienteDetalle.jsx
  - frontend/src/utils/reporteClientesUtils.js
  - backend/tests/reporteClientesPorRuta.test.js
  - backend/tests/dobles/reporteClientesPorRuta.js
  - backend/tests/validacionPermisosCadena.test.js
  - docs/informes/reporte-clientes-por-ruta-2026-10-13.md
aristas:
  relacionado: [modulo/preventa-agenda, decision/rotacion-por-cliente-sin-ciclos, modulo/rutas-clientes, modulo/faltantes, modulo/exportaciones-reportes, modulo/permisos, modulo/facturacion, leccion/fecha-utc-costa-rica]
medido: 2026-10-13
---

ROT-03 del pedido del usuario: rutas se mantienen, rotación individual,
retiro de ciclos por partes. Este reporte conserva su trabajo de revisión de
faltantes e impresión. La agenda de TODOS los clientes vive en
[Preventa (ROT-04)](preventa-agenda.md); no se inventan faltantes para hacer que una ficha aparezca acá.

## Ruta e identidad

`GET /reportes/faltantes/cliente` y su Excel filtran `rutaId` por
`factura.cliente_id → cliente.ruta_id` de HOY. Ya no filtran por semana:
`cicloId` no vacío responde 400 e indica recargar. `sin-ruta` incluye clientes
sin asignación y documentos históricos sin ficha propia. La ruta inexistente
pero válida devuelve vacío, nunca la vista conjunta por omisión.

`GET /reportes/faltantes/cliente/rutas` reemplaza el selector de ciclos del
reporte. Devuelve únicamente id/nombre/activo bajo permiso Reporte Clientes;
no pide Clientes ni expone cuentas, saldo o Maps. Incluye rutas activas aunque
no tengan ciclos, e inactivas que aún tienen clientes asignados.

La agrupación y navegación usan el id PROPIO, no nombre. Dos clientes
homónimos tienen tarjetas, frecuencias y facturas separadas. Un documento sin
ficha conserva su clave por factura y no se atribuye a una ficha por nombre.
El nombre/contacto del cliente viene de la ficha vigente; la factura y su
recorrido original no se reescriben al cambiar nombre o ruta.

## Próxima visita y lectura

La rotación se calcula con el helper de Clientes para todas las facturas
vigentes, incluso las que no tienen faltantes. Una consulta por el conjunto
de ids evita una consulta por línea. Ordena por próxima visita, vencidas
primero, luego hoy y próximas; sin fecha al final. Empates por nombre y clave.
La pantalla conserva ese orden dentro de pendientes y listos, muestra el
estado de visita, frecuencia y fecha, y mantiene visibles las alertas sin caja.

Consultar clientes/rutas/Excel no asigna proveedores ni guarda respuestas.
Bodega y la asignación explícita conservan ese trabajo. El servicio del
reporte se separa de Proveedores; la cuenta de rotación sigue en un solo
lugar. La lectura de contexto de ciclo queda únicamente para la historia de
cada documento, que se conserva mientras llega ROT-08.

El hook conserva la protección de identidad de selección: resultados o
guardados anteriores no pisan la ruta actual, incluso A → B → A. Al cambiar
ruta cierra el detalle; al volver de una ficha conserva búsquedas y ruta.
Errores de datos y metadatos tienen reintento independiente.

## Excel y límites

La descarga del detalle selecciona `clienteId` exacto (o `facturaId` para un
documento sin ficha), evitando descargar la ficha homónima. Conserva filtros
de nombre/producto/proveedor, las respuestas/revisión guardadas y todas las
líneas del cliente elegido. Añade ruta actual, frecuencia, última atención,
próxima visita y estado; distingue ruta histórica del documento.

No hay nueva migración: usa la 056 ya existente en developer. No se
ejecutan limpiezas ni se modifica el archivo de impresos: ROT-06/07 siguen
pendientes. [Pruebas y alcance](../../informes/reporte-clientes-por-ruta-2026-10-13.md).
