---
id: tabla/movimiento-inventario
tipo: tabla
titulo: Kardex propio, documento de origen y apertura provisional
estado: vigente
archivos:
  - backend/migrations/independencia/049_recepcion_orden_compra_ciclo.sql
  - backend/migrations/independencia/042_inventario_propio.sql
  - backend/src/modules/inventario/inventario.service.js
  - backend/tests/inventarioPropio.test.js
aristas:
  depende_de: [decision/inventario-desde-cero]
  relacionado: [modulo/recepcion-ordenes-compra, modulo/inventario, tabla/compra-linea, modulo/facturacion]
medido: 2026-10-06
---

Implementado en la 042 y probado en copia PostgreSQL desechable. Nueve
pruebas del core y dieciséis de los servicios comerciales/auditorías verifican
transacciones reales, sin confirmar fixtures. [[modulo/inventario]].

`movimiento_inventario` conserva producto propio, bodega Principal, tipo,
cantidad con signo, costo, documento de origen, clave de operación, usuario
y fecha. Es inmutable: corregir registra otro movimiento. Las existencias
y el promedio móvil se calculan con NUMERIC en `inventario_kardex` y
`inventario_saldo`; no hay otra tabla con cantidades guardadas. La apertura
sin movimientos devuelve cero y `conteo_confirmado=false`.

`reconciliarDocumentoEn` corre dentro de la transacción comercial. Compara
la suma del kardex del documento con las cantidades actuales de sus líneas
y registra solo la diferencia; repetir no duplica. Una venta histórica
importada de Alegra no se convierte en una nueva salida de bodega.
Las notas devuelven el costo de su salida original; anularlas revierte ese
valor, no el promedio posterior. Compras usan cantidad propia y su costo con impuestos y descuentos.
Una cantidad negativa queda visible con costo promedio desconocido; una
entrada que recupera saldo positivo establece el costo de lo recibido.

El conteo inicial real conserva la cantidad contada y registra el ajuste
desde el saldo provisional; establece su costo sin borrar movimientos.
La auditoría inicial completa exige todos los productos, revisión estable y
cantidad física explícita. Las ordinarias y devoluciones registran ajustes
con el id del ítem, una sola vez. La interfaz muestra el origen y responsable.
La confirmación del conteo físico REAL corresponde a producción, no a las
pruebas. La 042 no crea cantidades ni repite operaciones históricas.

APLICACIÓN LOCAL COMPARTIDA (2026-10-05). 042 aplicada con respaldo privado
previo: 2.144 productos en cero, ninguno confirmado como conteo físico;
auditorías, descuentos y regalos activos: 0. Conservadas 17 auditorías y
470 descuentos anteriores como historia. Huellas de 15 tablas comerciales
y series idénticas antes/después. Backend local 3002 con lanzador aislado:
HTTP confirma cero provisional y listas nuevas vacías. Producción intacta.
Sin conteos, indicadores del panel en cero; no mostrar 100% de precisión
sin una medición.

RECEPCIÓN049. [[modulo/recepcion-ordenes-compra]] separa aceptación comercial de
entrada física SOLO en compras nuevas ya vinculadas al INSERT. Modalidad fija
inventario_por_recepcion=true, cantidades propias de eventos, origen compra/id y
delta incremental en misma transacción. Costo de las partidas del evento físico actual, sin revalorar lo previo ni
restar valores ya redondeados (regalía posterior conserva costo cero). Compras anteriores mantienen entrada comercial,
sin nueva acreditación ni importación de stock histórico. Línea ya recibida
inmutable por SQL; no corregirla editando su cantidad/factor/producto. Las frases
sobre entrada íntegra al registrar describen compras false y la etapa042.
