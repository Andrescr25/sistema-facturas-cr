# Factura del proveedor, PDF y comparación en órdenes por ciclo

Entrega local del **2026-10-06**, continuando desde `9f40870`. Implementación
`f41ce85`; verificación e integración final abajo.

El operativo pasa de **56 listos / 43 pendientes** a **61 listos / 38 pendientes
(99 IDs)**. Se cierran REC-01/02/03/04/08. Independencia anterior sigue **133/14**;
aceptación real, conteo físico, datos ciertos y corte no se cierran con esta entrega.

## Resultado

Reporte Proveedores → seleccionar semana → Órdenes por ciclo → orden enviada →
**Factura del proveedor y comparación**. Buscar comprobante por número/clave,
revisar proveedor y cantidades, confirmar y vincular explícitamente. La orden
mantiene productos/cantidades enviados; no registra compra ni recepción ni
modifica stock, precios, CxP o faltantes.

| Operación | Comportamiento comprobado |
|---|---|
| Vincular | Solo factura electrónica del proveedor de la orden enviada; revisión y firma antes de guardar. |
| Comparar | Solicitado/facturado en unidades propias; conversión de caja guardada, faltante sin motivo supuesto, cantidades adicionales y productos fuera de orden. |
| Varias facturas | Una orden puede sumar varias facturas, cada una una sola vez. |
| Factura compartida | Una factura completa solo se vincula a una orden vigente. No repartirla automáticamente entre ciclos. |
| Ver documento | Adjuntar PDF con confirmación de factura/proveedor o generar representación identificada de datos guardados. Abrirlo dentro de la orden, en otra pestaña o descargarlo. |
| Corregir | Retirar vínculo con motivo/actor/fecha; PDF y comparación anterior quedan en historial, otro vínculo exige nueva revisión. |
| Fuente modificada | Avisar cambio y conservar el snapshot anterior, sin reescribir silenciosamente lo revisado. |
| Reintentar | Misma UUID/solicitud no duplica vínculo/PDF ni cantidades; otra solicitud con la misma clave se rechaza. |

Ejemplo comprobado: se pidieron **2 cajas × 6 = 12 unidades**, se facturó **1
caja = 6**, diferencia **6 sin facturar**. Otro producto: **4 pedidas / 5
facturadas**, adicional **1**; tercero fuera de orden: **2**. No se afirma que
faltan físicamente, que están agotados o que se recibieron. Producto/conversión
sin confirmar se conserva para revisar y no permite afirmar un déficit falso.

Cuando existe compra registrada, la comparación usa sus líneas/conversión
histórica. Cambiar el mapeo actual no cambia esa compra. Sin compra se revisa
la relación explícita del buzón; no deducir producto por código/nombre ni
asumir conversión 1. Sumas decimales y redondeos coherentes con compra_linea.
El total de factura es el del encabezado, sin reconstruirlo desde líneas.

## PDF e historial

048 guarda snapshots y metadatos en dos tablas SQL; PDF en almacenamiento
privado, ruta/bytes/SHA-256 en DB. Archivos 0600, carpeta 0700, fuera de Git y
sin montaje HTTP. Descarga exige permiso Reporte Proveedores y orden/vínculo/PDF
correctos; respuesta private/no-store/nosniff, sin ruta en DTO. Se comprueban
huella, tamaño y archivo regular; ausente/alterado/simbólico se rechaza sin
regenerar bytes. Copias anteriores y documentos de vínculos retirados siguen
consultables. Respaldar DB **y** ALMACENAMIENTO_PRIVADO_DIR/ordenes-facturas juntos.

**«PDF adjuntado como original»** declara lo confirmado por el usuario; no
valida criptográficamente la firma o contenido fiscal del archivo. Máximo
5 MB, un PDF por carga. **«Representación de datos del sistema»** se genera
desde el snapshot de buzón/compra, con aviso visible de que NO es el original
del proveedor. No afirmar recuperación del XML histórico o conexión IMAP.
El XML fiscal, si está disponible, conserva su almacenamiento anterior.

La protección sigue el criterio del grafo: guardar archivo antes de fila;
si INSERT no sucede, retirar solo ese archivo nuevo. Si la fila ya se
insertó y falla después, conservar el archivo ante un posible COMMIT
confirmado. No ejecutar limpieza de huérfanos ni limpieza semanal para probar.

Los paneles de envío y factura tienen claves React distintas. Se detectó y
corrigió una duplicación visual durante cambios de estado; navegador confirma
una única instancia tras vincular, guardar PDF y retirar/corregir.

## Verificación

- 22 pruebas nuevas con PostgreSQL en copia desechable: proveedor/estado/revisión,
  unidades/fracciones, contexto cambiado, varias facturas, competencia entre dos
  conexiones/ciclos, snapshot inmutable, corrección, PDF exacto/hash/ausencia/
  symlink/límite, fallos antes/después de insertar y ausencia de efectos de negocio.
