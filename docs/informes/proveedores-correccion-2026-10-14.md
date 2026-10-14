# Corrección de Reporte Proveedores — 2026-10-14

El usuario detectó necesidades históricas presentadas como pendientes,
procedencia incorrecta y pasos adicionales al enviar. El reporte muestra ahora
solo necesidades operativas, separando snapshots enviados de productos nuevos.
El único botón envía el PDF de las cantidades revisadas, teléfono de ficha y
mensaje predeterminado. Tarjetas de Reporte Clientes sin agenda.

## Causas comprobadas

Una copia local del respaldo permitió verificar productos de la lista pegada:
ya estaban procesados/revisados, y alguno ni siquiera permanecía en las líneas
de su factura tras Impresión. La consulta admitía procesados como faltantes.
Bodega validaba existencia del producto, sin comprobar que perteneciera a esa
factura. Notas agrupadas globalmente por producto podían mezclar proveedores;
ahora se filtran por sus facturas actuales. No se reparan FK ni se inventan
clientes para registros históricos; los snapshots enviados se conservan.

## Verificación local

PostgreSQL desechable restaurado desde respaldo existente, sin conexión de
desarrollo/pruebas a producción; escrituras con BEGIN/ROLLBACK. WhatsApp,
Hacienda y correo simulados; ninguna limpieza semanal. Diecisiete casos de envío
verifican PDF/cantidades, respuesta perdida, nueva factura, incertidumbre,
revisión/conversión cambiadas, teléfono ambiguo, extras, filtro de fecha y
orígenes visibles, borradores múltiples, permiso HTTP, conversión decimal
exacta/normalizada y ediciones temporales del siguiente pedido.
La pasada integrada con base aprobó **182 casos**; después se amplió la
protección de temporales y aprobaron **17 de envío**. El navegador de Revisión
de precios usó servicios reales y PostgreSQL con ROLLBACK: selección múltiple,
única automática, carrera conservando el precio escrito y consulta503/reintento
en390/1440 sin desbordes. Proveedores y Reporte Clientes recorridos en
390/700/1440 con API controlada, sin mensajes reales. Suite completa final: **2.794 casos, 2.432 aprobados, 362 condicionales
omitidos, cero fallos**. Además **39 casos de interfaz/estructura** y build
final aprobados. El recorrido integrado de Proveedores repitió referencias
duplicadas, decimales, nueva compra tras incierto conocido y reintento de
transporte no iniciado, junto a pérdidas de respuesta/recarga. Publicación:
se registra después del avance verificado, sin migración nueva.

No necesita SQL nuevo; reutiliza órdenes/envíos, bitácora y relaciones de compra
ya existentes. Recibir un correo no acredita factura revisada ni recepción
física. Ante varias órdenes candidatas, el usuario elige en Revisión de precios.

## Compatibilidad y límites

Hay proveedores con varios borradores históricos de distintas semanas.
Al enviar se conserva uno y los demás se cierran con motivo/bitácora, sin borrar
sus líneas/PDF ni tocar enviadas o intentos activos. Esto elimina reservas
ocultas que bloqueaban lo visible. Antes de guardar se bloquean facturas y
faltantes en orden estable y se vuelve a validar la huella; el claim protege
otra vez la factura frente a revisión/cola concurrentes. La huella incluye
códigos/nombres, cantidades, factor, mapping y orígenes.

Las ediciones nuevas usan producto.id. Una edición legada por referencia se
aplica sólo si corresponde a un único producto dentro del proveedor. Las
ediciones de un envío congelado no pasan al siguiente pedido; una edición
posterior se conserva. Incertidumbre mantiene el envío original bloqueado;
un nuevo pedido puede enviarse cuando el servidor ya lo separó. Una respuesta
perdida sin resultado conocido conserva siempre cuerpo/UUID del intento.
Un fallo probado anterior al transporte permite un nuevo clic explícito.

No se reparan/importan facturas de producción ni se realiza recepción física
por inferencia. La compra registrada confirma facturación, no llegada de
mercadería. ROT-06/07 y otros retiros de ciclos permanecen fuera de este alcance.
