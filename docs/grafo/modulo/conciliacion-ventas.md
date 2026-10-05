---
id: modulo/conciliacion-ventas
tipo: modulo
titulo: Conciliación de ventas — compara la copia con Alegra sin modificar datos
estado: vigente
archivos:
  - backend/scripts/independencia/conciliar-ventas.js
  - backend/scripts/independencia/lib/conciliacion-ventas.js
  - backend/tests/conciliacionVentas.test.js
aristas:
  relacionado: [modulo/lectura-migracion-alegra, modulo/facturacion, modulo/conciliacion-cobros, modulo/conciliacion-notas-credito, modulo/conciliacion-compras, modulo/reporte-contador, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/un-borrador-no-es-una-venta, leccion/fecha-utc-costa-rica]
  bloqueado_por: [bloqueo/conteo-fisico, bloqueo/xml-historico-sin-recuperar]
medido: 2026-10-03
---

Avance de la sección 15. Auditoría puntual de **facturas, tiquetes y notas de
crédito**, con cantidades e importes por mes, tipo, estado y moneda, y con las
diferencias por documento y línea. La fila de conciliación completa del
checklist sigue pendiente: faltan completar otros períodos, compras y
existencias, y resolver las diferencias antes del corte.

Continuación del 2026-10-03: [[modulo/conciliacion-cobros]] ya compara
recibos, aplicaciones de cobros y saldo actual calculado. Este script de
ventas conserva su alcance. [[modulo/conciliacion-notas-credito]] ya compara
aplicaciones de notas; el destino a débito de ingreso encontrado quedó
representado por [[modulo/historico-debitos-ingreso]] desde la 040 (2026-10-04).
Usar los tres; compras, existencias y
resolución de diferencias siguen pendientes.
Desde 2026-10-04, [[modulo/conciliacion-compras]] añade la auditoría de
encabezados/importes agregados y los candidatos de compras sin vínculo
histórico. No certifica su detalle completo ni cierra la conciliación total.

Desde `backend`, en la rama aislada:

```sh
node scripts/independencia/conciliar-ventas.js --desde=2026-09-01 --hasta=2026-09-30 --salida=/ruta/privada/ventas-septiembre.json
```

Las fechas son inclusivas y obligatorias. La carpeta de salida debe existir;
el JSON se guarda fuera del repositorio con permisos `0600` y sin sobrescribir
un archivo anterior. Contiene números e ids de documentos de negocio: no se
comitea. El proceso termina con **0** si no hay diferencias dentro de este
alcance, **2** si las hay, y **1** si no pudo completar la lectura. Ante un
error retira el archivo incompleto; no inventa una conciliación vacía.

SOLO LECTURA. No importa `server.js`, no arranca cron ni servicios salientes,
no ejecuta cargadores. Usa el cliente aislado de Alegra exclusivamente para
GET. La base propia se lee en una transacción `REPEATABLE READ READ ONLY`;
PostgreSQL rechaza las escrituras. No cambia datos, saldos ni numeradores.
Los GET sucesivos de Alegra **no** son una instantánea transaccional: al
certificar el corte debe congelarse el origen y repetirse la comparación.

QUÉ SE COMPARA. Los documentos se unen por **`alegra_id`**, nunca por id
serial propio, nombre o número. Los nativos sin `alegra_id` se cuentan aparte
y no se reclaman como faltantes de Alegra. Se comparan fecha, estado, moneda,
tipo, numeración, marca electrónica, clave, anulación por nota, subtotal,
descuento, IVA y total. Las líneas se comparan por `numero_linea`: producto
histórico, CABYS, cantidad, precio, descuento, tarifa, IVA y total, con la
precisión de las columnas SQL. Los importes se suman en centavos enteros.
Una suma mensual igual no oculta documentos faltantes ni errores por línea.

Los borradores y anuladas tienen sus propios grupos; no se suman como venta
emitida. Las notas se muestran aparte, con su signo original, sin restarlas
dos veces. `nota_credito` aún no guarda moneda: una nota extranjera o una
línea con múltiples impuestos impide certificar la copia actual. Tampoco se
convierten estados desconocidos o totales ausentes en valores por defecto.

LECTURA COMPLETA. Cada listado sigue hasta una página vacía; una página
corta no termina el barrido. Respuestas inválidas, errores e ids duplicados
abortan. Si una factura importada falta en el tramo de Alegra, se consulta
por su id para descubrir cambios de fecha fuera del período. La consulta de
la base también incluye los pares de Alegra aunque su fecha local esté
fuera del tramo. No se pierde una diferencia por filtrar antes de emparejar.

La API oficial de [facturas](https://developer.alegra.com/reference/get_invoices)
documenta `date_afterOrNow` y `date_beforeOrNow` inclusivos, orden por id y
consulta por lotes de hasta 30 ids. La de
[notas](https://developer.alegra.com/reference/get_credit-notes) solo documenta
fecha exacta: se recorre su historial completo y se filtra al comparar.

NO CONFUNDIR con `reconciliar-compras.js`: ese otro script **escribe** compras
desde XML recuperados. Esta conciliación no reimporta meses del contador ni
corrige los impuestos históricos; esos trabajos requieren sus decisiones.

VERIFICACIÓN. La suite cubre errores compensados en un total mensual,
documentos nativos, colisión entre los dos espacios de ids, cambios de fecha
fuera del tramo, estados/monedas separados, errores por línea, centavos y
paginación fallida. Con `PROBAR_BASE_LOCAL=1` verifica PostgreSQL sobre una
copia desechable, incluyendo huellas de tablas y rechazo de UPDATE dentro
de READ ONLY. No usa Alegra real durante `npm test`.

Suite final: 1.651 pruebas aprobadas, ninguna omitida, con
`--test-concurrency=1` y la copia desechable. Una corrida con concurrencia 2
tuvo un error interno de Node 25.8.2 (`Unable to deserialize cloned data`)
en `filtroPagosProveedores.test.js`; esa prueba pasó después aislada, junto
con las 16 nuevas. No se cambió esa prueba ni el ejecutor de Node.

MEDICIÓN REAL (2026-10-03, copia desechable de la base local; período
2026-09-01 a 2026-09-30). Alegra devolvió 188 facturas: 180 emitidas y 8
anuladas. La copia tiene 69: 64 emitidas y 5 anuladas. **69 coinciden,
119 faltan (116 emitidas + 3 anuladas)**; ninguna de las presentes difiere
en los campos/líneas comparados. Emitidas: Alegra ₡6.617.209 y copia
₡1.967.390, diferencia ₡4.649.819. No hubo notas de crédito de septiembre.
El código de salida fue 2. Informe privado fuera del repositorio, `0600`.
La medición registra el atraso: no se corrió ninguna carga ni se corrigió
la base compartida. Hay que recargar y repetir al preparar el corte.
