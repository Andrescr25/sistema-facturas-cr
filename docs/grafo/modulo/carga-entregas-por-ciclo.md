---
id: modulo/carga-entregas-por-ciclo
tipo: modulo
titulo: Carga y entregas — consulta del recorrido fijo y carga inversa por semana
estado: vigente
archivos:
  - backend/src/modules/entregas/entregas.service.js
  - backend/src/modules/entregas/entregas.routes.js
  - backend/src/modules/usuarios/modulos.js
  - backend/server.js
  - backend/tests/entregasCiclo.test.js
  - frontend/src/pages/Entregas.jsx
  - frontend/src/components/entregas/ParadaDetalle.jsx
  - frontend/src/hooks/useEntregas.js
  - frontend/src/App.jsx
  - frontend/src/components/Layout.jsx
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/utils/modulos.js
  - docs/informes/carga-entregas-2026-10-06.md
aristas:
  depende_de: [modulo/rutas-clientes, modulo/pedidos-por-ciclo, modulo/facturas-bodega]
  relacionado: [modulo/registro-carga-entrega, decision/ciclo-de-ruta-como-contexto, modulo/permisos, modulo/faltantes, modulo/archivo-ordenes-compra]
medido: 2026-10-06
---

ALCANCE DE ESTA PARTE. Menú Ventas → Carga y Entregas. Solo consulta por
ciclo explícito o Sin ciclo, nunca inferir semana activa/fecha del documento.
Ruta + semana visibles, paradas con pedidos ordenadas por recorrido fijo,
facturas emitidas y pedidos pendientes separados. Permiso propio entregas,
API /entregas; selector/plan/detalle/Maps exigen sesión y ese permiso.
No conceder permisos automáticamente a usuarios existentes. Admin puede
asignar el módulo con el flujo de Usuarios. No requiere permiso Clientes.

LECTURA. GET /entregas/ciclos da metadatos; GET /entregas/plan exige cicloId
y admite rutaId/pagina/tamano (máximo50). GET /entregas/paradas/:clave con
mismo ámbito; una parada de otro ciclo404. READ ONLY + REPEATABLE READ en
una transacción PostgreSQL por plan/detalle: cantidades y cabecera coherentes,
sin asignar proveedores, crear faltantes ni cambiar estados. Lista blanca
sin precios/costos/total/deuda/cuenta del portal. Fecha antigua no excluye
documento del ciclo. Semana cerrada conserva consultas.

IDENTIDAD. rc-ID para parada fija, cl-ID para histórico sin ciclo con cliente,
f-ID/p-ID sin ficha. Nombre/Maps del recorrido, nunca actuales del maestro.
Sin ciclo no recibe Maps/orden supuestos ni sugerencia de carga; página20
por defecto, agrupación por cliente/documentos sin mezclar una misma ruta
en semanas diferentes. Factura anulada y pedido rechazado excluidos.
Pedido facturado aparece una vez como factura, con referencia al pedido de
origen solo si cliente/contexto coinciden. Pendiente sin factura se muestra
por facturar, conservando origen agente/portal y preventa anticipada.

CARGA. Toda la ruta en orden inverso, no solo página visible. Incluye SOLO
facturas con revisión de bodega estado_bodega=procesado; el detalle conserva
su orden de entrega. Revisada no garantiza paquete completo: mostrar faltantes
pendientes/procesados, cantidades facturadas y notas, exigir revisión de paquetes
en pantalla. No afirmar cargada/entregada. Revisión física, avance, actor/fecha,
idempotencia y cambios tras reimpresión siguen en ENT-06 y próxima parte051.
No mover stock por consultar ni equiparar despacho a entrega al cliente.

MÓVIL. Botón Ver ubicación con enlace Maps validado, targetblank/rel seguro.
Lista → detalle por cliente, tres resúmenes, carga/entrega y páginas. Abrir
una parada desde carga lleva a su página aunque no estuviera visible. Cambiar
ruta/ciclo vacía contexto/formulario; respuestas tardías anteriores ignoradas.
Sin escrituras desde navegador. Reporte Clientes ya conserva semana/parada/Maps
de la misma factura; Bodega conserva su filtro/contexto, no una nueva semana.

EVIDENCIA. Trece pruebas PostgreSQL + contrato de permiso, SAVEPOINT/ROLLBACK,
orden/carga/páginas, contexto tras cambio de maestro, anticipado/facturado/
rechazado/anulado, dos semanas, histórico/Maps, autorización y filas intactas.
Ver informe para suite/build/Chromium y aislamiento. Sin migración nueva;
próxima SQL051 se reserva para registro de carga/entrega. No marcar ENT-06,
PRE-08 ni FIL-07 completo por tener una vista de consulta.

CIERRE LOCAL. Código393ee66, sin migración; respaldo0600,36huellas iguales,
stock/conteos/movimientos0. 2.125pruebas/362suites sin fallos/omitidas,
grafo12/build/Chromium1440/390. READ ONLY/REPEATABLE READ reales comprobados;
14huellas iguales durante consultas propias. App5174→3002 segura PID14177,
producción/main/developer fuera. Base/puertos propios retirados, evidencia
conservada. Operativo79/20; independencia133/14 aparte. Siguiente051 para
registro físico y revisión/corrección explícita; no cerrar ENT-06 aún.

REGISTRO FÍSICO051. La consulta anterior ya muestra avance por factura.
Registro de carga/entrega/descarga/incidencia y corrección explícita viven en
[[modulo/registro-carga-entrega]], con historial/snapshot y revisión obligatoria
si cambia el documento. Completa sale de carga sugerida, sigue consultable
en recorrido. La revisión de bodega sigue siendo distinta de entrega real.
Ver informe de registro para la evidencia y el estado local vigente.

Estado vigente: registro físico5c9e90a/051 verificado e integrado solo local,
82/17 operativo. Los textos de consulta393ee66 describen la etapa previa.
App5174→3002 PID18962; ver nuevo nodo/informe para pruebas e invariantes.
