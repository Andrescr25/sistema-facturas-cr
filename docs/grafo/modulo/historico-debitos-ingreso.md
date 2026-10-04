---
id: modulo/historico-debitos-ingreso
tipo: modulo
titulo: Débitos históricos — documento original y créditos con destino propio
estado: vigente
archivos:
  - backend/migrations/independencia/040_debitos_ingreso_historicos.sql
  - backend/scripts/independencia/cargar-debitos-ingreso.js
  - backend/scripts/independencia/lib/historico-debitos-ingreso.js
  - backend/scripts/independencia/cargar-notas-credito.js
  - backend/tests/historicoDebitosIngreso.test.js
aristas:
  relacionado: [modulo/conciliacion-notas-credito, modulo/facturacion, modulo/conciliacion-ventas, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica, bloqueo/prisma-no-se-regenera]
medido: 2026-10-04
---

Resuelve el destino que faltaba en §15: la nota de crédito histórica
aplica ₡21.200 a un **débito de ingreso**, no a una factura. Ambas clases
pueden tener el mismo id externo, número o serial propio. Guardarlo como
factura habría alterado cartera, ventas y numeradores.

MODELO. `debito_ingreso_historico` conserva un id propio, `alegra_id` único,
fecha, estado, moneda, importes y **el objeto GET completo en JSONB**:
líneas, impuestos, referencias, cliente y datos de emisión. El crédito se
enlaza mediante `nota_credito_debito_ingreso` con los dos FKs propios y el
monto; es otra tabla distinta de las aplicaciones a facturas. Hay UNIQUE
por pareja, monto positivo y FK al documento histórico. Las fechas de
auditoría SQL usan Costa Rica explícitamente.

ALCANCE. Es un archivo histórico consultable por SQL y por el conciliador,
no una pantalla o un emisor de débitos propios. No suma una deuda nueva,
movimientos de caja, stock ni ventas. `balance` y `totalPaid` quedan en el
JSON como foto del origen; no determinan el saldo del mostrador. Tampoco
sustituye los PDF/XML originales pendientes de descargar ni reimporta un
mes entregado al contador. La emisión electrónica sigue pospuesta.

DOS CAMINOS. Aplicar primero la **040** por SQL, siempre en la rama/base
aisladas. Para completar este destino cuando las notas ya están copiadas:

```sh
node scripts/independencia/cargar-debitos-ingreso.js
```

Solo GET a Alegra y escritura local. **No vuelve a cargar las cabeceras ni
líneas de crédito.** Exige que la nota local exista y que coincidan fecha,
estado, total y aplicado declarado. Si difieren, revierte; hay que revisar
la copia, no forzar una coincidencia. Conserva las notas nativas.

`cargar-notas-credito.js` ya incorpora el mismo archivo y los enlaces al
recargar el histórico completo. Conserva las aplicaciones a facturas y
usa sus ids propios. El detalle de cada nota, los débitos y el avance de
series (`GREATEST`) se guardan en **una sola transacción**. Un GET fallido,
detalle incompleto, débito ausente/extranjero o monto excedido detiene la
carga antes de escribir. Los meses entregados requieren las decisiones
existentes; para el caso puntual usar el primer camino.

REPETIR Y COORDINAR. La copia idéntica conserva filas, ids, fechas de
auditoría y secuencias de estas dos tablas. Un candado PostgreSQL común
serializa ambos cargadores; evita que dos invocaciones simultáneas dupliquen
el destino o tomen los bloqueos en orden contrario. Reemplaza solo los
enlaces de las notas importadas que leyó y validó. No elimina documentos
históricos que luego falten en Alegra: los conserva para investigar.

ORIGEN. Se recorre el
[listado oficial de débitos](https://developer.alegra.com/reference/get_income-debit-notes)
hasta una página vacía; no se inventa filtro por ids ni por rango de fechas.
El listado de notas de crédito puede omitir `incomeDebitNotes`; se completa
con la ficha individual usando la misma función que el auditor. Los errores
se muestran con mensajes controlados, sin volcar configuración interna.

VERIFICACIÓN (2026-10-04). En una copia desechable propia, se copió el único
débito de esta cuenta: **₡21.200, 2025-02-11**, totalmente acreditado. Su JSON
coincide con el GET previo, incluyendo líneas y referencias. Después el
conciliador verificó **27 notas coincidentes, cero diferencias/incidencias**,
24 facturas y 1 débito destinatarios presentes. El crédito disponible de
₡8.600,20 sigue como observación en ambos lados. Salida 0 dentro del alcance.

APLICACIÓN LOCAL (2026-10-04). Después de las pruebas, se respaldó la base
compartida de independencia, se aplicó solo la 040 y se ejecutó la carga
puntual: un archivo y un enlace, conservando el JSON íntegro. La conciliación
en esa base también devolvió 27 coincidentes y cero incidencias. Las huellas
de las ocho tablas anteriores de facturación/cobros/créditos/series y sus
secuencias no cambiaron. No se refrescó la base ni se recargaron notas.

Pruebas con PostgreSQL: copia repetida y concurrente sin churn, rollback
después de actualizar el archivo y antes de guardar el destino, restricciones
de unicidad/monto, conservación de notas nativas y recarga completa. Huellas
de facturas, pagos y aplicaciones a facturas sin cambios. Las ocho pruebas
nuevas y dos casos adicionales del auditor no usan Alegra real. Las pruebas
que escriben siempre corren en una copia desechable; no refrescar la base
compartida mientras otro agente trabaja.

Suite integrada sobre el avance de Compras de Claude (`3d777a4`): **1.768
pruebas aprobadas, ninguna omitida**. Después del último ajuste de la salida
de series del cargador, 43 comprobaciones dirigidas aprobadas, incluido el
grafo. Frontend compilado. Informes y respaldo privados fuera de git;
estado y pendientes en `docs/informes/avance-independencia-2026-10-04.md`.
