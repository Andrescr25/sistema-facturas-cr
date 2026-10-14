# Proveedores: confirmar WhatsApp y recuperar el PDF — 2026-10-14

El usuario pidió mostrar el teléfono y el mensaje predeterminado antes de
enviar, y recuperar el formato comercial anterior. La simplificación previa
había conectado el generador de órdenes persistidas y cambiado el diseño
sin que el usuario lo solicitara.

## Comportamiento

«Enviar PDF a WhatsApp» abre un modal con número normalizado y mensaje exacto.
Preparar guarda la fotografía, PDF y destino, sin reclamar el canal ni iniciar
WhatsApp. Cancelar no conserva un intento activo en la pestaña ni envía; la
copia preparada queda en el historial técnico. Confirmar usa el mismo cuerpo,
UUID, teléfono, mensaje y bytes de PDF mostrados, incluso si cambia después
el teléfono de la ficha. Si cambia el borrador o se resuelve la necesidad,
se rechaza antes del transporte y se pide una nueva revisión.

Una respuesta perdida mantiene la misma solicitud: «Verificar envío» consulta
su resultado sin preparar ni transportar otra copia. También se conservan
los intentos guardados por versiones anteriores. La preparación local permite
salidas bloqueadas; confirmar mantiene la protección del entorno aislado.

PDF recuperado del diseño comercial del historial: logo, cabecera y referencia,
cantidad del proveedor destacada, descripción y código, factor compacto,
totales y firma. Un único generador sirve al adaptador de órdenes y al servicio
anterior. Recibe datos resueltos y usa snapshots; no consulta cantidades ni
mappings actuales. Descargar o confirmar un PDF previo no regenera sus bytes.
Textos extensos continúan en otra página sin repetir la cantidad del producto.

## Verificación y publicación

Suite completa: 235 archivos, 2.859 casos, 2.463 aprobados, 396 condicionales
omitidos y cero fallos. Node25 se ejecuta en procesos independientes por
archivo, sin worker interno, conservando contexto de prueba y bloqueo de red.
Matriz dirigida: **332 pruebas aprobadas, cero omitidas/fallos**, incluyendo
PostgreSQL, confirmación, compatibilidad, interfaz, grafo y estructura. Build
correcto. Revisión independiente del cambio integrado sin bloqueantes.

Siete casos nuevos con PostgreSQL y ROLLBACK: preparación sin transporte,
cancelación, mismo destino/PDF/UUID incluso tras editar teléfono, repetición
idempotente y versiones, salidas bloqueadas, cliente resuelto, faltante nuevo
y permisos HTTP. Doce pruebas del gancho verifican respuestas tardías,
invalidación del modal, doble clic y reintentos guardados. Cinco pruebas con
PDFKit real verifican snapshots, márgenes, paginación y textos mayores de
una hoja sin perder código/descripción ni repetir cantidades/factor.

Chromium con HTTP/servicios/PG reales en transacción: 39 solicitudes, modal
con número y mensaje, cancelar sin transporte ni UUID activo, confirmación,
reserva reasignada sin409, edición7+3, exclusión/manual/restauración y próxima
factura3. Pantallas390/700/1440 sin desborde ni errores de ejecución. Revisión
visual de modal y PDF de1/6/7 hojas; transporte simulado, sin mensajes reales.

Sin SQL nuevo, conexión de desarrollo a producción ni ejecución de la limpieza
semanal. La decisión del usuario y las aristas del módulo se actualizan en el
mismo cambio. La publicación autorizada incluye sólo estos ajustes revisados
del equipo Codex sobre02089d5; no incorpora trabajo nuevo de Claude. Esta
entrega no cambia los pendientes ROT-06/07/08 del historial de impresos y la
cadena operativa. Los hashes y la salud del despliegue quedan en el registro
de memoria compartida al publicar.
