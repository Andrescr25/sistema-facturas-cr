---
id: modulo/demo-reporte-proveedores
tipo: modulo
titulo: Demostración local de Reporte de Proveedores — retirada tras la revisión
estado: vigente
archivos:
  - backend/scripts/independencia/demo-reporte-proveedores.js
  - backend/tests/demoReporteProveedores.test.js
  - frontend/src/pages/ReporteProveedores.jsx
aristas:
  relacionado: [modulo/faltantes, modulo/exportaciones-reportes, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica, leccion/la-db-local-es-produccion]
medido: 2026-10-04
---

RETIRADA COMPLETA, 2026-10-04. El usuario terminó la revisión y pidió
eliminar los datos demo. Se retiraron por su manifiesto privado: dos
proveedores, cinco productos/mapeos, faltantes, líneas y los dos borradores.
Durante su recorrido había quitado una línea y enviado un borrador a
Impresión: la retirada incluye exclusivamente esa fila por su
`factura_propia_id`, sin limpiar la cola de otras facturas. El primer intento
se revirtió entero por ese FK; después se amplió la retirada puntual.

EVIDENCIA POSTERIOR. Cero facturas, líneas, faltantes, filas de Impresión,
productos, proveedores o mapeos del manifiesto. Las huellas de las nueve
tablas anteriores a la inserción son idénticas y `serie_consecutivo` sigue
igual. No se retrocedieron secuencias, no se refrescó la base compartida,
no se ejecutó la limpieza semanal ni se tocó producción. La autorización
actual reemplaza el pedido anterior de conservar la demostración.
**No volver a insertarla salvo nuevo pedido del usuario.**

EJEMPLO HISTÓRICO. `ZZ-DEMO Distribuidora Norte [PRUEBA]` tuvo tres productos
y 22 unidades; `ZZ-DEMO Ferretería Sur [PRUEBA]`, dos y 5: cinco productos,
27 unidades. Las fichas no tenían teléfonos ni correos reales; ids propios,
identificación extranjera y `alegra_item_id=''`, sin fichas externas.

RESPALDO DEL REPORTE. Cinco faltantes pendientes, cinco líneas con notas y
dos **borradores** ficticios `ZZ-DEMO-PROV-FACT-1/2`, sin serie, consecutivo,
emisión, clave de Hacienda, cliente real, cobro ni inventario. El reporte
requiere el FK a una factura propia; esos borradores sostienen el ejemplo
y no cuentan como ventas emitidas ni deuda. Es demostración de la orden
del proveedor, no emisión electrónica ni ensayo de corte o de Impresión.

RECORRIDO. Abrir Norte, leer las notas, editar cantidades y guardar,
generar el PDF, agregar un producto o seleccionar para reasignar a Sur.
En Fichas se pueden buscar ambos proveedores. El Excel conserva los
faltantes originales; el PDF usa las cantidades de la orden. WhatsApp
conserva el bloqueo de salida de la rama; no se mandan mensajes de prueba.

SCRIPT MANUAL REUTILIZABLE, solo con un nuevo pedido, desde `backend` de independencia:

```sh
node scripts/independencia/demo-reporte-proveedores.js crear /ruta/privada/manifiesto.json
```

Exige conexión realmente local y salidas bloqueadas, incluso si existen
llaves de escape; no corre dentro del test runner. No importa el servidor,
cron ni servicios salientes. La transacción tiene un bloqueo propio para
evitar dos creaciones concurrentes; rechaza una demostración existente.
Reserva el manifiesto fuera del repositorio con `wx`, modo 0600, escribe y
sincroniza antes de COMMIT. Si falla antes de intentar confirmar, revierte
los datos y retira el parcial. Si se intentó COMMIT y se perdió su respuesta,
conserva el manifiesto para revisar el resultado sin perder los ids.
La fecha de negocio sale de `hoyEnCostaRica`.

RETIRADA PUNTUAL con su manifiesto (ya ejecutada para este conjunto):

```sh
node scripts/independencia/demo-reporte-proveedores.js retirar /private/tmp/codex-demo-proveedores-20261004/manifiesto.json
```

Usa los ids guardados y verifica los marcadores del conjunto y que las
facturas sigan siendo borradores. Retira ajustes/faltantes, cola de Impresión de esas facturas, borradores y
líneas, mapeos, productos, proveedores y cambios temporales/contactos de
los dos nombres exactos de prueba. No borra por un prefijo `zz` genérico,
no usa CASCADE explícito ni limpia las secuencias: los ids asignados quedan
consumidos, sin retroceder sobre trabajo paralelo. Las demás referencias de otros
flujos y los marcadores modificados impiden la retirada y revierten toda
la operación; en ese caso revisar lo que se hizo con la demo antes de actuar.

VERIFICACIÓN. Antes de conservar el conjunto, creación, rechazo de una
segunda creación y retirada en BEGIN/ROLLBACK: nueve tablas idénticas.
Navegador real contra 5174 → 3002: ambas tarjetas, lista→detalle→volver,
cinco productos, notas y PDF válido; escritorio de 1440 y vista de 700 px,
sin errores JS. **30 comprobaciones dirigidas aprobadas**, incluido el
grafo y el comportamiento existente de las órdenes. No se guardaron cambios
de la orden durante esa revisión.
CLI comprobado: archivo existente intacto, ruta dentro del repositorio
rechazada y segunda creación rechazada sin dejar un parcial ni escribir datos.
Evidencia y manifiesto privados en `/private/tmp/codex-demo-proveedores-20261004`;
el manifiesto se conserva como evidencia; los datos ya se retiraron.
Tras la inserción y la revisión del navegador, las huellas de las filas
anteriores en nueve tablas siguen idénticas, incluida `serie_consecutivo`.
Solo se añadieron las filas del conjunto; las secuencias de ids avanzan al
insertar, como corresponde. No se retocaron registros previos ni series.

REGRESIÓN. `tests/demoReporteProveedores.test.js`: creación y retirada con
una fila en Impresión, en PostgreSQL desechable y BEGIN/ROLLBACK. La cola
anterior queda idéntica; desaparecen únicamente los ids del conjunto.
