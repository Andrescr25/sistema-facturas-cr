# Auditoría de Reporte de Clientes → Impresión, 2026-10-11

El sistema propio ya está en producción. El usuario pidió corregir errores
trabajando en paralelo con Claude, que revisa Facturación. Codex revisó el
registro de entregas de Reporte de Clientes y su envío a Impresión desde
`b553385`, en la copia y rama propias `tmp/codex-auditoria-impresion-20261011`.

## Errores confirmados y correcciones

1. **Se podían cambiar entregas ya enviadas a Impresión.** Guardar/borrar
   ajustes escribía directamente, sin comprobar el estado ni tomar el bloqueo
   de factura que usan encolar, recuperar y procesar. Una petición atrasada
   podía guardar una respuesta distinta de la ya puesta en cola. Ahora toma
   primero el bloqueo de factura y después el del faltante en una transacción,
   y rechaza una factura anulada, un faltante procesado o una cola pendiente.
   Para volver a cambiar la entrega se recupera desde Reporte de Clientes.
2. **Se podía enviar sin que terminara de guardarse la revisión.** El servidor
   aceptaba faltantes sin respuesta o sin revisión confirmada, mientras la
   pantalla mostraba la confirmación optimista. Ahora la pantalla espera los
   guardados, comprueba los valores confirmados y vuelve a comprobarlos después
   del diálogo; el servidor exige revisión persistida para cada faltante bajo
   el bloqueo de factura. Una revisión fallida impide el envío.
3. **Un fallo borraba otros éxitos de la pantalla.** Cada acción restauraba una
   copia completa anterior del mapa; dos respuestas del mismo producto también
   podían guardarse en orden inverso. Ahora cada faltante serializa sus POST y
   DELETE, y solo revierte su línea al último valor persistido. La confirmación
   masiva conserva las líneas que sí se guardaron. Cambiar de selección impide
   que una respuesta anterior toque la vista o despache peticiones en espera.
4. **Se aceptaban entregas contradictorias.** Cantidades negativas o mayores al
   faltante, estados incompatibles, revisión con tipo incorrecto y una bandera
   `requiere_actualizacion` falsa podían persistirse. Ahora la entrega se valida
   y la bandera se deriva de la cantidad. Si cambia la entrega y se omite
   `revisado`, se invalida la confirmación anterior. La API distingue validación
   (400), inexistencia (404) y conflicto de estado (409).

## Comprobación

- Los primeros 13 casos de base y 4 casos del hook reprodujeron los errores
  antes de corregirlos. Después se ampliaron los casos de recuperación, fallos
  sucesivos, borrado en espera, cambio durante el diálogo y selección anterior.
- **26 pruebas nuevas pasan:** 16 con PostgreSQL real y 10 de los manejadores
  reales del hook con respuestas controladas. Incluyen conexiones distintas
  para comprobar que una decisión tardía espera el bloqueo y luego recibe 409.
- **75 pruebas existentes pasan:** ids propios, cola, impresión nativa,
  propuesta/payload, precios, inventario, recuperación, rollback, checklist,
  filtros y hora de envío. Se mantienen las restricciones de edición de
  facturas electrónicas o cobradas.
- Pedido de **6 con 3 faltantes que no llegaron queda en 3**; recuperar y
  confirmar que llegaron restaura 6, y recuperar/reprocesar no repite la rebaja.
- **Build frontend correcto.** Conserva el aviso existente por tamaño del
  bundle. La impresora física no forma parte de estas pruebas.
- **Grafo: 12/12 pruebas.** Código, comentarios, nodo de Faltantes y checklist
  actualizados en la misma entrega.

Las pruebas que escriben usan exclusivamente una copia desechable restaurada
desde la base local en `127.0.0.1`, con fixtures ZZ. Un preload bloquea toda
conexión de red externa y la carga de archivos de entorno; no hay mensajes,
correo, Alegra ni servicios fiscales reales. Los casos de inventario usan
BEGIN/ROLLBACK; los de concurrencia usan un producto no inventariable para
poder confirmar transacciones y retirar sus fixtures sin tocar el kardex
inmutable. El contenedor de pruebas se retira al cerrar.

## Entrega y siguiente paso

No cambia el motor de edición, cálculo de impuestos, precios o inventario de
Facturación, que revisa Claude. No hay migración SQL ni modificación de datos
de producción. Las colas anteriores conservan su procesamiento; la validación
de revisión aplica a nuevos envíos. No se corrigen automáticamente facturas ya
procesadas.

El cambio se integra por avance sin fusión en `developer`, conservando la rama
y copia propias para revisión cruzada de Claude. La publicación en `main` requiere la
autorización específica de esta entrega; no se ha desplegado desde esta auditoría.
Los checklists conservan sus casillas de avance.