- Chromium **1440 y 390 px**: búsqueda/revisión, confirmación requerida, vínculo,
  generación, carga multipart original, visor autenticado, corrección/historial,
  re-vínculo sin duplicar y una sola instancia de cada panel. Sin errores JS,
  advertencias de claves duplicadas ni desborde horizontal. El visor recibe el
  blob PDF autorizado; el contenido se verifica también con PDFKit nativo.
- HTTP/ACL: 401 sin sesión; 403 con solo Clientes, incluido multipart; usuario
  Reporte Proveedores puede usar el flujo sin permiso Clientes. PDF no público.
- Once huellas completas de tablas de negocio iguales antes/después de vínculo,
  PDF/corrección; cabecera/estado/versión/líneas/orígenes/envío de orden idénticos.
- PDF nativo: una hoja y **80 líneas / 12 hojas**, descripción extensa completa,
  códigos únicos, cabecera/paginación/aviso de representación en todas las hojas,
  texto dentro de márgenes. El catálogo de cuatro productos no cambia.
- Build frontend aprobado; advertencia preexistente de chunk mayor de 500 kB.

Suite completa **2.081 pruebas / 364 suites**, cero fallos/canceladas/omitidas;
grafo **12/12**. Evidencia privada en
`/private/tmp/codex-factura-ordenes-20261006`: logs, screenshots/PDF propios,
huellas locales y respaldos protegidos. Pruebas únicamente en
`tachi_codex_factura_ordenes_20261006`; transporte anterior SOLO simulado para
crear orden enviada de prueba. Sin registros demo en la base habitual.

## Pendiente y siguiente parte

**Recepción física parcial/final:** REC-05/06/07/09/10/11. Cantidad físicamente
recibida separada, motivo confirmado de faltante/agotamiento, pendiente tras
parcial, fecha final y auditoría. REC-07 es parcial por diferencias visibles
sin causa inventada; REC-11 por vínculo repetido sin compra/stock, aún falta
probar recepción. OC-03/FAL-04 siguen parciales por estados/cantidades recibidas;
FAL-03/07/08, carga/entrega, archivo 24 h y retiro del cron/API/botón siguen abiertos.

Integrar con `compras.registrarCompra` y el kardex ya existente: HOY registrar
una compra suma stock dentro de esa transacción. No añadir otra entrada al
recibir una factura ya registrada, ni un botón «Recibida» sin evento físico.
Una factura no acredita recepción ni el envío acredita agotamiento.

Factura que reúne varias órdenes: falta una asignación explícita por línea y
cantidad para distribuirla sin duplicación. Esta entrega vincula la factura
completa a una única orden; no acredita repartos entre órdenes o ciclos.
Retiro de la orden a las 24 h empieza SOLO tras recepción completa, conserva
historia y documentos; no borrar ni archivar parciales. Próxima SQL **049**.
Mantener lanzador seguro mientras la limpieza semanal siga pendiente POR CÓDIGO.

## Aplicación local

048 aplicada únicamente a `tachi` LOCAL, localhost:5434, con respaldo nuevo
`antes-048-local.dump` protegido en la carpeta de evidencia. Dos tablas nuevas
vacías, sin registros demo en la base habitual. **23 huellas de negocio iguales**
al inicio, después de 048 y después de integrar/reiniciar. Cero órdenes,
vínculos, PDF nuevos, movimientos, conteos y productos con stock no cero.

Preservar ruta/ciclo CANCELADO/asignación del usuario, inventario provisional
cero y todos los históricos. No ejecutar reporte global para validar lectura:
puede asignar proveedores. Producción, developer/main, originales fiscales,
catálogos de Descargas y bases de ensayo anteriores quedan conservados.
Sin push/despliegue/corte, mensajes reales/IMAP/Hacienda real, limpieza semanal,
instalación de dependencias ni regeneración de Prisma. Próxima SQL 049.

## Cierre y relevo

Código `f41ce85` integrado exclusivamente por avance rápido en
`independencia-alegra`; rama habitual limpia, sin push. Aplicación **5174→3002**,
backend PID **97018**, Vite **98892**. Lanzador seguro permanente:
`/private/tmp/codex-inventario-propio-20261004/servidor-compartido.cjs`, con Node
absoluto. Mantiene guardas y sustituye limpieza ANTES de arrancar; nunca iniciar
server.js directamente mientras el cron siga pendiente por código.

Verificación compartida SOLO GET/SQL READ ONLY: `/health`, lista de órdenes y
frontend 200; rutas de factura/PDF sin sesión 401; nuevo componente servido.
No abrir reporte global ni probar registro de compra/recepción contra datos
reales. Original 3000/PID 5370, developer `5013270` y main `e19c3e5` conservados.

Servidores propios 3003/5175 detenidos y base desechable propia eliminada.
Worktree/rama temporal se retiran al cerrar el relevo; reserva liberada después
de esa comprobación. Evidencia/dumps privados se conservan, junto a Descargas,
archivo fiscal y ensayos anteriores. Guiones que dependan del worktree retirado
no son lanzadores reutilizables. Memoria conserva las 15 decisiones del usuario
y el siguiente paso: recepción parcial/final sin segunda entrada de stock.
