---
id: modulo/conciliacion-cobros
tipo: modulo
titulo: Conciliación de cobros — recibos, aplicaciones y saldo actual sin modificar datos
estado: vigente
archivos:
  - backend/scripts/independencia/conciliar-cobros.js
  - backend/scripts/independencia/lib/conciliacion-cobros.js
  - backend/src/modules/facturacion/saldo.sql.js
  - backend/tests/conciliacionCobros.test.js
aristas:
  relacionado: [modulo/conciliacion-ventas, modulo/conciliacion-notas-credito, modulo/facturacion, modulo/portal-clientes, decision/caja-general-es-el-centro, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-10-03
---

Continúa la sección 15. Compara los cobros del tramo, incluidos anulados,
con sus aplicaciones a facturas. Después compara el **saldo actual** de las
facturas emitidas dentro del tramo o referidas por sus cobros (también las
emitidas antes). No es un saldo histórico al último día del período: incluye
los cobros y notas vigentes que existen hoy, aunque tengan otra fecha.

Desde `backend`, en la rama aislada:

```sh
node scripts/independencia/conciliar-cobros.js --desde=2026-09-01 --hasta=2026-09-30 --salida=/ruta/privada/cobros-septiembre.json
```

Fechas obligatorias e inclusivas. JSON fuera del repo, carpeta existente,
archivo nuevo `0600`; no sobrescribe informes. Código **0** sin diferencias
dentro del alcance, **2** con diferencias o incidencias, **1** si la lectura
no se completó. Retira el archivo incompleto y no imprime errores internos
que puedan contener configuración. No importa el servidor ni cargadores,
no arranca cron y no escribe a Alegra ni a PostgreSQL.

IDENTIDAD Y DESTINO. Une cobros por `pago.alegra_id`; compara monto, fecha,
número, anulación, cliente y cuenta por ids históricos y método normalizado.
Las aplicaciones se comparan por el **id de Alegra de la factura realmente
enlazada**, nunca por `factura_id` serial o número impreso. Un recibo con el
monto correcto aplicado a otra factura falla aunque la suma mensual dé igual.
El orden de las aplicaciones no importa. Un monto sin aplicar o excedido y
una aplicación sin factura propia se registran como incidencias, no se
corrigen. Los recibos nativos sin `alegra_id` se cuentan aparte.

LA MISMA FÓRMULA QUE EL MOSTRADOR. `saldo.sql.js` comparte `COBRADO` y
`ACREDITADO` con la consulta de facturas. La instantánea propia usa
`REPEATABLE READ READ ONLY`: total menos cobros vigentes y notas no anuladas,
limitado a cero. No usa `factura.saldo` ni `total_pagado` importados. El
detalle muestra cobrado, acreditado y cobros nativos para explicar diferencias
legítimas durante la operación en sombra. Anuladas y borradores no se cuentan
como deuda: los estados deben coincidir y se informan como no cobrables.

PERÍODO COMPLETO SIN FILTRO INVENTADO. La
[API oficial de pagos](https://developer.alegra.com/reference/get_payments-1)
documenta tipo, orden por fecha y consulta por ids, pero no rango de fechas.
Se lee `type=in`, fecha descendente y páginas de 10 hasta cruzar el inicio
del tramo o recibir una página vacía. Se valida el orden de todas las filas
y se aborta ante errores, formas inválidas o ids repetidos. Las páginas
cortas no terminan el barrido. Los ids locales ausentes se consultan aparte
en lotes de hasta 30 para detectar fechas movidas fuera del período.

Los errores transitorios de GET tienen como máximo tres intentos. Un timeout
de `/payments` reduce esa página a cinco recibos conservando el mismo offset;
un límite de peticiones respeta su `reset`. Un 403 o una respuesta inválida
no se reintenta ni se trata como página vacía. Esto se añadió después de un
timeout real en la página 9: el primer barrido retiró su archivo incompleto.

El saldo de una factura fuera del mes entra si la refiere un cobro del mes.
Se lee la foto local completa de recibos y encabezados de facturas (sin
datos personales) para conservar pares con fecha cambiada y todas las
aplicaciones. Los GET de Alegra son sucesivos; no tienen la atomicidad de
la base local. Repetir con el origen congelado antes de certificar el corte.

ALCANCE PENDIENTE. Solo CRC: `pago` no tiene moneda y una factura o recibo
extranjero impide certificar la comparación. Las aplicaciones de notas ya
tienen auditoría propia en [[modulo/conciliacion-notas-credito]], con un
destino a débito de ingreso pendiente de representar. Compras y existencias
siguen pendientes; la conciliación completa permanece abierta. No reimporta meses
del contador ni resuelve a mano cobros o notas para forzar un saldo igual.

VERIFICACIÓN. Casos sintéticos de colisión entre ambos espacios de ids,
recibo repartido, errores compensados, anulados, nativos, fechas cambiadas,
aplicaciones huérfanas, moneda desconocida, paginación fallida y una factura
anterior al mes. Con `PROBAR_BASE_LOCAL=1`, PostgreSQL verifica huellas de
pagos, aplicaciones, facturas, notas y numeradores, y la fórmula sobre un
cobro anulado real. La suite no consulta Alegra real.

Conjunto integrado sobre los permisos de Claude (`ab8ff90`, `09ffd18`):
**1.684 pruebas aprobadas, ninguna omitida**, con concurrencia 1 y la copia
PostgreSQL propia; frontend compilado. Las 18 pruebas nuevas cubren también
el retry de GET, la reducción de página al mismo offset y los límites de
peticiones. Se comprobó la CLI con un 403 simulado: retira el JSON parcial
y preserva un informe anterior. No se cambió Prisma ni se instalaron
dependencias; no se levantaron servidores ni se enviaron mensajes.

MEDICIÓN REAL (2026-10-03, copia desechable, septiembre). **212 cobros** en
Alegra, por ₡7.186.057; la copia tiene **84 importados**, por ₡2.788.701.
Los 84 coinciden en cabecera y destino; faltan **128**, por ₡4.397.356.
Hay **4 nativos**, por ₡122.054,40, separados de la comparación histórica.
No hubo incidencias de monto sin aplicar ni enlaces huérfanos en el tramo.

Saldo ACTUAL de **273 facturas** del conjunto descrito: 89 coinciden,
5 no cobrables omitidas, **119 faltan en la copia** y **60 presentes tienen
saldo distinto**. Estos últimos requieren revisar importación de cobros,
notas y operación nativa; no se clasificaron automáticamente como errores
del cálculo. El informe termina con código 2 y queda privado, fuera del
repo. No se ejecutaron cargadores ni se corrigieron saldos para hacerlos
coincidir. La revisión de todos los meses/cartera sigue pendiente.
