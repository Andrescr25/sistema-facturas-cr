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
transporte no iniciado, junto a pérdidas de respuesta/recarga. Publicación
inicial: Codex llevó los seis commits revisados a main/developer a7d2444.
Render frontend actualizado y backend/health200 comprobados por HTTP público;
esto no acredita una prueba de negocio autenticada en producción.

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

## Continuación verificada — 2026-10-14

El usuario confirmó mantener **cantidades ingresadas enteras**. Se rechazan
fracciones explícitas sin truncar; cero excluye y los manuales son positivos.
El saldo exacto calculado por conversión mantiene seis decimales y las unidades
del proveedor son enteras. Se comprobó también0.14+extra1=1.14: compararlo con
micros evita rechazarlo por la precisión de coma flotante.

Una factura parcial ya registrada no retira su orden de candidatas. Dos
comprobantes6+4 completan una misma orden10; parcial anterior y nueva orden
exigen elegir. Fuentes pendientes/alteradas no acreditan facturación completa:
una única incierta también se elige. El id de la automática vista se revalida
al registrar; si cambió o apareció después, devuelve409 y conserva los precios.
No acredita recepción física ni cambia fotografías/PDF enviados.

Agregar un producto ya activo suma en la misma línea: cantidad revisada7 más
extra3 persiste10 y recarga10. Si el original está excluido, el extra se conserva
aparte sin atribuirle sus clientes. Consolidar/separar es una transacción y
comprueba identidad y cantidad/timestamp del extra revisado: una pestaña no
borra un extra4 porque antes vio3. La referencia literal «id:2» no se interpreta
como el id2; las filas nuevas dejan una prueba de identidad en bitácora y las
legadas se resuelven sólo cuando código/nombre pertenecen a una ficha única.
Restaurar usa el código almacenado exacto y verifica el producto propio.

Los temporales nuevos conservan huella/fecha del reporte revisado en bitácora.
La escritura comparte el advisory de envío, bloquea factura→faltante y relee;
un reporte anterior recibe409. Cambiar huella/fecha o desaparecer el origen
retira buffers locales; temporales tagueados de otra revisión no se aplican.
Legacy sin huella conserva compatibilidad, con identidad única. Un envío
incierto oculto por el filtro de fecha mantiene su prueba orden/UUID aparte
de la lista visible: permite un pedido nuevo ya separado por el servidor,
sin retransmitir el intento anterior ni alterar su cuerpo/PDF.

Verificación integrada final: **298 pruebas dirigidas** (matriz PostgreSQL,
interfaz, grafo y estructura), build y navegador390/700/1440. Proveedores con
HTTP/servicios/PG reales y ROLLBACK:35 solicitudes verifican guardado/recarga,
exclusión/extra/restauración, consolidación y nueva factura3 sin heredar10.
Revisión de precios con base:62 solicitudes,6+4, parcial+nueva, selección
incierta, vínculo previo y automática cambiada/ausente; conserva precios ante409.
Interfaz con API controlada verifica además503 desconocido, cuerpo/UUID y
prueba de un envío oculto por fecha. Cero mensajes/correos reales, sin limpieza.

Suite general final: **231 archivos,2.824 casos,2.445 aprobados,379 condicionales
omitidos,cero fallos**. Node25 fallaba al deserializar un worker del buzón:
se ejecutó cada archivo en un proceso independiente sin el worker interno,
manteniendo el contexto de prueba, dobles de transporte y bloqueo externo.
Los mocks del historial se actualizan al separar ese servicio del PDF, cuya
deuda estructural se retira al volver a682 líneas. Sin SQL nuevo. El avance
a developer/main incluye sólo esta continuación revisada del equipo Codex;
su publicación efectiva se registra en la memoria compartida al efectuarlo.
