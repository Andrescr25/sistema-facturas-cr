---
id: modulo/pedidos-por-ciclo
tipo: modulo
titulo: Pedidos y facturas conservan el recorrido de su semana
estado: vigente
archivos:
  - backend/src/modules/rutas/operacionCiclo.service.js
  - backend/tests/operacionCiclos.test.js
  - frontend/src/components/FiltroCicloOperacion.jsx
  - frontend/src/components/ContextoCicloDocumento.jsx
  - frontend/src/hooks/useFiltroCicloOperacion.js
  - backend/migrations/independencia/045_documentos_por_ciclo.sql
  - backend/src/modules/rutas/documentosCiclo.service.js
  - backend/src/modules/portal-clientes/portal-clientes.cliente.service.js
  - backend/src/modules/portal-clientes/portal-clientes.pedidos.service.js
  - backend/src/modules/catalogo-agente/pedidos-agente.service.js
  - backend/src/modules/clientes/clientes.service.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/facturacion/facturaConsulta.service.js
  - backend/src/modules/facturacion/idempotencia.js
  - frontend/src/components/SelectorCiclo.jsx
  - frontend/src/components/catalogo-clientes/ModalPedido.jsx
  - frontend/src/components/clientes/ListaPedidos.jsx
  - frontend/src/hooks/useClientesPortal.js
  - frontend/src/hooks/useFacturacion.js
  - frontend/src/services/facturacionService.js
  - backend/tests/documentosCiclo.test.js
  - backend/tests/idempotenciaFactura.test.js
aristas:
  relacionado: [modulo/rutas-clientes, modulo/portal-clientes, modulo/catalogo-agente, modulo/facturacion, modulo/facturacion-offline, decision/ciclo-de-ruta-como-contexto, modulo/faltantes]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-05
---

Segunda parte de la reorganización. SQL/pg, solo en la copia local; no Prisma.
`pedido_cliente` y `factura` guardan `ciclo_ruta_cliente_id`, FK a la parada del
recorrido inmutable creado por 044. De allí salen ruta, nombre original, semana
y orden. No se consulta la ruta actual de la ficha para clasificar documentos.
`preventa_anticipada` se fija al enviar un pedido del portal en estado preventa;
el origen portal/agente permanece separado. Al facturar se copian ambos campos
en la transacción que vincula pedido y factura. No se duplica stock ni factura
en un reintento. Triggers prohíben reclasificar el contexto, cambiar destinatario
a otro del recorrido o borrar documentos asociados. Los históricos quedan NULL.

El portal consulta `/portal/ciclos` detrás de `requireCliente`: la cuenta se
relee en servidor y solo recibe sus semanas. El cuerpo no elige otro cliente.
El formulario exige elegir si hay ciclos; Sin ciclo sigue disponible para
clientes/colas sin clasificación. El cliente ve su ruta/semana en confirmación
e historial; la semana elegida queda visible aunque el select recorte un nombre
de ruta largo en celular. No se exponen Maps, otras paradas o saldos en esa consulta.

El catálogo del agente sigue de consulta, por decisión previa. El pedido
presencial se toma en Facturación, que ahora selecciona ciclo y conserva ese
ID en la venta/cola offline. El API de pedidos de agente también admite ciclo
explícito sin cambiar el contrato antiguo. Un pedido adicional no sustituye el
pedido anticipado. Ventas nuevas validan pertenencia al recorrido y estado
preventa/preparación/entrega, con bloqueo SHARE del ciclo hasta confirmar.
Cerrar/cancelar rechaza nuevos envíos con 409; carrito/colas quedan disponibles
para revisión. Un pedido ya recibido conserva su contexto al facturarlo,
incluso si el ciclo se cerró mientras esperaba revisión; no se promueve a otra
semana. No se habilitó facturación automática.

Clientes → Pedidos filtra ruta, ciclo y origen antes de LIMIT 200. El ciclo
de cada fila muestra semana y parada. Sin ciclo es explícito, también para
históricos. Son filtros de pedidos; bodega/reportes/faltantes todavía pendientes.

Offline: el catálogo personal de clientes entrega solo metadatos mínimos de
sus ciclos y los descarga junto con las fichas. Consultar una ficha en línea
también guarda sus semanas; sin señal se usa la copia más reciente. Cambiar de
conexión conserva la selección válida. No se cambia versión/esquema IndexedDB
ni se reescriben pedidos, facturas pendientes o claves antiguas. Huellas sin
ciclo mantienen la fórmula anterior; las nuevas incluyen ID de ciclo, y una
clave sin ciclo no se reutiliza para una semana distinta. Una respuesta 409 a
una cola mantiene cuerpo y clave pendientes, con motivo visible.

Verificación/evidencia y siguiente entrada:
[informe de esta parte](../../informes/pedidos-ciclos-2026-10-05.md).
Las pruebas de esta parte usan PostgreSQL real y ROLLBACK. Navegador y suite
de base se ejecutan por separado: no hacer facturas de prueba simultáneamente
con ensayos que verifican inventario cero o cambian tablas/numeradores.
Los datos ZZ del navegador pertenecen solo a la base desechable.

Sigue: catálogo/enlace personalizado por cliente/ciclo y envío controlado;
después trazabilidad de faltantes/cobertura/órdenes. El cron semanal viejo
sigue pendiente; los lanzadores seguros continúan sustituyéndolo.

Tercera parte: el enlace fija la semana y se vuelve a validar dentro de
la transacción del pedido: [[modulo/preventa-por-enlace]].

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
