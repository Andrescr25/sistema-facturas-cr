# Reporte Contador: ventas electrónicas separadas — 2026-10-24

El usuario pide separar facturas/tiquetes y notas electrónicas de las demás
facturas y notas, en pantalla y Excel. Aclara conservar Gastos operativos
como cuarta pestaña y hoja. Orden en ambos:

1. Facturas y notas electrónicas.
2. Compras.
3. Facturas y notas.
4. Gastos operativos.

Se reutiliza `electronica`, la misma bandera persistida que usa Facturación;
no se adivina por clave, número o factura acreditada. Cada nota pertenece a
su propia clase y se resta una sola vez. Los tiquetes electrónicos entran en
la primera vista y se identifican como tales, también al abrir su detalle.
Compras conserva todas sus emisiones; Gastos conserva su tratamiento aparte.

La lectura mensual incorpora el tipo de factura en su consulta existente.
Cambiar de pestaña no consulta de nuevo la base. Búsqueda, paginación,
monedas, importes originales, estilos y resúmenes por impuesto se conservan.
Descarga y correo reutilizan el mismo generador de cuatro hojas; el modal de
envío muestra esos mismos nombres. Los reportes históricos guardados no se
reescriben. Sin SQL nuevo, cambios de documentos o conexión a producción.

Verificación:19 pruebas dirigidas correctas, incluidas consultas PostgreSQL
en BEGIN/ROLLBACK y correo simulado;68 comprobaciones Chromium a390/700/1440,
sin erroresJS ni desbordamientos. Incluyen las cuatro vistas, búsquedas,
tiquete y su detalle, ausencia de consultas al alternar pestañas, descarga
real del XLSX y adjunto de correo con idénticos nombres. Se validan también
descuentos, notas, monedas, OOXML, formato numérico y preparación para imprimir
en las cuatro hojas. Build, lint estricto del cambio, grafo y estructura
correctos. Evidencia privada: `/private/tmp/codex-contador-electronicas-20261024/`.

## Publicación autorizada a main

Entrega inicial de Codex en developer, commit `c9f41e2`. El usuario autoriza
después «perfecto subelo a main». Codex publica ese cambio y su registro de
verificación, ambos propios; no viajan commits adicionales de otro agente.

Antes de publicar: suite completa sobre copia local desechable, **242 archivos,
2987 pruebas correctas,0fallos y3omisiones históricas** por los requisitos de
cero provisional. Se conserva el inventario de la copia. La configuración
cifrada de Hacienda del clon se reserva para credenciales simuladas de las
pruebas; no se toma ni modifica una llave de producción. Se conservan las68
comprobaciones de navegador del mismo código, build y lint estricto correctos.
No se requiere migración ni conexión a la base de producción.

Evidencia de la suite: `/private/tmp/codex-contador-electronicas-main-20261024/`.
El clon se retira al cerrar; no se cambian los procesos de la vista local.
Estado público de Render y autoría de la publicación en el relevo compartido
`permiso-subir-a-main.md`, sin afirmar una sesión autenticada remota.


## Corrección posterior: la factura comercial se emitió como tiquete

Tras los ajustes de Claude en Hacienda, el usuario detecta que algunos
comprobantes tipo04 seguían con la etiqueta Factura electrónica. La lectura
mensual sólo seleccionaba el tipo comercial, que no cambia al emitir.
Se incorpora el tipo del comprobante vinculado, propio y aceptado en
producción en el mismo SELECT. Para electrónicas prevalece04/01; sin vínculo
se mantiene el tipo histórico. No se infiere por correo ni por clave y no
se consulta XML por fila. El helper existente corrige tanto lista como modal.

20 pruebas de reporte/Excel correctas:8 escenarios nuevos de tipo comercial
frente a fiscal, con estados/ambientes e históricos. Se conserva la columna
del documento original, las notas electrónicas y los totales del Excel.
71 comprobaciones Chromium390/700/1440 con una factura comercial emitida como
04: insignia y modal Tiquete electrónico, cuatro pestañas/hojas, paginación y
correo simulado. Build correcto. Clon local desechable, fixtures en ROLLBACK;
sin SQL nuevo ni cambios en producción. Entrega inicial en developer por Codex.
Evidencia privada:`/private/tmp/codex-contador-tiquete-20261024/`.


## Retiro posterior de Facturas y notas — 2026-10-24

El usuario pide quitar la pestaña sin electrónica y la hoja del mismo nombre.
Se retiran su opción, filtro y resumen Excel; las ventas no electrónicas no
se trasladan a la hoja fiscal. Pantalla, descarga, adjunto y texto del modal
de envío quedan con tres clases: Facturas y notas electrónicas, Compras y
Gastos operativos. La lectura mensual/resumen general y los archivos antiguos
se conservan. Sin borrar registros, migración ni emisión fiscal nueva.

Se actualizan las pruebas existentes de filtros, resúmenes y OOXML para las
tres hojas, incluidos datos mixtos con ventas no electrónicas, pendientes y
rechazadas. La misma prueba de correo simulado valida el adjunto. Se conserva
la regresión de etiqueta de tiquete aceptado. Evidencia privada en
`/private/tmp/codex-contador-tres-hojas-20261024/`; pruebas sobre clon local
con ROLLBACK, sin conexión a la base de producción ni correos reales.


Verificación de este retiro:20 pruebas de reporte/Excel aprobadas;59
comprobaciones Chromium390/700/1440 con tres pestañas, insignia/modal de
Tiquete electrónico, descarga XLSX y adjunto de correo con exactamente tres
hojas, sin erroresJS o desborde. Build, lint del helper y diff --check
correctos. Cambios propios de Codex en developer, pendientes de main.
