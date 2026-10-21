---
id: leccion/lo-que-mueve-plata-no-va-por-omision
tipo: leccion
titulo: Un valor por omisión que cobra, y una suma que cuenta lo anulado — Facturación recorrida entera
estado: vigente
archivos:
  - frontend/src/hooks/useFacturacion.js
  - frontend/src/components/facturacion/SelectorPago.jsx
  - frontend/src/components/facturacion/PanelCobro.jsx
  - frontend/src/components/facturacion/VistaFactura.jsx
  - frontend/src/hooks/useFacturasEmitidas.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/facturacion/saldo.sql.js
  - backend/src/modules/facturacion/facturaConsulta.service.js
  - backend/src/modules/cuentas-por-cobrar/cobros.service.js
  - backend/tests/facturaCobroRevertido.test.js
  - backend/tests/facturacionFlujoPantalla.test.js
aristas:
  relacionado: [modulo/facturacion, modulo/facturacion-offline, modulo/conciliacion-cobros, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-10-20
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


El día después del corte el usuario reportó: «cuando facturo algo sale como
pagado de una, y esto no debería ser así». Eran dos errores encadenados, y el
segundo solo se vio al intentar arreglar las consecuencias del primero.

## 1. Un valor por omisión que cobraba

Al elegir el cliente, la pantalla marcaba **Efectivo** si era "de contado"
(«paga en el mostrador») y solo dejaba "Queda pendiente" a los de crédito.
Pero acá 185 de 247 clientes son de contado y 61 no tienen plazo: uno solo
tiene crédito. Y casi nada se cobra en un mostrador — se factura el pedido y
se cobra al entregarlo. Resultado: toda factura nacía con su recibo en caja y
el papel decía **"Pagado (Efectivo) · SALDO ₡0"**, sin que nadie tocara nada.

En tablet y teléfono era peor: el selector vive dentro del desglose, que está
cerrado. Se facturaba sin ver que la venta iba a salir cobrada.

Cómo quedó: la factura nace SIN cobrar para todos; "Queda pendiente" es la
primera opción; y la barra de abajo dice siempre qué va a pasar ("Queda
pendiente de cobro" / "Se cobra ahora: SINPE Móvil"). Cobrar en el momento
sigue existiendo, pero hay que tocarlo.

**La regla:** lo que mueve plata o stock no se elige solo. Un valor por
omisión "razonable" para un comercio de mostrador es un error silencioso en
un negocio de ruta — y la pregunta "¿quién paga cuándo?" se contesta con los
datos (cuántos clientes de cada plazo), no con la intuición. Si una elección
tiene consecuencia, tiene que VERSE en la pantalla donde se confirma, en
todos los anchos.

## 2. Una suma que contaba lo anulado

Para corregir una factura cobrada por error hay que anular su cobro. No había
botón en ninguna pantalla (la ruta del servidor existía desde hacía semanas;
la noche del corte se hizo desde la consola del navegador). Y aunque se
anulara, la factura seguía bloqueada **para siempre**: la guarda que impide
editar o anular una factura cobrada sumaba todo `pago_factura`, y un cobro
anulado no se borra — queda en su tabla con `anulado = TRUE`. Lo mismo con
las notas de crédito anuladas.

La pantalla, que sí calcula bien (`cobrado` sale de `saldo.sql.js`), ofrecía
"Editar"; el servidor contestaba «tiene ₡X en cobros aplicados». Dos lugares
con la misma regla escrita dos veces, y una de las dos mal.

Cómo quedó: la guarda usa la misma condición que el saldo (cobros con
`anulado = FALSE`, notas que no estén anuladas); "Anular cobro" está en la
factura, para quien tiene el permiso `anular-cobro`, y avisa cuando el cobro
cubre varias facturas. La prueba va contra Postgres: con un doble, el SQL
malo pasaba igual.

**La regla:** en este sistema nada se borra, se anula. Entonces **toda suma
o conteo sobre cobros, notas, facturas o movimientos tiene que decir
"vigentes"**. Buscar `FROM pago_factura` (o la tabla que sea) sin su `JOIN`
al documento y su `anulado = FALSE` es la revisión que encuentra el próximo.

## 3. Lo demás que salió del mismo recorrido

Recorrer la pantalla entera en un navegador —vender, editar, anular, quedarse
sin señal, que el servidor rechace— encontró diez cosas más que ninguna
prueba veía. Las que dejan lección:

- **Un aviso se llevaba al siguiente.** Cada aviso programaba su propio
  "borrar en 3 s" y ese borrado quitaba el que estuviera, fuera el suyo o no:
  el motivo de un rechazo desaparecía en un segundo. Un solo reloj, y lo que
  explica por qué una factura NO se creó no se va solo.
- **La pantalla releía la cola antes de que la subida terminara.** Al volver
  la conexión arrancaban a subir el servicio y la pantalla a la vez; la
  segunda encontraba la bandera puesta, volvía con las manos vacías y
  mostraba como "pendiente" lo que ya estaba facturado. La pantalla ya no
  adivina cuándo terminó: el servicio avisa (`alSincronizar`).
- **Editar una factura borraba el detalle escrito en las otras líneas**
  ("ENTREGADO"), porque la copia de trabajo no lo traía y al guardar se
  reemplazan todas. Y el PDF no lo imprimía: la pantalla lo llama "Detalle en
  la factura" (287 líneas escritas a mano entre julio y octubre).
- **El papel no cerraba con la calculadora** cuando había descuento:
  "Subtotal 1.469 / Descuento −36 / IVA 191 / TOTAL 1.660". El subtotal ya
  traía el descuento restado. Ahora se informa ("Ya incluye ₡36 de
  descuento") sin volver a restarlo. De paso: las facturas copiadas de Alegra
  guardan el subtotal ANTES del descuento y las propias, DESPUÉS; para
  mostrarlo se saca del total.
- **En tablet no había cómo ver lo que esperaba subir.** El panel con la cola
  (motivo del rechazo, reintentar, descartar) era solo de teléfono.

La lección de método es la del corte, otra vez: 2.317 pruebas en verde y la
pantalla que más se usa cobraba sola. Las pruebas cuidan lo que alguien
pensó; el recorrido encuentra lo que nadie pensó. Se hace en una base
desechable (`tachi_ensayo_…`), con capturas, y contando lo que quedó en la
base después de cada paso.
