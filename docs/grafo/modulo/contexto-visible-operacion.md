---
id: modulo/contexto-visible-operacion
tipo: modulo
titulo: Ruta y semana visibles — consultas tardías, notas y ficha histórica
estado: vigente
archivos:
  - frontend/src/hooks/useContextoConsulta.js
  - frontend/src/hooks/useClientesPortal.js
  - frontend/src/hooks/useFacturasBodega.js
  - frontend/src/hooks/useReporteClientes.js
  - frontend/src/hooks/useReporteProveedores.js
  - frontend/src/pages/FacturasBodega.jsx
  - frontend/src/pages/ReporteClientes.jsx
  - frontend/src/pages/Clientes.jsx
  - frontend/src/pages/ReporteProveedores.jsx
  - frontend/src/components/clientes/ListaPedidos.jsx
  - frontend/src/components/clientes/FichaCliente.jsx
  - frontend/src/components/reporte-proveedores/FaltantesPorCiclo.jsx
  - backend/src/modules/clientes/clientes.resumen.service.js
  - backend/tests/operacionCiclos.test.js
  - backend/tests/fichaCliente.test.js
aristas:
  relacionado: [decision/ciclo-de-ruta-como-contexto, modulo/rutas-clientes, modulo/pedidos-por-ciclo, modulo/preventa-por-enlace, modulo/facturas-bodega, modulo/faltantes, modulo/necesidades-por-ciclo, modulo/carga-entregas-por-ciclo, modulo/exportaciones-operativas-ciclo]
medido: 2026-10-06
---

SELECCIÓN Y RESPUESTA. Pedidos y reportes ocultan datos de la selección
anterior desde el render, antes de iniciar el siguiente GET. Una respuesta
tardía, también un error, pertenece a la selección que la inició. La identidad
de `useContextoConsulta` cambia al elegir otro ámbito: volver A → B → A no
habilita la primera respuesta A. Se conserva además el contador de peticiones
para Actualizar/reintentos dentro del mismo ámbito y se rechaza tras desmontar.
Los filtros incluyen ruta/ciclo, estado/origen de pedidos y fecha/actividad
del reporte según corresponde; no hay fecha global de reinicio.

PEDIDOS. Si falla la consulta nueva, no quedan las filas anteriores bajo la
semana nueva. Aviso persistente y Reintentar pedidos; no afirmar que no hay
pedidos mientras falló la consulta. Ruta/semana o Sin ciclo se escriben fuera
del select para leerlas en celular. El origen y anticipado siguen separados.

REPORTES. Datos, resumen, respuestas de ajuste y notas corresponden al ámbito
vigente. Error de nueva lectura deja lista/resumen vacíos. Un rollback tardío
del ajuste de otra selección no sustituye las respuestas actuales. No ejecutar
una confirmación pendiente de impresión/recuperación después de cambiar la
semana. Cambiar ruta/ciclo/fecha cierra el detalle anterior del proveedor.
La vista filtrada `FaltantesPorCiclo` muestra las notas de variantes por
producto y su resumen, antes omitidas; no aplica borradores globales.
Notas pendientes se ocultan hasta que llegue su propia consulta.

BODEGA. El GET captura sus filtros al comenzar. Únicamente una consulta sin
ruta/ciclo guarda la copia conjunta; nunca decidir con los filtros que estén
seleccionados al llegar la respuesta. Al fallar otro ámbito, se puede filtrar
la copia conjunta por el contexto fijo de cada documento, con aviso de última
sincronización. Si no hay copia, lista vacía/error. No sobrescribir esa copia
con una lectura filtrada, ni borrar borradores por factura. Abrir/cerrar el
detalle conserva selección y contexto/Maps propios del documento.

FICHA. Facturas recientes, TODAS las pendientes y pedidos recientes de
portal/agente leen `JOIN_CICLO` de su documento y devuelven `ciclo`/`anticipado`.
Se muestran semana/parada o Sin ciclo en sus secciones. La ruta actual de la
ficha queda en Información y no clasifica documentos viejos. No añadir Maps,
otras paradas o campos financieros al DTO del contexto. Saldos conservan su
cálculo y las pendientes no se recortan al límite de recientes.

ALCANCE. Esta parte revisa el contexto visible de los módulos operativos y
corrige las lecturas anteriores. Conservación integral de documentos,
históricos, colas y permisos/reintentos sigue separada en RUT-08/FIL-11/VAL.
Evidencia y estado real: [informe](../../informes/contexto-operativo-2026-10-06.md).
Pruebas escritas sólo en clon propio desde dump LOCAL052; sin nueva SQL,
Prisma, producción, mensajes reales ni limpieza semanal.

VERIFICACIÓN.2.213pruebas/362suites fail0/skip0,14focalizadas/dosnuevasPG,
grafo12/build. Chromium1440/390/quincevistas/30capturas, sieterespuestas
demoradas/503/A→B→A y18huellas iguales; ningún GET legado de fondo. FIL-09
cerrado,89/10 operativo; RUT-08/FIL-11/VAL siguen abiertos. Detalle/evidencia
y aplicación local en el informe. No interpretar las vistas comprobadas como
aceptación de todo el flujo o del corte.
