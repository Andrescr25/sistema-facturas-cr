# Avance de independencia de Alegra — 2026-10-03

Estado de esa fecha. La continuación está en el
[informe del 2026-10-04](avance-independencia-2026-10-04.md): el vínculo
histórico del débito ya tiene modelo/cargador y las 27 notas coinciden en
la copia de prueba; el corte completo sigue pendiente.

La mayor parte de la operación ya tiene módulos propios en la rama
`independencia-alegra`. **Todavía no está lista para el corte completo:** la
copia está atrasada, falta conciliar el histórico, quedan dependencias del
buzón/catálogo antiguo y Hacienda e inventario siguen pospuestos.

Este es un estado de la rama de migración. Producción mantiene el sistema
híbrido. El detalle vigente está en el
[checklist](../checklist-independencia-alegra.md) y el
[grafo](../grafo/README.md); las mediciones antiguas se identifican como tales.

## Checklist revisado

**102 tareas principales marcadas y 33 abiertas, de 135.** Se cuentan solo
las filas principales `- [x]` / `- [ ]` de las secciones 0–16; no las pruebas,
hallazgos o subtareas explicativas. No es un porcentaje de preparación para
producción: inventario, Hacienda y el corte pesan mucho más que una fila de
documentación o un botón. Marcar un módulo significa que cumple el alcance
descrito, no que todas sus dependencias históricas desaparecieron.

| Área | Marcadas / abiertas | Estado y pendiente principal |
|---|---:|---|
| Base y aislamiento | 6 / 2 | Base separada, guardas y bitácora listas; queda completar formalmente el alcance transversal de acceso por entidad e ids propios. |
| Configuración | 7 / 0 | Datos, impuestos, métodos, cuentas y series propios. Los numeradores deben actualizarse al corte. |
| Productos | 10 / 3 | Maestro, edición, fotos y catálogos propios; quedan caché/sync antigua y datos incompletos. |
| Clientes | 8 / 1 | Fichas, validaciones, portal y relaciones propias; faltan datos pospuestos junto con Hacienda. |
| Proveedores | 3 / 1 | Maestro y mapeo propios; queda absorber la tabla antigua y sus consultas residuales. |
| Inventario | 0 / 9 | Pospuesto hasta el conteo físico: kardex, existencias y movimientos propios pendientes. |
| Facturación | 18 / 3 | Crear, editar, anular, notas, PDF y cola propios. Faltan correo con PDF, entrega real de WhatsApp y emisión electrónica. |
| Cobros y caja | 11 / 0 | Cobros, abonos, saldo calculado, caja y portal propios. El histórico se debe conciliar antes del corte. |
| Compras | 7 / 1 | Registro propio desde XML, costos/precios y gastos recurrentes; aceptación ante Hacienda pendiente. Persisten dependencias del buzón. |
| Pagos a proveedores | 6 / 0 | Egresos y caja propios; el histórico anterior conserva pendientes de detalle. |
| Cotizaciones | 2 / 0 | Propias y facturan en el sistema. |
| Bodega, impresión y faltantes | 7 / 0 | Terminada; usa factura/producto propios. |
| Portal y catálogos | 8 / 0 | Terminada; carrito, pedidos, historial, identidades y caché propios. |
| Reportes | 5 / 0 | Terminada; Inicio, Rentabilidad, Contador y faltantes con Excel. |
| Usuarios y permisos | 3 / 0 | Terminada por Claude; bitácora, módulos y acciones de administrador. Inventario se define cuando exista. |
| Migración y corte | 1 / 7 | Cargadores parciales y tres conciliadores disponibles; destino de una nota, recarga final, archivo de comprobantes, ensayo y plan de reversa pendientes. |
| Retiro de Alegra | 0 / 6 | Traductores del frontend, rutas/servicios, caché/sync y referencias históricas todavía pendientes de retirar. |

## Qué terminó Claude y cómo se combinó

Los últimos commits de permisos son `ab8ff90` y `09ffd18`. Solo un
administrador puede anular una factura, anular un cobro y reabrir caja.
Notas de crédito, edición de facturas y cierre de caja conservan el permiso
del módulo. Corrigió además la clasificación de rutas que permitía eludir
el guardián cambiando mayúsculas. Ese arreglo también está en `developer`
en `2d13222`; no se trasladó allí la migración completa.

Codex continuó la sección 15 con worktree y PostgreSQL desechables propios,
sin editar los archivos de permisos de Claude. La conciliación de ventas
previa está en `391973d`. Esta entrega agrega cobros, aplicaciones y saldo
actual; conserva las protecciones, no ejecuta cargadores, mensajes reales
ni limpieza semanal. Después agregó la auditoría individual de notas;
Claude abrió `tmp/claude-relacionar-20261003` para Relacionar Productos y
Codex conservó ese trabajo separado del suyo.

## Qué muestran los datos de septiembre

Medición de Alegra por GET y de una copia desechable de la base local. No
se modificó la base compartida para forzar coincidencias.

