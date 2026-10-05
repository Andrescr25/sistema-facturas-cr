---
id: modulo/inventario
tipo: modulo
titulo: Inventario propio — cero provisional, kardex y conteo completo
estado: vigente
archivos:
  - backend/src/modules/inventario-auditorias/inventario-auditorias.service.js
  - backend/src/modules/inventario-auditorias/inventario-auditorias.controller.js
  - backend/src/modules/inventario-auditorias/inventario-auditorias.routes.js
  - backend/src/modules/inventario/inventario.service.js
  - backend/migrations/independencia/042_inventario_propio.sql
  - backend/src/utils/descuentosExceso.js
  - frontend/src/components/inventario-auditoria/Existencias.jsx
  - frontend/src/hooks/useInventarioAuditoria.js
  - backend/tests/auditoriasPropias.test.js
  - backend/tests/inventarioPropio.test.js
aristas:
  depende_de: [decision/inventario-desde-cero, tabla/movimiento-inventario]
  bloqueado_por: [bloqueo/conteo-fisico]
  relacionado: [modulo/compras, modulo/facturacion, tabla/compra-linea]
medido: 2026-10-05
---

La 042 crea una única bodega Principal y el kardex propio. El usuario pidió
empezar inventario, auditorías y excesos desde cero, porque el físico está
desordenado: [[decision/inventario-desde-cero]]. Sin movimientos, existencias
0 y conteo_confirmado=false. No copiar cantidades ni negativos de Alegra,
ni volver a procesar ventas/compras históricas como movimientos nuevos.
El costo promedio queda desconocido cuando no hay stock valorable; no
confundir costo del maestro, que sigue sirviendo para precios, con valoración.

Las filas anteriores de auditorías, descuentos y regalos quedan historica=true.
Se conservan en SQL como respaldo, fuera de las listas activas y sin admitir
ajustes desde un id viejo. No se borran documentos comerciales. Los trabajos
nuevos y sus productos usan ids propios, incluso una ficha sin alegra_id.

VENTAS Y COMPRAS. Factura nueva, edición y anulación; nota de crédito y su
anulación; registrar compra: todas llaman al kardex con la MISMA conexión y
transacción. Una venta resta, una nota devuelve, una compra suma cantidad
propia (incluido factor de conversión). Un reintento no duplica; una edición
registra solo la diferencia. Si falla algo después, se revierten documento,
movimientos y numerador. La devolución por nota recupera el costo de la salida
original, aunque hubiera compras posteriores más caras. [[tabla/movimiento-inventario]].

CONTEOS. Auditorías aleatorias de 50, por categoría y críticas de 30 (faltantes
propios). Guardar un ítem conserva un borrador; guardar conteos confirma el
ajuste propio. Finalizar exige todos contados y aplica pendientes. Cada ítem
lleva revisión del stock capturado: si otro movimiento cambió el producto,
409 exige actualizar y contar otra vez, incluso si volvió al mismo saldo.
Actualizar elimina borradores pendientes; jamás altera un ajuste aplicado.
Los conteos ordinarios vencen a las 24 h, como antes.

CONTEO INICIAL COMPLETO. Incluye todos los activos inventariables pendientes
de apertura física. Guardar nunca lo aplica parcialmente. Finalizar exige
cantidad de todos (cero también válido), catálogo completo y revisión global
estable. Bloquea el catálogo durante la aplicación y registra, en una sola
transacción, cantidad contada, ajuste desde saldo provisional y costo de
apertura. Conserva los movimientos anteriores y marca inicializada_en.
Este conteo puede durar varios días: no vence a las 24 h, pero cualquier
movimiento exige reconstruir y contar otra vez. Solo uno puede estar abierto.
Los productos nuevos posteriores pueden recibir su apertura en otro conteo.
El conteo REAL sigue pendiente hasta producción; no cerrar esa fila por
haber demostrado la herramienta con fixtures. [[bloqueo/conteo-fisico]].

DEVOLUCIONES. El flujo anterior era devolución DE CLIENTE (entrada), no a
proveedor. Se conserva y se añade elección explícita A PROVEEDOR (salida),
limitada a stock disponible. Finalizar registra el movimiento; no crea un
crédito financiero ni documento fiscal. Si cambian existencias después de
agregar el ítem, no sobrescribe el saldo: exige volver a revisarlo.

EXCESOS Y OFERTAS. Solo a petición de una persona, sin cron. Detecta stock
propio positivo y 60 días sin venta (venta_linea); máximo 10 de mayor valor
por tanda, con descuento inicial 10%. No escala porcentajes ni asigna regalos.
Empaque y cantidad real se registran juntos. Una oferta requiere empaque
actual no histórico, descuento positivo y existencias ACTUALES positivas;
la venta que agota el producto la oculta inmediatamente. Se comparte esa
consulta entre catálogos, portal y mostrador. El porcentaje puede cambiarse
manualmente. Un ajuste ya aplicado conserva su respaldo: no borrar el ítem
ni la tanda. Las ofertas históricas no reaparecen con la apertura en cero.

PANTALLA. Pestaña Existencias con nombre/referencia, filtro bajo mínimo,
paginación, kardex (origen y responsable) y mínimos/objetivo. Si existencia
< mínimo, sugiere objetivo menos existencia. No genera una orden sola. El
kardex negativo queda visible sin inventar valoración. No añade etiquetas de
stock a la tablet, según preferencia previa del usuario.

MEDICIÓN. 25 pruebas reales PostgreSQL, ROLLBACK y SAVEPOINT: cadena comercial,
fracciones, costo móvil, apertura completa, catálogo modificado, revisión
obsoleta, histórico excluido, devoluciones, ofertas agotadas y fallos de SQL.
Dos conexiones comprobaron el bloqueo de bodega. Suite final: 1.930 pruebas sin fallos ni omitidas; dirigidas de core 9/9
y de auditorías/comercio 16/16. Build
frontend correcto. Navegador 1440 y 700 px: existencias, kardex, mínimos,
conteo inicial y devolución a proveedor, cero errores JS. HTTP 401 sin sesión
y 403 sin permiso de inventario. Pruebas en copia propia, sin mensajes,
limpieza semanal, Hacienda ni cambios de producción.

APLICACIÓN LOCAL COMPARTIDA (2026-10-05). 042 aplicada con respaldo privado
previo: 2.144 productos en cero, ninguno confirmado como conteo físico;
auditorías, descuentos y regalos activos: 0. Conservadas 17 auditorías y
470 descuentos anteriores como historia. Huellas de 15 tablas comerciales
y series idénticas antes/después. Backend local 3002 con lanzador aislado:
HTTP confirma cero provisional y listas nuevas vacías. Producción intacta.
Sin conteos, indicadores del panel en cero; no mostrar 100% de precisión
sin una medición.
