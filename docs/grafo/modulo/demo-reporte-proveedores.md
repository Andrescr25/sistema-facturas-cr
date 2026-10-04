---
id: modulo/demo-reporte-proveedores
tipo: modulo
titulo: Demostración local de Reporte de Proveedores — conjunto conservado para revisión
estado: vigente
archivos:
  - backend/scripts/independencia/demo-reporte-proveedores.js
  - frontend/src/pages/ReporteProveedores.jsx
aristas:
  relacionado: [modulo/faltantes, modulo/exportaciones-reportes, leccion/ids-propios-y-de-alegra-no-se-mezclan, leccion/fecha-utc-costa-rica, leccion/la-db-local-es-produccion]
medido: 2026-10-04
---

PEDIDO DEL USUARIO. El 2026-10-04 pidió insertar datos en Reporte de
Proveedores para verlo y recorrer el flujo ahora. **Se conservan a petición
suya**, como excepción concreta a retirar los `zz` al terminar una prueba.
No retirarlos, refrescar la base compartida ni ejecutar la limpieza semanal
durante otra verificación. No se insertó nada en producción.

EN LA COPIA LOCAL. Abrir `http://localhost:5174/reportes/proveedores` y buscar
`ZZ-DEMO`. Los nombres son `ZZ-DEMO Distribuidora Norte [PRUEBA]` y
`ZZ-DEMO Ferretería Sur [PRUEBA]`; Norte tiene tres productos y 22 unidades,
Sur dos y 5: **cinco productos, 27 unidades**. Las fichas no tienen teléfonos
ni correos reales. Sus identificaciones de prueba son extranjeras y sus
mapeos usan ids propios; `alegra_item_id=''`, sin inventar fichas externas.

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

SCRIPT DE UN SOLO USO, desde `backend` de independencia:

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

RETIRADA, **cuando el usuario termine de verla**, con su manifiesto:

```sh
node scripts/independencia/demo-reporte-proveedores.js retirar /private/tmp/codex-demo-proveedores-20261004/manifiesto.json
```

Usa los ids guardados y verifica los marcadores del conjunto y que las
facturas sigan siendo borradores. Retira ajustes/faltantes, borradores y
líneas, mapeos, productos, proveedores y cambios temporales/contactos de
los dos nombres exactos de prueba. No borra por un prefijo `zz` genérico,
no usa CASCADE explícito ni limpia las secuencias: los ids asignados quedan
consumidos, sin retroceder sobre trabajo paralelo. Las referencias de otros
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
los datos sí permanecen en la base local para la revisión solicitada.
Tras la inserción y la revisión del navegador, las huellas de las filas
anteriores en nueve tablas siguen idénticas, incluida `serie_consecutivo`.
Solo se añadieron las filas del conjunto; las secuencias de ids avanzan al
insertar, como corresponde. No se retocaron registros previos ni series.
