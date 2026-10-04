# Avance de independencia de Alegra — 2026-10-04

Se completó el vínculo histórico de ₡21.200 que faltaba al conciliar las
notas de crédito. La copia local de independencia ahora devuelve **27 notas
coincidentes y cero incidencias** dentro de ese alcance. El corte completo
sigue abierto.
El [checklist](../checklist-independencia-alegra.md) y el
[grafo](../grafo/README.md) describen el estado vigente.

## Qué cambió en este avance

La migración **040** crea un archivo propio para el débito de ingreso, con
el objeto GET íntegro, y una tabla de créditos vinculados mediante los dos
ids propios. Tiene su identidad separada de factura, incluso si los números
o ids externos coinciden. No añade ventas, deuda del mostrador ni numeradores.

`cargar-debitos-ingreso.js` completa el archivo y el vínculo sobre una nota
ya copiada, **sin reimportar su cabecera o líneas**. El cargador completo
de notas también incorpora esos destinos y confirma series/documentos en
la misma transacción. Ambos siguen leyendo Alegra por GET y usan el guardián
de la base aislada. La copia repetida conserva contenido, ids y timestamps.

Medición real sobre copia desechable y después en la copia local: un débito
por ₡21.200, de 2025-02-11,
totalmente acreditado. Su objeto archivado coincide con el GET original,
incluidas líneas y referencias. Se revisaron las 27 notas, sus 24 facturas
destinatarias y el débito; código 0. Los **₡8.600,20 aún sin aplicar** de
otra nota permanecen como observación, no se inventó una aplicación.

El archivo histórico no es emisión propia de débitos, cierre de cartera
ni descarga de PDF/XML electrónicos. Alcance y comandos en
[el nodo de débitos históricos](../grafo/modulo/historico-debitos-ingreso.md).

## Coordinación con Claude

Claude terminó Relacionar Productos (`59a838e`, `569529d`) y crear producto
desde una línea del proveedor (`27b46d5`, `7a1fb2f`). También implementó la
decisión delegada de recalcular el avance de la factura desde sus líneas
(039). Terminó Revisión de Precios (`2874c37`, `3d777a4`): la pantalla lee
el maestro propio y la compra usa el producto de la línea. Codex integró
este avance sobre esos commits, usando worktree y PostgreSQL propios para
la 040, sin editar esos módulos.

Durante este avance, Claude usó `tmp/claude-buzon-20261004` para el buzón
de compras y lo completó (`0ae7f3b`, `1242f81`). Integró y subió esos cambios
sobre el débito de Codex (`91fc635`), sin conflictos: **§8 completa**.
Los dos worktrees temporales ya se retiraron. También corrigió el precio
sugerido en `developer/main` (`c469365`, `8d2c073`); Codex no modificó esas
ramas. Volver a revisar commits y worktrees antes de elegir otra tarea.

## Estado del checklist

Las secciones 0–16 tienen **107 tareas principales marcadas y 32 abiertas**.
Compras (§8) ya quedó completa; el débito completa un tramo de §15 y no
cierra la conciliación total. Esa cuenta no mide la preparación para
producción. §§11–14 siguen terminadas.

## Qué sigue pendiente

- Completar los períodos de ventas/cobros, compras y existencias, resolver
  diferencias, recargar y comprobar numeradores al preparar el corte. El
  diagnóstico de septiembre del [informe anterior](avance-independencia-2026-10-03.md)
  sigue identificado como medición anterior; este trabajo no lo recarga.
- Retirar la caché y los caminos antiguos de Compras sin pantalla,
  sincronizaciones, traductores y rutas antiguas en el orden del checklist.
- Guardar PDF/XML originales, completar correo con PDF y verificar la
  recepción real de WhatsApp en su entorno autorizado.
- Hacienda, aceptación electrónica y correcciones de datos se mantienen
  pospuestos con las decisiones existentes; inventario espera el conteo.
- Ensayar el corte completo y documentar congelamiento y reversa.

## Verificación

PostgreSQL desechable: repetición y dos cargas concurrentes, rollback después
de modificar el archivo y antes de guardar el vínculo, UNIQUE/monto positivo,
notas nativas conservadas y recarga completa. Huellas de facturas, pagos y
créditos a facturas sin cambios. Hay ocho pruebas nuevas del archivo y dos
casos adicionales del conciliador; la suite no consulta Alegra real.

Suite integrada sobre `3d777a4`: **1.768 pruebas aprobadas, cero fallos y
ninguna omitida**. Tras conservar en la salida del cargador el próximo
número de cada serie, pasaron las **43 comprobaciones dirigidas**, incluido
el grafo. El frontend compiló; esta entrega no cambia su código.

Aplicación local: respaldo completo antes de aplicar **solo la 040** y
ejecutar la carga puntual. Quedaron un documento archivado íntegro y una
aplicación por ₡21.200. Huellas anteriores/posteriores de ocho tablas
(facturas y líneas, pagos y aplicaciones, créditos y líneas/destinos a
facturas, series), más las secuencias anteriores, **idénticas**. Se verificó
otra vez el objeto archivado contra el GET original y la conciliación
terminó con código 0. No se ejecutó la recarga completa de notas.

Detalle, respaldo e informes privados fuera de git en
`/private/tmp/codex-debitos-20261004`, archivos modo `0600`.
