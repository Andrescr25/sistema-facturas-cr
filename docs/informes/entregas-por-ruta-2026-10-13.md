# ROT-05: Carga/entregas por ruta, sin semanas

Usuario autorizó continuar el relevo y eligió que la carga incluya
**automáticamente todas las facturas pendientes de la ruta**. Codex implementa
esta parte en developer; no publica a main ni conecta con producción.

## Resultado

Carga y Entregas selecciona ruta o Sin ruta; muestra pendientes e historial
físico. Factura emitida vigente sin entrega completa es pendiente, cualquiera
que sea su fecha/semana. Las que esperan Bodega se incluyen para preparar,
pero no habilitan carga física hasta revisión. Anuladas y crédito total se
retiran como venta; si queda carga en camión se conservan para descargarla.
Completamente entregada sale a historial, sin borrar eventos.

Ruta/orden/Maps de la ficha antes del primer evento; fotografía fijada al
registrar. Una carga registrada sigue en su ruta aunque la ficha cambie,
y las facturas nuevas entran automáticamente según la ficha actual, sin
alterar el historial anterior. Homónimos por id y documentos sin ficha por
factura. Agrupa varias facturas en la misma parada cuando comparten contexto.

Sugerencia inversa de TODA la ruta, independiente de página visible. Detalle
por clave propia y ámbito; Excel completo sin semana, sin precios/costos/
saldos. La consulta histórica explícita por ciclo y sus exportaciones se
conservan en servicio separado; la pantalla no las usa. Lectura de líneas
compartida con la consulta histórica, sin duplicar el ayudante.

Físico sin promover ciclos: parciales, descarga/recarga, incidencia y revisión
con admin conservan cuatro decimales, foto anterior, versiones/UUID, actor y
hora del servidor. Nota de crédito completa bloquea carga/entrega aunque
factura permanezca emitida; parcial/cobro no retiran venta. Evento y bitácora
atómicos. Foco actualiza el plan sin desmontar una solicitud incierta;
reintentar conserva el mismo UUID/cuerpo, evitando sumar dos veces.

Componente RegistroFisico ya no habla con services/API; su estado/llamadas
viven en useRegistroEntrega. Se retira de deuda de estructura. Página arma
secciones, helpers puros probados, Boton/Insignia/TarjetasResumen reutilizados,
paleta por rol y archivos por debajo de sus topes.

## SQL 057 y límites de despliegue

`057_entregas_por_ruta.sql` hace nullable entrega_evento.recorrido_id,
conserva su FK, agrega ruta operativa/vigencia/firma y sustituye documento/
trigger. No borra ni reescribe eventos existentes, no crea salidas ni hace
backfill. Los eventos previos conservan su recorrido/JSON original. Prisma
no se regenera y no se instalan dependencias.

Probada y aplicada solo a copias locales. **Pendiente en producción**:
Render no ejecuta estas SQL por push. No subir este commit a main hasta que
057 esté aplicada allá. El código y evidencia se publican solo developer.

No se infiere que una factura histórica sin registro físico ya fue entregada.
Si está vigente, aparecerá pendiente; Bodega procesada no prueba entrega.
No se inventa fecha de corte ni una entrega automática para ocultarla.
Historial físico de entregas es distinto del historial de impresos ROT-06/07,
que todavía falta implementar (24 horas SIN MOVIMIENTO desde envío).

## Verificación local

Solo copia desechable PostgreSQL 17, nombre tachi_codex_entregas_20261013,
guardia de red/salidas y BEGIN/ROLLBACK. Algunos ensayos de concurrencia
confirman fixtures ZZ solo en esa copia, retirada al cerrar.

Ensayo de 057: evento creado con 051 antes de migrar; huella del evento y
fotografía iguales después; cambiar ficha no reinterpreta su recorrido
histórico. Fixture y ensayo deshechos; migración después aplicada al clon.

Pruebas PostgreSQL y HTTP: pendientes sin semanas/fecha límite, sin ruta,
homónimos, múltiples facturas, carga completa entre páginas, Bodega pendiente,
parcial/completa e historial, nueva factura automática, cambio de ruta antes/
después de cargar, anulada con devolución y nota parcial/completa, Excel sin
escrituras. Plan/detalle/físico nuevos en READ ONLY/REPEATABLE READ reales.
Dos conexiones reales: mismo UUID genera un evento; versiones rivales una
confirma y otra409. Se conservan pruebas de cantidades, inmutabilidad SQL,
reimpresión, idempotencia, bitácora fallida, permisos y documentos previos.

Se actualizan únicamente las expectativas de promoción/bloqueo de ciclos
retiradas por el usuario: ya no bloquean el físico, pero la historia de la
cadena/documentos se sigue verificando. El ensayo de exportaciones nativas
invalida también el nuevo servicio histórico al cambiar su conexión.

- Suite completa: 2.766 pruebas; 2.421 aprobadas, 345 condicionales omitidas,
  cero fallos/cancelaciones. Secuencial por el problema conocido del runner
  Node25; no se excluyen archivos ni casos.
- 91 pruebas dirigidas con base, cero fallos/omisiones.
- Build de Vite aprobado, advertencia previa de tamaño del bundle conservada.
- Chromium 390/700/1440: API real con usuario solo Entregas, sin selector de
  semanas; pendiente de Bodega bloqueada, homónimos/múltiples facturas, Excel
  completo. Carga4 → entrega3 → descarga1 → carga7 → entrega7, cinco eventos
  y factura en historial. Respuesta perdida y foco: mismo UUID/cuerpo no
  duplica carga, conserva formulario incierto. A→B→A con respuesta vieja
  no cancelable, nueva factura al actualizar, 503 plan/selector y reintentos.
  Cero errores de página/desbordamiento. Capturas inspeccionadas.
- Estructura/grafo: 23 aprobadas, cero fallos. Recorrido final con claves e
  identidades visibles también aprobado.

Evidencia privada local: /private/tmp/codex-entregas-ruta-20261013/.
Sin mensajes reales, sin limpieza semanal, sin producción. Se refresca solo
la preview propia 5173/3000 con 057 y se conserva la base/fotos locales.
