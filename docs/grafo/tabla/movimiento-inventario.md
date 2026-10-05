---
id: tabla/movimiento-inventario
tipo: tabla
titulo: Kardex propio, documento de origen y apertura provisional
estado: vigente
archivos:
  - backend/migrations/independencia/042_inventario_propio.sql
  - backend/src/modules/inventario/inventario.service.js
  - backend/tests/inventarioPropio.test.js
aristas:
  depende_de: [decision/inventario-desde-cero]
  relacionado: [modulo/inventario, tabla/compra-linea, modulo/facturacion]
medido: 2026-10-05
---

Implementado en la 042 y probado en copia PostgreSQL desechable. Nueve
pruebas del core y quince de los servicios comerciales/auditorías verifican
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
