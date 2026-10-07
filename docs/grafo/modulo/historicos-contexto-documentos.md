---
id: modulo/historicos-contexto-documentos
tipo: modulo
titulo: Históricos y copias de facturas conservan el contexto del documento
estado: vigente
archivos:
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/rutas/documentosCiclo.service.js
  - frontend/src/utils/facturasLocales.js
  - frontend/src/utils/facturacionUtils.js
  - frontend/src/services/facturacionService.js
  - frontend/src/components/ContextoCicloDocumento.jsx
  - frontend/src/components/facturacion/PanelEditarFacturas.jsx
  - frontend/src/components/facturacion/PanelFacturasEmitidas.jsx
  - frontend/src/components/facturacion/VistaFactura.jsx
  - frontend/src/hooks/useFacturacion.js
  - frontend/src/pages/Facturacion.jsx
  - backend/tests/documentosCiclo.test.js
  - backend/tests/facturasLocales.test.js
  - backend/tests/contextoColasFactura.test.js
aristas:
  relacionado: [decision/ciclo-de-ruta-como-contexto, modulo/pedidos-por-ciclo, modulo/facturacion-offline, modulo/contexto-visible-operacion, modulo/rutas-clientes, modulo/carga-entregas-por-ciclo, modulo/exportaciones-operativas-ciclo]
medido: 2026-10-06
---

CONTEXTO GUARDADO. PUT devuelve la fotografía de ciclo de la factura dentro
de su transacción. El acuse de idempotencia devuelve estado, ciclo y origen
anticipado consultados de la factura guardada: no validar contra el maestro
actual ni rechazar un documento recibido antes del cierre. No se cambia la
huella, el UUID, el cuerpo pendiente ni el vínculo inmutable de la factura.
El DTO de ciclo sigue sin Maps, otras paradas o información financiera.

TRES CASOS. `ciclo:null` confirma «Sin ciclo». Una copia vieja sin metadata
muestra «Ruta y semana sin descargar». Un objeto muestra la ruta, semana y
parada del documento. Ausencia de metadata no prueba que sea Sin ciclo;
`undefined` no borra datos descargados y `null` canónico sí prevalece sobre
una copia errónea. Una respuesta parcial no convierte anticipado en false.
No completar ninguno de estos casos con el ciclo activo o la ficha actual.

COPIA Y COLA. Al confirmar local-id se combina la fotografía con el resultado
propio antes de retirar su copia local. Guardar la copia definitiva precede
confirmar/retirar: un fallo conserva cuerpo, clave y fotografía para reintentar.
Sin id propio, la cola anterior sigue pendiente con su motivo. El acuse sin
líneas preserva las descargadas; sin ninguna copia no inventa detalle editable.
IndexedDB permanece v4 y los almacenes y contratos de las colas no se migran.
La lectura opcional de cache no impide una venta online si IndexedDB no abre.

PANTALLAS. Listas de facturas emitidas y de edición, detalle y edición rápida
muestran contexto propio, también Sin ciclo y datos sin descargar. La edición
no reemplaza metadata incompleta por null ni pierde anticipado al guardar.
La lista de pendientes toma contexto de su copia, nunca del maestro actual.
Las demás pantallas/Excel conservan su tratamiento explícito de Sin ciclo.

ALCANCE Y VERIFICACIÓN. Cierre y comprobaciones registrados en el
[informe](../../informes/historicos-contexto-2026-10-06.md). FIL-11 distingue
históricos y copias incompletas; RUT-08 conserva su revisión integral de
cadena de compra/recepción/carga y estados. VAL integral y revisión manual
siguen separados. Solo clon local desechable, sin nueva SQL ni Prisma.

VERIFICACIÓN Y RELEVO. Código3c10bf1 desde387d2b7,solo local.2.228pruebas/
362suites fail0/skip0,15nuevas(3PG/3copias/9colas),grafo12/build/Chromium1440/390:
6vistas/12capturas/6casos IndexedDB/16huellas iguales. Una edición real solo
clon; acuses simulados, salidas externas bloqueadas. FIL-11 cerrado90/9;
RUT-08/VAL integral y MapsLOCAL pendientes; independencia133/14 separada.

Habitual solo lecturas:36+9huellas idénticas,stock/conteos/movimientos/eventos/
órdenes/recepciones/cierres0; maestro/ciclo cancelado conservados. App5174→3002
seguraPID49572; usar lanzador permanente indicado en el informe. Original3000/
PID5370,developer5013270/main e19c3e5 intactos. Sin nueva SQL:053 libre.
Base propia/puertos retirados; copia/rama se retiran tras integrar este relevo;
evidencia privada conservada. Memoria/reserva se cierran después, conservando
quince decisiones originales. No interpretar documentos incompletos como Sin
ciclo ni probar escrituras sobre históricos de la base habitual.
