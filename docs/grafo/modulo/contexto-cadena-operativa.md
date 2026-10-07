---
id: modulo/contexto-cadena-operativa
tipo: modulo
titulo: Contexto de punta a punta — compras, recepción, carga y entrega
estado: vigente
archivos:
  - backend/tests/contextoCadenaCiclo.test.js
  - backend/tests/fixtures/contextoCadena.js
  - backend/src/modules/rutas/rutas.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloRecepcion.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloCierre.service.js
  - backend/src/modules/orders-whatsapp/ordenesCicloFactura.service.js
  - backend/src/modules/entregas/registroFisico.service.js
  - backend/src/modules/entregas/entregas.service.js
  - backend/src/modules/reports/necesidades.service.js
aristas:
  depende_de: [decision/ciclo-de-ruta-como-contexto, modulo/pedidos-por-ciclo, modulo/ordenes-compra-por-ciclo, modulo/recepcion-ordenes-compra, modulo/registro-carga-entrega]
  relacionado: [modulo/validacion-cadena-operativa, modulo/historicos-contexto-documentos, modulo/contexto-visible-operacion, modulo/cierre-ordenes-compra, modulo/necesidades-por-ciclo, modulo/carga-entregas-por-ciclo, modulo/exportaciones-operativas-ciclo]
medido: 2026-10-06
---

CADENA. El fixture usa los servicios reales desde cliente/ruta/ciclo, carrito/
pedido del portal y adicional del agente, factura, revisión/faltantes de bodega,
orden revisada, vínculo comercial/PDF, compra, recepción parcial y carga/entrega.
Dos semanas de la misma ruta y un histórico Sin ciclo. Solo los avisos y el
transporte externo se sustituyen; SQL, conversiones, documentos, PDF y kardex
son reales en un clon propio. Los casos nativos terminan en ROLLBACK; el
ensayo HTTP confirma su propio fixture en una base desechable separada.

MAESTRO Y PROMOCIÓN. Mover/renombrar cliente, cambiar Maps y renombrar ruta no
reescribe órdenes, orígenes, facturas, recibidos, PDF o eventos físicos. Un
ciclo futuro obtiene el maestro nuevo: una parada cambia de ruta y la otra
pasa de orden 2 a 1. Las dos semanas previas conservan sus paradas originales.
Promover cambia permisos de operación y firma de revisión de ciclo, no la
fotografía del documento ni su historial. Refrescar antes de registrar otra
acción; un UUID/cuerpo ya confirmado se reconoce aun con el ciclo cerrado.

RECEPCIÓN Y CIERRE. Se puede completar una obligación enviada después del
cierre de su ciclo, usando su orden/factura revisadas. No trasladar la recepción
a la semana activa: 4 recibidas + 6 nuevas = 10 del original, siguiente conserva
1 de 4. Cierre de enviada conserva 4 y libera 6 para el mismo origen, sin entrada
ficticia ni cambios del siguiente ciclo. PDF y cantidades comerciales enviados
permanecen idénticos. No completar otro ciclo con excedentes ni stock general.

FÍSICO. Cargar próxima semana en preventa permite preparación anticipada;
entregar exige promover a entrega. Carga/entrega/descarga no descuentan stock
por segunda vez. Cerrado impide carga nueva, pero permite devolver la fotografía
anterior con motivo. El mismo UUID no crea otro evento. Necesidades y Excel
conservan procedencia, coberturas y avance independientes para cada semana.

HISTÓRICO. Sin ciclo permanece null, sin Maps supuestos, carga o eventos
inventados. Su compra/PDF se consultan en Sin ciclo. No inferir semana por el
maestro actual, reiniciar el domingo ni clasificar automáticamente documentos.

EVIDENCIA Y LÍMITES. [Informe](../../informes/contexto-cadena-2026-10-06.md) y
checklist vigente registran cifras, aplicación local y retiro. RUT-08/VAL-01
corresponden a esta cadena; permisos/concurrencia/unidades globales, aceptación
fiscal real, corte y revisiones manuales conservan sus casillas independientes.
No modificar Prisma, producción, stock habitual, mensajes o versiones de cache.

2026-10-06: RUT-08/VAL-01 cerrados, 92 listos / 7 pendientes (99 IDs).
Suite 2.237 / 362, nueve casos nuevos, grafo 12, build y Chromium 1440/390:
11 vistas / 22 capturas y 17 huellas conservadas. El informe distingue la
representación del buzón y la verificación de descarga de su visor headless.
Las cifras históricas de los nodos relacionados no son el estado vigente.

2026-10-06: matriz de permisos, reintentos/conexiones reales y unidades de
la cadena completa en [[modulo/validacion-cadena-operativa]]. Stock general
se distingue de demanda/cobertura por semana. Informe validacion-cadena-
2026-10-06 mantiene el cierre y sus límites; etapas anteriores históricas.
