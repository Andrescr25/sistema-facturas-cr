---
id: modulo/ordenes-compra-por-ciclo
tipo: modulo
titulo: Órdenes por ciclo — borrador, revisión y reservas; envío y recepción pendientes
estado: vigente
archivos:
  - backend/migrations/independencia/046_ordenes_compra_por_ciclo.sql
  - backend/src/modules/orders-whatsapp/ordenesCiclo.service.js
  - backend/src/modules/orders-whatsapp/ordenesCiclo.routes.js
  - backend/src/modules/orders-whatsapp/orders-whatsapp.routes.js
  - backend/tests/ordenesCompraCiclo.test.js
  - frontend/src/components/reporte-proveedores/OrdenesCompraCiclo.jsx
  - frontend/src/components/reporte-proveedores/FaltantesPorCiclo.jsx
  - frontend/src/pages/ReporteProveedores.jsx
aristas:
  depende_de: [tabla/supplier-product-mapping, decision/ciclo-de-ruta-como-contexto, decision/orden-enviada-y-archivo-por-recepcion]
  relacionado: [modulo/faltantes, modulo/compras, modulo/inventario, modulo/permisos, modulo/whatsapp]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-05
---

PRIMERA PARTE IMPLEMENTADA. Reporte Proveedores → elegir semana concreta o
Sin ciclo → proveedor → Preparar orden de este ciclo. La pestaña Órdenes por
ciclo permite consultar/revisar borradores guardados y cierres, aunque el
proveedor deje de tener faltantes en el reporte. No aplica las cantidades ni
la marca de envío GLOBAL por nombre del flujo anterior. Ese flujo se conserva
separado mientras se reemplaza su envío.

IDENTIDAD Y PROCEDENCIA. Cabecera propia, proveedor.id, ciclo fijo o NULL
histórico explícito; copias de nombre, cédula, ruta y semana. Líneas por
producto.id, aun con referencias repetidas. Cada reserva identifica
faltante/factura/cliente/parada y anticipado. No inferir el ciclo por semana
actual ni cambiarlo cuando el cliente cambia de ruta. No convertir borradores
globales ni envíos viejos sin evidencia de su ámbito.

REVISIÓN. Estados implementados: borrador, pendiente_enviar y cerrada sin
envío. Solo borrador permite cambiar cantidades, excluir productos o añadir
otros faltantes del MISMO proveedor/ciclo. Cantidad entera del proveedor;
factor snapshot con seis decimales y cantidad propia generada en SQL.
Sugerir redondea cajas hacia arriba; lo sobrante se muestra en la equivalencia,
pero solo reserva necesidades reales de esta semana. No asigna ese sobrante
a otra ruta ni al inventario. Factor/códigos guardados se conservan aunque el
maestro cambie o se deshaga el mapeo. mapping_id es referencia histórica sin
FK, para no bloquear esa corrección ni reescribir la orden.

RESERVA NO ES ENVÍO. Sugerencia separa faltante registrado, reservado en
órdenes abiertas y libre. Cada origen se descuenta una vez, incluso si se
reasigna el proveedor. La API de compras serializa modificaciones con bloqueo
transaccional 46005/1, bloquea faltantes por id y exige versión para editar.
Creación con UUID/cuerpo canónico: reintentos devuelven la misma orden; una
clave con otra solicitud rechaza 409. SQL también protege contexto/historial,
líneas pendientes y cantidades/procedencia de reservas. Errores revierten
líneas, reservas y bitácora juntos.

Si aparecen 3 después de reservar 10, una orden NUEVA puede reservar las 3;
ningún borrador se amplía solo. Si bodega corrige/anula o se reasigna el origen,
marcar pendiente exige revisar. Pendiente bloquea líneas hasta volver
explícitamente a borrador. Cerrar SIN envío exige motivo, libera sus reservas
y conserva cantidades/procedencia/bitácora en Historial de cierres; no se
reabre ni se borra. No es cierre de una orden enviada ni archivo tras recepción.

PERMISOS. /api/orden-compra/por-ciclo hereda Reporte Proveedores. Sugerencia
solo lee; ficha propia activa por cédula, o nombre EXACTO único sin cédula.
Ambigüedad/no ficha/inactivo se explican al usuario. Listas conservan ruta,
semana e históricos Sin ciclo. Contexto cerrado/cancelado no admite creación
ni nueva revisión comercial; el cierre de un borrador sí libera sus reservas.

PENDIENTE. Envío propio con bytes/PDF revisados, destinatario, idempotencia e
incertidumbre; bloqueo irreversible después de confirmación de envío; estados
enviada/parcial/recibida/cierre de enviada y cobertura PENDIENTE DE RECIBIR.
Después factura/PDF/recepción física separada de registrar compra, carga/
entrega y archivo 24 h. No agregar endpoints para «marcar recibida» sin su
evento físico. FAL-03/04/05/06/07/08 y OC-03/05/06/08/09/10 permanecen abiertos
por esas partes. Limpieza semanal todavía pendiente POR CÓDIGO; nunca ejecutarla.

PRUEBAS. PostgreSQL en base propia tachi_codex_*, SAVEPOINT/ROLLBACK y dos
conexiones sobre fixtures ZZ locales para concurrencia/reintentos. No mensajes
reales ni entradas de stock. Relevo y medición final en
docs/informes/ordenes-ciclo-2026-10-05.md.
