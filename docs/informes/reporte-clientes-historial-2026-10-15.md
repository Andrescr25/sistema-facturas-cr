# Reporte Clientes: Activos e Historial — 2026-10-15

La regla de archivo de las facturas listas estaba documentada pero sin
implementar: el reporte leía pendientes/procesadas sin retirar ninguna por edad,
y la pantalla no tenía pestaña Historial. No era un cron fallando.

## Resultado

- Activos por omisión y nueva pestaña Historial, por ruta actual y cliente propio.
- Cada factura enviada a Impresión pasa al historial al cumplir **24 horas sin
  movimientos**. Consulta por SQL y refresco de la lista cada minuto visible;
  reabrir el navegador también consulta. El detalle en edición no se refresca
  automáticamente para conservar los guardados en curso.
- Una nueva factura del mismo cliente permanece activa; su anterior puede estar
  en historial. Resumen, búsquedas y Excel corresponden a la pestaña elegida.
- Historial conserva factura, nombre/ruta del cliente, cantidades, productos,
  respuestas y fechas de envío, última gestión y entrada al historial. No añade
  frecuencia/próxima visita al detalle histórico. Orden por última gestión.
- Un envío pendiente de procesar conserva «En impresión» aunque se archive en
  este reporte; «Procesada» exige ese estado real. La cola de Impresión no cambia.
- Recuperar vuelve a Activos y permite revisar/reenviar; un procesado recuperado
  que conserva su cola anterior no se vuelve a archivar sin un nuevo envío.

## Regla y conservación

Última gestión = máximo de fechas de faltantes y ajustes, actualización/despacho
de factura, envío y procesamiento de Impresión. Envío comprobado por la cola
pendiente o faltantes todos procesados, incluso si una cola antigua falta.
Revisada sin envío no se archiva. Corte inclusivo: 23:59:59 activa, 24:00:00
historial. Las horas antiguas sin zona son CR; comparación con AHORA_CR_SQL y
salida de instantes con zona explícita. Cambiar UTC/CR en la sesión no cambia
el resultado.

El archivo es una **clasificación de lectura**, no una transferencia física de
filas. historial_desde es el momento en que venció el plazo. No se escribe al
consultar ni se ejecuta cron o limpieza semanal. Se mantienen las tablas y sus
respuestas; no se añade una bitácora de cada clic ni una copia inmutable nueva.
Sin SQL de migración, dependencias nuevas ni acceso a producción para desarrollar.

## Verificación

Copia desechable de PostgreSQL local, BEGIN/ROLLBACK, red/salidas bloqueadas:

- 15 casos nuevos: sin envío, instante exacto de 24 h, proceso reciente/antiguo,
  procesados sin cola, ajuste y otra línea recientes, modificación de factura,
  nueva factura del mismo cliente, recuperación de pendiente/procesada y reenvío,
  duplicados antiguos de cola, UTC/CR, lecturas y Excel sin cambios, anuladas,
  ruta/identidad y filtro de vista inválido.
- Nueve casos de Reporte Clientes por ruta habilitados explícitamente contra PG:
  homónimos, ruta actual, filtros y Excel exacto, sin escrituras de consulta.
- Chromium con React compilado, API/permisos y PostgreSQL reales: separación
  por factura, mismo cliente en ambas pestañas, productos/respuestas y fechas,
  búsqueda conservada, Excel del detalle, archivo automático sin recargar,
  recuperación y reenvío. 390/700/1440 px, sin desbordamiento ni errores JS;
  permisos 401/403, ninguna salida o impresión real.
- Build Vite correcto; conserva advertencia previa de tamaño del paquete.

La prueba antigua que preparaba el SQL del reporte se actualiza para resolver
los fragmentos compartidos de historial y validar la consulta completa.


Suite completa: **245 archivos, 2.950 casos: 2.544 aprobados, 406 omitidos,
cero fallos**. Además, los 15 casos nuevos se repiten con la base local y se
habilitan los nueve de rutas; grafo/estructura tras documentación: 23 aprobados.
Entrega en `developer` y vista local 5173/3000 para revisión; sin migración nueva.
