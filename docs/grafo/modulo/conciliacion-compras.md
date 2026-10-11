---
id: modulo/conciliacion-compras
tipo: modulo
titulo: Conciliación de compras — vínculos históricos y candidatos sin confirmar
estado: vigente
archivos:
  - backend/scripts/independencia/conciliar-compras.js
  - backend/scripts/independencia/lib/conciliacion-compras.js
  - backend/tests/conciliacionCompras.test.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea, tabla/facturas-proveedores]
  relacionado: [modulo/lectura-migracion-alegra, modulo/conciliacion-ventas, modulo/conciliacion-cobros, modulo/compras, modulo/reporte-contador, leccion/proveedor-por-cedula, leccion/ids-propios-y-de-alegra-no-se-mezclan, decision/el-total-manda-sobre-las-lineas]
  bloqueado_por: [bloqueo/xml-historico-sin-recuperar, bloqueo/impuestos-historicos-en-alegra]
medido: 2026-10-04
---

Avance de §15. Audita encabezados e importes agregados de compras: proveedor
por identificación, número, fecha, vencimiento, estado, moneda, total del
comprobante, cantidad de líneas e impuestos de las líneas. **No certifica
el detalle completo, XML, cartera de proveedores, pagos ni inventario.**
Los estados `open`/`closed` de Alegra son compra vigente; no se comparan como
saldo pagado o pendiente. `void` se compara con `anulada`.

IDENTIDAD EXPLÍCITA. Se obtiene `facturas_proveedores.alegra_bill_id` por el
FK real `compra.factura_proveedor_id`. Nunca por el serial de compra, nombre,
número suelto o total. Dos compras con el mismo id histórico son una
incidencia. En la copia inicial de esta entrega, **0 de 860 compras** tenían
ese vínculo: no clasificarlas como documentos nativos solo por su ausencia.
El antiguo `enviarFacturaAlegra` dejaba el id en logs, sin persistirlo en
ese campo; esta herramienta no reconstruye ni escribe el vínculo.

CANDIDATOS. Sin id explícito, la pareja **identificación del proveedor +
número exacto del comprobante** solo propone una revisión. Preserva ceros y
letras; en la identificación admite separadores habituales. No busca por
parecido ni escoge entre duplicados por fecha o monto. Un candidato único,
aunque no difiera en los campos comparados, **no cuenta como coincidente**.
El informe separa únicos y ambiguos; las compras sin vínculo siguen abiertas.
Tampoco deduce que un documento sin par se deba borrar o reimportar.

IMPUESTO DESCONOCIDO. Una línea con `tax: null` o ausente se consulta por su
ficha individual. El id y los encabezados deben seguir siendo los mismos.
Si tampoco informa los impuestos, queda como incidencia: no se inventa
cero, no se certifica el documento y el impuesto mensual queda `null`, con
el número de documentos incompletos. Un array vacío explícito sí representa
cero en este alcance. Impuestos múltiples se suman y redondean por línea,
como `compra_linea.impuesto NUMERIC(14,2)`, después se agregan en centavos.
No sustituye la tarifa del comprobante por la actual del producto.

LECTURA. La [lista oficial de compras](https://developer.alegra.com/reference/get_bills)
documenta fecha exacta y orden por fecha, sin un filtro de rango. Se lee
descendiendo por fecha, hasta cruzar el inicio o recibir una página vacía;
se valida orden, fechas e ids de toda la página. Una página corta no acaba
el barrido. Los ids explícitos locales ausentes se consultan con la
[ficha individual](https://developer.alegra.com/reference/get_bills-id), para
descubrir cambios de fecha fuera del tramo. Un 404 comprobado es diferencia;
403, error de red o ficha de otro id abortan. Reutiliza los reintentos GET
acotados del conciliador de cobros. Los GET no son una instantánea atómica:
repetir con Alegra congelado al preparar el corte.

La base completa se lee en una transacción **REPEATABLE READ READ ONLY**.
No importa el servidor, no arranca cron ni servicios salientes. No escribe
compras, impuestos, relaciones, numeradores ni meses del contador. No lee
el buzón ni usa sus llaves de escape.

Desde `backend` en la rama/base aisladas:

```sh
node scripts/independencia/conciliar-compras.js --desde=2025-07-01 --hasta=2026-10-04 --salida=/ruta/privada/compras.json
```

Archivo JSON nuevo fuera del repositorio, carpeta existente, modo `0600`;
no sobrescribe uno anterior. Contiene ids y datos de comprobantes; no se
comitea. Salida **0** sin diferencias dentro del alcance, **2** con
diferencias/incidencias/vínculos por confirmar, **1** lectura incompleta.
Un error retira el parcial y se muestra con mensaje controlado, sin volcar
configuración de red/base.

NO CONFUNDIR con `reconciliar-compras.js`: ese otro **escribe** desde XML
recuperados. Recuperar XML del buzón, resolver impuestos históricos y
reimportar meses entregados conservan sus decisiones existentes. El total
se toma del comprobante, no se reconstruye sumando líneas.

VERIFICACIÓN. Veinte pruebas: id explícito frente a serial propio, candidatos
únicos/ambiguos, números con ceros, vínculos repetidos, montos compensados,
monedas/estados separados, impuesto desconocido, redondeo por línea,
paginación, fechas cambiadas, 404/403 y CLI. PostgreSQL real sobre copia
desechable comprueba el FK al buzón con BEGIN/ROLLBACK, huellas de compras,
líneas, buzón, proveedores, contador y secuencias; el mismo lector rechaza
UPDATE. No usa Alegra real en las pruebas. Suite integrada sobre los retiros
de Claude (`31d4b82`): **1.725 aprobadas, cero fallos y ninguna omitida**.
El estado del corte sigue abierto.

MEDICIÓN REAL — 2026-10-04. Tramo 2025-07-01 a 2026-10-04, sobre una copia
desechable de la base local, sin modificar la compartida. El barrido GET
terminó al cruzar el inicio: **1.052 compras de Alegra en el tramo y 860
propias**. Ninguna propia tiene vínculo histórico explícito: **cero
documentos certificados**. Hay 745 candidatos únicos y 89 grupos ambiguos
(89 compras propias frente a 191 bills); 26 compras propias y 116 bills
quedan sin candidato en este tramo. Estas cifras no prueban faltantes ni
autorizarían una recarga o un vínculo automático.

Los 745 candidatos únicos presentan al menos un cambio: vencimiento en
745, total en 627, impuesto agregado en 253 y moneda en 5. Los campos se
superponen; no sumarlos como documentos. El envío histórico usaba la fecha
de emisión como vencimiento, y hay decisiones abiertas sobre impuestos y
XML; no corregir la compra propia para hacerla coincidir con Alegra. Las
31 compras de Alegra cuyo impuesto siguió sin informar aun leyendo su ficha
individual dejan el impuesto de sus grupos mensuales en `null`.

La lectura completa terminó con código **2**, informe privado
`/private/tmp/codex-compras-20261004/compras-historicas.json` (0600).
Huellas previas/posteriores de **14 tablas y las secuencias públicas
idénticas**, incluidos compras, buzón, proveedores, pagos de proveedores,
historiales, contador y series. El informe de avance registra la suite
integrada y la coordinación con Claude.
