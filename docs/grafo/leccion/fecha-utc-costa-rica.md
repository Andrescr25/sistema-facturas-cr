---
id: leccion/fecha-utc-costa-rica
tipo: leccion
titulo: El día del calendario no se saca con toISOString() — después de las 6 p.m. da mañana
estado: vigente
archivos:
  - backend/src/utils/fechaCR.js
  - backend/tests/fechaCR.test.js
  - backend/tests/horaEnvioImpresion.test.js
aristas:
  relacionado: [leccion/la-db-local-es-produccion, decision/rotacion-por-cliente-sin-ciclos]
medido: 2026-10-13
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

LA MISMA TRAMPA EN SQL (2026-10-01). Producción usa el pooler de Supabase en
modo transacción (puerto 6543): el `SET TIME ZONE 'America/Costa_Rica'` que
`config/database.js` hace al abrir cada conexión NO queda pegado a la sesión
del servidor. Medido: 1 de cada 5 consultas corre en UTC. En una columna
`timestamp` SIN zona, `CURRENT_TIMESTAMP`/`now()` guardan entonces la hora
6 horas adelantada en esas consultas — y `CURRENT_DATE` da mañana después de
las 6 p.m. Se vio en la nota "En impresión" del Reporte de Clientes: una
factura enviada a las 11:25 decía 17:25. Escribir con `AHORA_CR_SQL`
(`now() AT TIME ZONE 'America/Costa_Rica'`, en `utils/fechaCR.js`), que da la
hora de Costa Rica en cualquier sesión. Un `Date` de JavaScript pasado como
parámetro sí llega bien. EN ESTA RAMA ya lo usan la cola de impresión, el
despacho de Bodega, los faltantes y sus ajustes (sección 11); quedan otras
columnas escritas con `CURRENT_TIMESTAMP` (bitácoras, compras, cobros): mismo
riesgo el día del corte, cuando la rama corra sobre ese pooler.

2026-10-13. `utils/fechaCR.js` tiene además `diaDeBase` (leer una columna
DATE tal como la entrega el driver: un Date a la medianoche local, que no es
ni un texto ni un instante), `sumarDias` y `diasEntre`: sumar y restar días
de calendario trabajando en UTC de punta a punta. `sumarDias` estaba dentro
de `facturaPropia.service.js`; se mudó acá para que el vencimiento de una
factura y la próxima visita de un cliente
([[decision/rotacion-por-cliente-sin-ciclos]]) usen la misma cuenta.

