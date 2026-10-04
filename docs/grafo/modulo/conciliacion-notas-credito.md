---
id: modulo/conciliacion-notas-credito
tipo: modulo
titulo: Conciliación de notas — cada aplicación a factura o débito histórico
estado: vigente
archivos:
  - backend/scripts/independencia/conciliar-notas-credito.js
  - backend/scripts/independencia/lib/conciliacion-notas-credito.js
  - backend/tests/conciliacionNotasCredito.test.js
  - backend/src/modules/facturacion/notaDesdeAlegra.js
  - backend/migrations/independencia/010_nota_credito.sql
  - backend/migrations/independencia/040_debitos_ingreso_historicos.sql
aristas:
  relacionado: [modulo/facturacion, modulo/historico-debitos-ingreso, modulo/conciliacion-ventas, modulo/conciliacion-cobros, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica]
medido: 2026-10-04
---

Continúa §15. Compara las **aplicaciones actuales** de notas fechadas en un
tramo, incluidos sus pares cuya fecha cambió fuera del tramo. Las notas
nativas se muestran aparte. Los documentos, estados y líneas completos se
auditan con [[modulo/conciliacion-ventas]]; el saldo actual de las facturas
con [[modulo/conciliacion-cobros]]. Los tres alcances se complementan.

Desde la 040 también compara el crédito a `debito_ingreso_historico` por
su id de Alegra, con un FK propio separado del de factura. El JSON del
informe pasa a **versión 2**. Requiere esa migración aplicada: no inventa
una copia vacía si falta la tabla. [[modulo/historico-debitos-ingreso]]
describe la carga independiente que conserva cabeceras/líneas de crédito.

Desde `backend`, con el aislamiento conservado:

```sh
node scripts/independencia/conciliar-notas-credito.js --desde=2024-07-01 --hasta=2026-10-03 --salida=/ruta/privada/notas-historicas.json
```

Fechas inclusivas obligatorias. JSON nuevo fuera del repo, carpeta existente
y modo `0600`; no sobrescribe informes. Código **0** sin diferencias ni
incidencias dentro del alcance, **2** con ellas, **1** lectura incompleta.
Ante un fallo retira el parcial; nunca lo convierte en una lista vacía. No
importa servidor ni cargadores, no arranca cron ni servicios salientes y no
escribe a Alegra o PostgreSQL. La base usa `REPEATABLE READ READ ONLY`.

IDENTIDAD. Empareja por `nota_credito.alegra_id`. El destino se obtiene del
**FK real** `nota_credito_factura.factura_id → factura.alegra_id`, nunca de
`factura_numero`, nombres ni coincidencias entre seriales. Compara fecha,
estado, número, total, aplicado declarado y monto de cada factura. El orden
del detalle no importa. Una suma mensual igual no tapa destinos distintos.
Enlaces nulos, aplicación importada a una factura nativa y excesos se
señalan; las notas nativas sí pueden acreditar facturas nativas.

CRÉDITO DISPONIBLE. Que el total no esté aplicado por completo puede ser
legítimo: se registra como observación y no impide una copia coincidente.
En cambio, `total_aplicado` sin aplicaciones individuales de respaldo es
una incidencia, aunque ambas fuentes tengan ese mismo encabezado. No usa
el `saldo` histórico guardado ni modifica la regla de saldo del mostrador.
Anuladas y borradores conservan grupos propios; no netea dos veces las notas.

