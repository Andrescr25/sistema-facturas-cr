# Preventa por enlaces personales — 2026-10-05

Tercera parte de la reorganización, solo local en `independencia-alegra`.
Implementación `7d44a3e`, integrada por avance rápido, sin push.
Primera y segunda partes conservadas. No hay otro worktree de Claude activo
al comenzar; base compartida sin cambios de negocio para esta entrega.

Clientes → Rutas → Ver recorrido de una semana en preventa → Preparar catálogo.
Cada cliente tiene un enlace a su portada personalizada y la semana del ciclo.
Se puede copiar o revisar número/mensaje antes de enviar por WhatsApp. Quien
todavía no tiene acceso recibe una invitación explícita que conserva esa semana
al activar su cuenta. El modal muestra los envíos anteriores por cliente/ciclo.

El enlace exige sesión y solo corresponde a su cliente, incluso si otra cuenta
pertenece a la misma ruta. Su contexto firmado no concede acceso a pedidos,
facturas o saldos. La semana queda fija y visible en el pedido; el servidor la
vuelve a comprobar antes de consumir el carrito. Cerrar/cancelar el ciclo o
revocar acceso bloquea el enlace; un error conserva el carrito completo.

Verificación completa:

- 1.974 pruebas aprobadas, cero fallos y omitidas; grafo válido (12 casos).
  Base desechable propia, suite con concurrencia 1, casos de enlaces y
  documentos terminan en ROLLBACK. Navegador ejecutado después de la suite.
- Build aprobado; permanece el aviso previo de tamaño del paquete.
- Chromium 1440/390: ciclo actual y preventa visibles; preparación/copia,
  revisión/envío bloqueado 423 y registrado como fallo, invitación de un
  cliente nuevo, activación/login conservando semana, pedido anticipado
  vinculado, enlace de otra cuenta 404, cierre 409 y carrito intacto.
  Sin errores JS ni desborde horizontal. Logs HTTP sin contexto o invitación.
- No necesita migración nueva. No modifica documentos históricos, inventario,
  colas offline o datos de negocio de la base habitual. Los fixtures ZZ viven
  únicamente en la base propia y se retiran eliminando esa copia de pruebas.

Checklist operativo: **30 listos / 61 pendientes**; se cierran PRE-03,
PRE-04, PRE-10 y FIL-03. Las pruebas prueban el transporte bloqueado y el
registro; la entrega REAL por WhatsApp sigue sin probarse en esta rama.
Las revisiones manuales del usuario se mantienen pendientes. Independencia:
133/14, incluida aceptación fiscal REAL y corte; no se presenta como cerrado.

La aplicación habitual `http://localhost:5174` → backend 3002 ya usa el
cambio, con su lanzador seguro y limpieza global sustituida. Verificada
SOLO GET: rutas nuevas montadas, filtros de pedidos y facturación Sin ciclo,
1440/390 sin desborde ni errores JS. No se crearon rutas, ciclos o demo en esa
base. Comparación antes/después: **16 huellas idénticas** (clientes/cuentas/
invitaciones, pedidos/líneas, facturas/líneas, stock, rutas/ciclos/recorrido,
carrito/líneas, series, envíos y comprobantes). Inventario en cero provisional,
rutas/ciclos vacíos e históricos sin ciclo. No se aplicó una migración nueva.
Developer `5013270`, main `e19c3e5` y servidor original 3000 conservados.

Evidencia privada en `/private/tmp/codex-preventa-enlaces-20261005`.
Detalle técnico mantenible: [grafo](../grafo/modulo/preventa-por-enlace.md).

Siguiente parte: filtros/contexto en bodega, preparación y faltantes; luego
cobertura y compras inmutables, PDF/recepción, carga/entrega y archivo individual
24 h con historial. Retirar el cron semanal POR CÓDIGO continúa pendiente;
arrancar únicamente con el lanzador seguro que lo sustituye.
