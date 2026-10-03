---
id: modulo/dashboard
tipo: modulo
titulo: Inicio — trabajo pendiente contado desde las tablas propias
estado: vigente
archivos:
  - backend/src/modules/dashboard/dashboard.service.js
  - backend/src/modules/dashboard/dashboard.controller.js
  - backend/src/modules/dashboard/dashboard.routes.js
  - frontend/src/pages/Dashboard.jsx
  - backend/src/modules/facturacion/facturaConsulta.service.js
  - backend/src/modules/pagos-recurrentes/pagos-recurrentes.service.js
  - backend/tests/dashboardPropio.test.js
aristas:
  relacionado: [modulo/facturacion, modulo/portal-clientes, modulo/facturas-bodega, modulo/inventario, modulo/revision-precios, leccion/fecha-utc-costa-rica, leccion/un-borrador-no-es-una-venta]
medido: 2026-10-03
---

`GET /api/dashboard/resumen` arma Inicio con siete consultas locales en
paralelo. Cada tarjeta muestra trabajo pendiente y lleva a su módulo;
un cero sigue visible, apagado. No llama a Alegra, no relee sus espejos
`cuentas_por_cobrar`/`facturas` y no modifica datos al abrir la pantalla.
El trabajo de §13 aquí fue comprobar lo que ya era propio y corregir el
conteo mensual: no reconstruir los módulos migrados en §§7, 11 y 12.

DE DÓNDE SALE CADA CONTADOR

- **Pedidos de clientes:** `pedido_cliente.estado = pendiente`; incluye
  agente y portal, sin exigir cuenta de portal ni contacto de Alegra.
- **Por cobrar:** facturas propias emitidas con saldo mayor a ₡1. Total
  menos cobros y notas vigentes, con las mismas expresiones de la consulta
  de facturas; nunca lee `saldo` ni `total_pagado` importados. Un cobro o
  una nota anulada dejan de restarse en el acto. Vence si la fecha de
  vencimiento es anterior a hoy en Costa Rica; vencer hoy no es atraso.
- **Bodega:** emitidas por alistar de los últimos 30 días, incluido el
  límite inferior. Al despachar o anular una, sale del contador.
- **Duplicados:** `duplicado_electronica` en requiere_revision/error.
- **Pagos del mes:** filas de `pago_recurrente` no pagadas cuyo período
  empieza con el mes local. Incluye YYYY-MM, YYYY-MM-Q1, YYYY-MM-Q2 y
  varios recibos del mismo gasto, igual que la pantalla de Pagos.
- **Revisión de precios:** facturas del buzón en PROCESADA.
- **Auditorías y excesos:** tandas locales en en_progreso, separadas por tipo.

UNA FECHA POR LECTURA. Cobranza, bodega y mes de pagos usan el mismo día
capturado por `hoyEnCostaRica`. A las 00:00 UTC todavía son las 18:00 del
día anterior en CR; usar CURRENT_DATE elegía el mes siguiente seis horas
antes. Comparar período por igualdad también omitía ambas quincenas.

LOS PAGOS SON LOS REGISTRADOS. Abrir Inicio no crea los períodos que faltan
ni consulta recibos externos. La pantalla de Pagos los prepara al abrir un
mes (`asegurarPeriodos`) y conserva su flujo propio; Inicio cuenta esas filas.
Las colas de revisión e inventario siguen siendo internas: este cierre no
adelanta el conteo físico ni la emisión electrónica pospuestos.

VERIFICACIÓN: PostgreSQL local en BEGIN/ROLLBACK, cliente y factura sin
Alegra, anulación de cobros y notas, igualdad con la lista por cobrar,
proformas/anuladas excluidas, vencimiento hoy y sin fecha, saldo de ₡1,
límite de bodega, quincenas, varios recibos, fin de mes/año en UTC y estados
de las colas. La prueba rechaza escrituras y lecturas de los espejos viejos.
La pantalla se verifica en Chromium sobre una base desechable separada,
con servicios propios; no se ejecuta la limpieza semanal ni se envían mensajes.
Chromium confirmó las seis tarjetas contra la API, cobranza y pagos actualizados,
1440/700 px sin desborde ni errores de JavaScript. Un 503 muestra el error
en lugar de ceros. Suite combinada con los commits de Rentabilidad de Claude:
1.577 aprobadas y una omitida; frontend compilado. El worktree y la base
desechables son propios: las pruebas no escriben en la base compartida.
