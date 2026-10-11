---
id: leccion/un-borrador-no-es-una-venta
tipo: leccion
titulo: Un borrador no es una venta — el historial contaba 24 borradores y 132 anuladas
estado: vigente
archivos:
  - backend/src/modules/catalogo-agente/catalogo-agente.service.js
  - backend/tests/rotacionVentas.test.js
aristas:
  relacionado: [tabla/venta-linea, tabla/venta-historico, modulo/rentabilidad]
medido: 2026-10-03
---

`GET /invoices` de Alegra devuelve TODO: emitidas, borradores (`draft`) y
anuladas (`void`, o `isVoidedByCreditNote`). La sincronización del historial
solo descartaba las anuladas por nota de crédito.

Se encontró al rehacer Rentabilidad (2026-09-25), porque el total histórico
no cerraba: de ₡491,6 millones, ₡294,9 eran 24 BORRADORES —cuatro del
5 de noviembre de 2024 con 42.057 tomacorrientes cada uno, un error de
digitación que nunca se facturó— y ₡2,7 eran 132 anuladas. El 60 % de la
plata del historial no era venta. De ahí salen la rotación, las estadísticas
y "lo que suele comprar" cada cliente, así que un solo borrador así pone a un
producto de rotación C en la A.

Ahora `esVenta` deja fuera `draft`, `void` y `isVoidedByCreditNote`, y
`lineasDeFactura` devuelve esas facturas SIN líneas, para que la
reconciliación borre lo que hubiera quedado de ellas. Solo se limpia lo que
se vuelve a leer, así que el mismo 2026-09-25 se releyó el historial entero
(con autorización y respaldo previo): salieron 162 facturas y ₡297,8
millones; 2024 pasó de ₡348 a ₡52 millones. Entre ellas había 5 anuladas por
nota de crédito DESPUÉS de entrar como venta: es el caso que cubre el repaso
diario de 60 días. Un repaso así se hace por tramos (`desde`/`hasta`): de un
tirón son ~185 páginas y un corte de internet obliga a empezar de nuevo.

La lección de método: una suma que "se ve grande" no se discute, se desarma
por factura. Ordenar por `cantidad × precio` descendente y mirar las cinco de
arriba lo mostró en un minuto.

EN ESTA RAMA la regla la cumple la vista [[tabla/venta-linea]]
(`WHERE f.estado = 'emitida'`), no una sincronización: no hay nada que
releer ni que limpiar. `esVenta` y `lineasDeFactura` se retiraron con el
historial (2026-10-03).
