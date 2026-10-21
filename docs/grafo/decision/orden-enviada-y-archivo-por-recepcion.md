---
id: decision/orden-enviada-y-archivo-por-recepcion
tipo: decision
titulo: Orden enviada inmutable y archivo individual 24 horas después de recepción completa
estado: vigente
archivos:
  - docs/instrucciones-vigentes-usuario.md
  - docs/checklist-rutas-ciclos-operativos.md
  - docs/plan-rutas-ciclos-operativos.md
aristas:
  relacionado: [modulo/cierre-ordenes-compra, modulo/archivo-ordenes-compra, modulo/recepcion-ordenes-compra, modulo/facturas-ordenes-compra, modulo/ordenes-compra-por-ciclo, decision/ciclo-de-ruta-como-contexto, modulo/compras, modulo/faltantes, modulo/whatsapp, tabla/compra, tabla/compra-linea, tabla/facturas-proveedores]
medido: 2026-10-20
---

## Regla vigente desde el 2026-10-20

La enviada sigue inmutable y los faltantes nuevos crean otro pedido.
El vínculo, comparación y recepción por OC quedan retirados por el nuevo
pedido del usuario; los registros anteriores y su archivo calculado se
conservan en SQL. La nueva lógica de recepción/comparación espera definición
del usuario. Los párrafos siguientes describen el proceso anterior.
[Alcance actual](../../informes/simplificacion-sin-semanas-2026-10-20.md).

**Solicitud y aclaración del usuario. Borradores, envío inmutable y cobertura
implementados, junto al vínculo/PDF, comparación y recepción física;
archivo por consulta implementado (050).** Una orden
de compra enviada por WhatsApp conserva exactamente sus productos/cantidades.
Si se enviaron 10 y después faltan 3 más, las 3 requieren otra orden; no se
agregan a la anterior. Estados pedidos: borrador, pendiente de enviar, enviada,
parcialmente recibida, recibida y cerrada.

Cantidad ya solicitada cuenta como cobertura pendiente de recepción para
evitar compras duplicadas, con procedencia por ciclo. Distinguir stock,
requerido, comprometido, faltante, solicitado y físicamente recibido. La misma
cobertura no puede asignarse simultáneamente a dos necesidades.

Mostrar la factura electrónica/PDF dentro de la orden y comparar pedido,
facturado y recibido. Una factura no confirma recepción física; un faltante
no prueba por sí solo agotamiento. Conservar exceso facturado y discrepancias.
La recepción debe respetar conversiones y no duplicar inventario ya registrado
por una compra, ver [[tabla/compra-linea]] y [[modulo/compras]].

Eliminar la limpieza global del domingo a las 23:59. El usuario confirmó
**«Retirar de la lista activa y conservar historial»**: cada orden desaparece
de la lista activa 24 horas después de su recepción completa, reteniendo
historial, factura y comparación. Una recepción parcial no inicia ese archivo.
No borrar órdenes ni documentos fiscales.

[[modulo/ordenes-compra-por-ciclo]] implementa borrador/pendiente/enviada y
cierre SIN envío con motivo. Copia revisada privada con PDF/número/mensaje;
intento guardado antes del transporte, sin reenvío tras incertidumbre. Una
reserva sin confirmación no acredita pedido confirmado; un envío confirmado
sí se muestra solicitado y pendiente de recibir, sin crear stock. La
confirmación manual verifica el mensaje con motivo/actor; tampoco acredita
recepción física. Envío global viejo rechazado, históricos conservados.
No dar por implementada recepción por confirmar el envío. La limpieza vieja
sigue prohibida durante pruebas/desarrollo. SQL050 retira el reinicio global y calcula el archivo individual;
ver [[modulo/archivo-ordenes-compra]] para contratos y evidencia.

048 implementa [[modulo/facturas-ordenes-compra]]: original adjuntado privado
o representación identificada, comparación solicitada/facturada y exceso.
Una orden puede tener varias facturas; una factura completa no cubre dos
órdenes vigentes. Corrección con motivo conserva snapshot/PDF. 049 implementa cantidades
físicamente recibidas y motivos confirmados, ver [[modulo/recepcion-ordenes-compra]].
Final conserva eventos/fecha; SQL050 oculta tras 24 h sin cambiar recibida. Agotado solo declarado
explícitamente. Compras nuevas ya vinculadas ingresan stock por físico; compras
anteriores conservadas sin doble entrada. Cierre de enviada pendiente; archivo individual implementado.

052 implementa cierre explícito de enviada/parcial con motivo y revisión.
El evento conserva la cobertura recibida y libera únicamente pendiente.
Cerrada va inmediatamente a Historial; no es recibida ni inicia archivo24h.
Ver [[modulo/cierre-ordenes-compra]]; las restricciones anteriores son históricas.

2026-10-13: pedido reiterado para simplificar Reporte Proveedores. Se automatiza
la acumulación en borrador/pendiente del mismo proveedor y ciclo. Una enviada
o con intento incierto queda cerrada para agregar; los faltantes nuevos crean
otra. Cambiar una pendiente invalida su PDF preparado y requiere nueva revisión.
Cancelar sin envío conserva cerrada en la base y muestra Cancelada en pantalla.
Consultar no ejecuta esta preparación. Ver [[modulo/ordenes-compra-por-ciclo]].


## Aclaración posterior — Faltantes y fichas solamente, 2026-10-13

El usuario rechaza la complejidad de ciclos/paneles y pide Faltantes igual a
main, más Proveedores para información de cada ficha. Esta decisión reemplaza
la navegación anterior: no mostrar necesidades, compras, semanas ni paneles de
recepción/factura/cierre. Conservar sus registros y contratos históricos.
Acumular por proveedor en borrador/pendiente, aunque el origen tenga otra semana;
tras enviar, el nuevo faltante genera otra orden. SQL 058 elimina solo la igualdad
de ciclo en la procedencia. Preparar/editar/enviar no depende de estado del ciclo.
PDF y mensaje nuevos no llevan semanas; los ya guardados siguen intactos.
Ver [[modulo/reporte-proveedores]] y [[modulo/ordenes-compra-por-ciclo]].