| Comparación | Resultado |
|---|---|
| Facturas de septiembre | 69 coinciden; **119 faltan en la copia**: 116 emitidas y 3 anuladas. |
| Total de ventas emitidas | Alegra ₡6.617.209; copia ₡1.967.390; diferencia **₡4.649.819**. |
| Cobros de septiembre | Alegra 212; **84 coinciden y 128 faltan en la copia**. |
| Importe de cobros importados | Alegra ₡7.186.057; copia ₡2.788.701; diferencia **₡4.397.356**. |
| Cobros nativos | 4 por ₡122.054,40, separados de la comparación con Alegra. |
| Saldo actual de 273 facturas del conjunto revisado | 89 coinciden, 5 no cobrables, 119 faltan y **60 presentes tienen saldo distinto**. |

Los saldos son **actuales**, también para facturas antiguas referidas por
cobros del mes; no son un cierre histórico al 30 de septiembre. Las 60
diferencias requieren revisar pagos, notas y operación nativa. El informe
no afirma que las 60 sean errores de la fórmula. No se midió aún toda la
cartera ni todos los meses. Ambos conciliadores señalan diferencias y la
fila de conciliación completa sigue abierta.

Los informes detallados contienen documentos de negocio y quedan privados,
fuera de git. Cómo ejecutarlos y su alcance:
[ventas](../grafo/modulo/conciliacion-ventas.md) y
[cobros](../grafo/modulo/conciliacion-cobros.md).

## Notas históricas: un destino que falta en el modelo

Se contrastaron por GET las notas de 2024-07-01 a 2026-10-03 con otra copia
PostgreSQL desechable. Las **27 existen** (26 emitidas y 1 anulada) y sus
encabezados y aplicaciones a facturas coinciden. El detalle refiere 24
facturas distintas, todas presentes en Alegra.

La consulta individual descubre que una nota aplicó **₡21.200 a una nota
de débito de ingreso**, un destino omitido por el listado y que la tabla
propia de aplicaciones no representa. Resultado completo: **26 coinciden
y 1 tiene ese destino faltante**. Hace falta incorporar ese documento y
su vínculo; ejecutar otra vez el cargador actual no lo resolvería. La
medición no demuestra dinero perdido ni autoriza inventar una factura.

Otra nota mantiene **₡8.600,20 disponibles** en ambos lados. Es una
observación separada que permite una copia coincidente. El informe final
devuelve 2 por el destino no representado y queda privado. Alcance y
relevo técnico: [nodo de notas](../grafo/modulo/conciliacion-notas-credito.md).

## Qué falta y qué conviene seguir

1. **Completar la conciliación:** representar el destino a nota de débito
   de ingreso identificado, otros meses de ventas/cobros, compras y
   existencias. Actualizar ventas/cobros en una copia
   separada y repetir para distinguir atraso de copia de discrepancias de
   negocio; verificar también numeradores. No refrescar la base de trabajo
   mientras otro agente la esté usando.
2. **Terminar las dependencias operativas:** Relacionar Productos/buzón aún
   usa ids de Alegra y el mapeo exige `alegra_item_id`. Después retirar
   consultas a tablas antiguas, traductores y rutas. Inventario mantiene
   parte de la caché/sync hasta que tenga existencias propias.
3. **Completar entregas y archivo:** conectar PDF por correo al SMTP ya
   existente, confirmar WhatsApp en el entorno habilitado y preservar los
   originales PDF/XML de los comprobantes de Alegra. No probar envíos reales
   desde la rama aislada.
4. **Resolver las dependencias pospuestas:** conteo físico para inventario;
   datos de clientes/productos, emisión electrónica y aceptación de compras
   junto con Hacienda. Recuperar XML histórico exige la decisión de leer el
   buzón. Las correcciones de comprobantes y meses ya entregados al contador
   requieren las decisiones existentes del usuario y su contador.
5. **Ensayar el corte:** copia fresca, migraciones en orden, recargas,
   conciliación, numeradores, archivos/fotos/sesión WhatsApp, ventana de
   congelamiento y reversa. Después retirar la dependencia de Alegra.

Se corrigieron además dos estados documentales atrasados: Compras ya no
depende de Alegra para el Reporte Contador ni para cotizaciones, y ya existe
un servicio SMTP; el envío del PDF de factura por correo sigue pendiente.

## Verificación de esta entrega

Cobros (`5d9cf76`), sobre `ab8ff90` y `09ffd18`: **1.684 pruebas aprobadas, ninguna
omitida**, con ejecución secuencial sobre una copia PostgreSQL desechable;
frontend compilado y grafo validado. Las pruebas de lectura comprobaron que
pagos, aplicaciones, facturas, notas y numeradores no cambian. Un fallo
simulado retira el informe incompleto y conserva informes anteriores.
La medición real devuelve código 2 por las diferencias encontradas. No hubo
cargas, cambios en datos compartidos, salidas reales ni limpieza semanal.

Notas: **1.705 pruebas aprobadas, ninguna omitida**, incluyendo 21 nuevas y
el grafo. La primera corrida tuvo el error interno recurrente del ejecutor
de Node 25.8.2 en `filtroPagosProveedores.test.js`; pasó aislado y la
repetición completa terminó sin fallos. Se verificaron huellas de notas,
enlaces, facturas, series y secuencias, y rechazo de UPDATE dentro del
lector READ ONLY. La CLI retira parciales y conserva informes previos.
Solo GET reales, sin cargadores ni cambios en la base compartida. No hubo
migraciones, instalaciones ni servidores nuevos; frontend sin cambios.