EL LISTADO PUEDE OMITIR OTRO DESTINO. La
[API de listado](https://developer.alegra.com/reference/get_credit-notes)
solo documenta fecha exacta; se lee hasta una página vacía y se filtra
después de emparejar. Si el aplicado declarado supera el detalle recibido,
se consulta la [ficha individual](https://developer.alegra.com/reference/get_credit-notes-id).
Se valida id y encabezado para abortar si cambió entre las lecturas.
Errores de acceso, respuestas inválidas o ids repetidos abortan; GET
transitorios tienen los reintentos acotados del conciliador de cobros.

MEDICIÓN REAL (2026-10-03, copia desechable; 2024-07-01 a 2026-10-03).
Las 27 notas existen en ambas fuentes: 26 emitidas y 1 anulada. Sus
encabezados y aplicaciones a facturas coinciden; las 24 facturas distintas
referidas por ese detalle existen en Alegra. **Una nota aplica ₡21.200 a
una nota de débito de ingreso**: `incomeDebitNotes` aparece en la ficha
individual, pero no en el listado. `nota_credito_factura` solo representa
facturas; el cargador actual no guarda ese otro destino. El informe final
señala **26 coincidentes y 1 con destino no representado**, más la falta de
respaldo individual de ese aplicado en la copia. No es plata perdida ni
una factura que se deba inventar para cuadrar. Otra nota tiene **₡8.600,20
sin aplicar** en ambas fuentes: observación separada. Salida 2.

RESUELTO EN LA COPIA DE PRUEBA Y LOCAL (2026-10-04). La 040 y el cargador de
[[modulo/historico-debitos-ingreso]] incorporan ese documento y su vínculo.
Nueva medición 2024-07-01 a 2026-10-04: **27 coincidentes, cero incidencias**,
24 facturas y 1 débito destinatarios presentes. Los ₡8.600,20 disponibles
permanecen como observación, sin forzar aplicaciones. Salida 0. El cargador
completo de notas también conserva este destino en futuras recargas.
La aplicación puntual en la base local compartida conservó cabeceras y
líneas de crédito; sus huellas, facturas, pagos, series y secuencias previas
no cambiaron. Se hizo respaldo antes de aplicar la migración.

ALCANCE DEL DÉBITO. Verifica identidad, monto enlazado, moneda y existencia
del destino; no certifica su cartera, sus cobros ni su emisión propia. El
archivo completo se comprobó contra el GET en esta entrega; no se comparan
sus líneas financieras como facturas dentro de este conciliador. Compras,
existencias, otros períodos y resolución de diferencias siguen pendientes.
El detalle con ids/números queda privado fuera de git.

Solo CRC: una nota extranjera o una factura destino extranjera aborta;
`nota_credito` aún no guarda moneda. No certifica cierre histórico, cartera
completa, compras ni existencias. No reimporta meses entregados al contador
ni corrige impuestos históricos. Las lecturas GET de Alegra no son una
instantánea transaccional.

VERIFICACIÓN INICIAL (2026-10-03). 21 pruebas nuevas: reparto con montos intercambiados, colisión
de ids, enlaces perdidos, nativos, crédito disponible, fecha cambiada,
anuladas/borradores, desbordes, errores de lectura y detalle individual con
otro destino. PostgreSQL real comprueba huellas de notas, aplicaciones,
facturas, series y secuencias; dentro del mismo lector rechaza UPDATE.
CLI: fallo simulado retira el parcial y preserva un informe anterior.

Suite completa final: **1.705 aprobadas, ninguna omitida**, con concurrencia
1 en la copia desechable; grafo validado. La primera corrida encontró el
error interno ya observado de Node 25.8.2 (`Unable to deserialize cloned
data`) en `filtroPagosProveedores.test.js`. Sus 10 pruebas pasaron aisladas y
la repetición completa terminó sin fallos. No se modificó ese test ni Node.
Sin frontend modificado, instalaciones, migraciones ni servidores nuevos.

CONTINUACIÓN (2026-10-04). Dos casos adicionales del conciliador cubren el
destino de débito con su FK propio y su ausencia; ocho pruebas del archivo
comprueban copia, concurrencia, rollback y recarga completa. Suite integrada:
**1.768 aprobadas, ninguna omitida**; frontend compilado. Migración 040
probada en base desechable y aplicada luego solo a la copia local de
independencia. Detalle en [[modulo/historico-debitos-ingreso]].
