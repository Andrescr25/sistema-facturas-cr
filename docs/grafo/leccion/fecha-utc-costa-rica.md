---
id: leccion/fecha-utc-costa-rica
tipo: leccion
titulo: El día del calendario no se saca con toISOString() — después de las 6 p.m. da mañana
estado: vigente
archivos:
  - backend/src/utils/fechaCR.js
  - backend/tests/fechaCR.test.js
aristas:
  relacionado: [leccion/la-db-local-es-produccion]
medido: 2026-09-23
---

`new Date().toISOString().slice(0, 10)` da el día en UTC. Costa Rica es
UTC−6: desde las 6 de la tarde ese valor ya es el día siguiente, y acá se
trabaja de noche. Estaba en cuatro lugares de producción: la fecha del abono
que se manda a Alegra (un pago del viernes a las 7 p.m. quedaba del sábado, y
con él el cierre del día), la fecha de la factura que sale de una cotización,
el vencimiento de una cotización y los ajustes de inventario.

Para un DÍA del calendario: `hoyEnCostaRica()` / `diaEnCostaRica(momento)` de
`utils/fechaCR.js`, que nombran la zona en vez de confiar en la del servidor
(Render, scripts y pruebas no siempre tienen `TZ`). Un timestamp completo es
un instante y está bien; el error es recortarlo a un día.
`tests/fechaCR.test.js` recorre `src/` y falla si el patrón vuelve.

La lección de método: esto no lo encontró una revisión, lo encontró la suite
corriendo a las 19:21. Cuando una prueba falla "sin que nadie tocara nada",
el primer sospechoso no es la prueba.
