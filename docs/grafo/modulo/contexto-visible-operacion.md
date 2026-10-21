---
id: modulo/contexto-visible-operacion
tipo: modulo
titulo: Ruta y semana visibles — consultas tardías, notas y ficha histórica
estado: retirado
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
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
  - backend/src/modules/clientes/clientes.resumen.service.js
  - backend/tests/fichaCliente.test.js
aristas:
  relacionado: [modulo/historicos-contexto-documentos, decision/ciclo-de-ruta-como-contexto, modulo/rutas-clientes, modulo/pedidos-por-ciclo, modulo/preventa-por-enlace, modulo/facturas-bodega, modulo/faltantes, modulo/necesidades-por-ciclo, modulo/carga-entregas-por-ciclo, modulo/exportaciones-operativas-ciclo]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Este flujo por semana u orden numerada está retirado. Los párrafos siguientes
describen la implementación anterior; las tablas, documentos y restricciones
históricas se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


**2026-10-13, simplificación de proveedores:** el usuario retira las áreas y
paneles de ciclos/necesidades/factura/recepción/cierre de Reporte Proveedores.
Solo Faltantes y fichas; órdenes se revisan dentro del proveedor, acumulando sin
semanas. El detalle técnico/histórico de este nodo y sus APIs/documentos siguen
conservados. Presentación vigente: [[modulo/reporte-proveedores]].


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

LOCAL. Código9fc8d8e integrado en independencia-alegra sin migración. Backup
nuevo0600 y36+9huellas iguales; inventario/conteos/movimientos/eventos/órdenes0.
Backend seguro42974,5174→3002; fuente/productos/históricos del usuario intactos.
Compartida sólo GET/SQL READ ONLY, ficha200 con Sin ciclo/noauth401 y helper
frontend200. Propios base/puertos retirados; copia/rama se retiran al cerrar.
Quince decisiones originales preservadas; siguiente RUT-08/FIL-11 y VAL integral.

CONTINUIDAD 2026-10-06. La etapa de históricos/copia corrige PUT y los acuses,
distingue Sin ciclo de metadata sin descargar y conserva la fotografía en
los tres caminos de reenvío. Ver [[modulo/historicos-contexto-documentos]] y
el informe historicos-contexto-2026-10-06; sus cifras reemplazan el relevo
anterior. No confundir esta entrega con VAL o cierre integral RUT-08.


Recepción/Factura de una orden también descartan respuestas de una lectura
cancelada (2026-10-07). La doble lectura de desarrollo podía volver a aplicar
un formulario inicial sobre cantidades ya escritas; Recepción compara turno,
bloquea su carga local y conserva la edición al llegar la respuesta anterior.
El recorrido Chromium demora de forma controlada ese GET y comprueba cantidad
6 y confirmación antes de registrar. [[modulo/recorrido-visual-operativo]].
