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

Entrega de Codex en developer; no se publica a main en esta entrega.
