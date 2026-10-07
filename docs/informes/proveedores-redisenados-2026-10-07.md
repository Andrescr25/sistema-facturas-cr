# Reporte de Proveedores reorganizado — 2026-10-07

El usuario pidió rediseñar el reporte porque las nuevas funciones quedaron
mezcladas, manteniendo el diseño del sistema y reutilizando código. Esta entrega
es visual y local, en `independencia-alegra`; la revisión de migración y el corte
siguen aplazados. No modifica el cálculo de necesidades ni el ciclo de compras.

## Resultado

- Título simple y cuatro entradas grandes: Necesidades, Faltantes, Órdenes y
  Proveedores. Ruta y semana juntas en una tarjeta; la administración de fichas
  conserva sus filtros propios, fuera del trabajo de una semana.
- Necesidades con resumen, productos en tarjetas y explicación desplegable
  de cantidades. El detalle separa stock/pedidos, bodega/compras, procedencia
  y órdenes; conserva las unidades y advertencias del servicio existente.
- Faltantes con búsqueda/fecha juntas y proveedores en tarjetas. El resumen
  corresponde al reporte completo de la selección, y el contador de resultados
  a la búsqueda visible. Productos, notas y origen por cliente/semana siguen
  disponibles; preparar una compra usa la sugerencia del ciclo existente.
- Órdenes con tarjetas de referencia, proveedor, semana y estado. Activas e
  historial conservan la misma consulta. Dentro de una orden se muestran por
  separado Productos, PDF y envío, Factura del proveedor, Recepción y Cerrar
  orden, cuando su estado permite esas funciones.
- Los paneles de la orden permanecen montados al navegar: conservan cantidades
  y notas sin guardar, búsqueda de facturas, motivo de cierre, mensaje y PDF
  abierto. Las cantidades enviadas siguen bloqueadas; consultar el PDF no envía
  mensajes ni registra recepción. Cambiar de orden vuelve a Productos.
- Fichas de proveedores en tarjetas con contacto y acciones legibles. Consulta
  general de faltantes también adaptada: un solo título principal, nombres
  completos, acciones que caben en celular y selección para reasignar sin salto.
- Aviso de proveedor desaparecido limitado a una consulta válida de Faltantes:
  salir del área o recibir un error no demuestra que sus productos se agotaron.

## Código reutilizado

`NavegacionSecciones` extrae la navegación ya existente de Clientes. La usa
Clientes mediante su envoltorio anterior, y el reporte tanto para áreas como
para secciones de una orden. `PanelSeccion` reúne las tarjetas con encabezado
neutro. Se reutilizan `Boton`, `Insignia`, `TarjetasResumen`, Excel y el filtro de
ciclo, que recibe un título opcional; sus otras pantallas conservan el uso previo.
Envío, factura, recepción y cierre conservan componentes, handlers y servicios.
El comentario junto a los paneles explica por qué ocultar conserva su estado.

## Verificación

Navegador real a **1440 y 390 px: 28 escenarios**, 14 por tamaño. Entrada y
semana explícita; necesidades/procedencia; faltantes/búsqueda/vuelta; sugerencia
de una nueva revisión; activas/historial; borrador editable y enviada bloqueada;
cantidades y notas de recepción; búsqueda de factura y motivo de cierre; lectura
de PDF guardado y conservación de su URL al navegar; mensaje de pendiente;
error/reintento conservando proveedor y resultados vacíos; fichas abiertas y
canceladas; consulta general/edición/selección/procedencia; regresión de Clientes.
Selección de sección comprobada mediante `aria-pressed`; ninguna página desborda
horizontalmente ni produce errores JavaScript.

Estados operativos y PDF se simulan **solo en respuestas del navegador**.
Los identificadores de esos ejemplos nunca se insertan ni consultan en la base.
Fichas de proveedores y clientes se leen de la copia local; los formularios se
abren y cancelan. Se bloquean las mutaciones y salidas externas, incluida la
fuente de Google; se usa tipografía de respaldo. No se guardan órdenes, facturas,
recepciones, cierres ni adjuntos, ni se envía WhatsApp para validar este diseño.
El GET general de faltantes está interceptado también: puede autoasignar
proveedores y no debe probarse sobre registros reales por parecer una lectura.

Build aprobado, con el aviso previo de tamaño del bundle. Grafo: 12 pruebas.
Sin backend, SQL, Prisma ni instalaciones. No se repite la suite de backend:
su última auditoría mantiene 2.270 pruebas/363 suites; esta entrega verifica la
presentación y navegación, sin repetir operaciones comerciales.

Auditoría READ ONLY antes/después: **106 tablas y 80 secuencias idénticas**,
cero diferencias/fallos, stock/conteo/apertura provisional en cero e históricos
conservados. Frontend privado 5175 con caché propia; backend local habitual 3002
sin reinicio. Integración local por avance sin fusión y comprobación final de
la aplicación habitual 5174. No se modifica producción, `developer` ni `main`.

Evidencia privada 0700/0600 en `/private/tmp/codex-proveedores-diseno-20261007`:
capturas anteriores/nuevas, resultados de navegador/build/grafo e instantáneas
de conservación. Copia/rama propias y frontend privado retirados al terminar;
no se creó otra base. Memoria, grafo y checklists actualizados, conservando
literalmente las quince decisiones operativas del usuario.

## Pendiente

Aceptación visual por el usuario. Operativo **96 listos / 3 pendientes (99 IDs)**:
CLI-10/VAL-08 siguen a su revisión; RUT-03 necesita la fuente local de Maps.
Independencia **133/14 (147 IDs)** permanece separada. Este rediseño no acredita
aceptación fiscal real, conteo físico, recuperación de ubicaciones ni corte.
