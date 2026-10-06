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
  relacionado: [modulo/facturas-ordenes-compra, modulo/ordenes-compra-por-ciclo, decision/ciclo-de-ruta-como-contexto, modulo/compras, modulo/faltantes, modulo/whatsapp, tabla/compra, tabla/compra-linea, tabla/facturas-proveedores]
medido: 2026-10-06
---

**Solicitud y aclaración del usuario. Borradores, envío inmutable y cobertura
implementados, junto al vínculo/PDF y comparación de factura; recepción y
archivo pendientes.** Una orden
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
sigue prohibida durante pruebas/desarrollo. Su retiro y el archivo nuevo
permanecen abiertos en el checklist hasta cambiar y verificar el código.

048 implementa [[modulo/facturas-ordenes-compra]]: original adjuntado privado
o representación identificada, comparación solicitada/facturada y exceso.
Una orden puede tener varias facturas; una factura completa no cubre dos
órdenes vigentes. Corrección con motivo conserva snapshot/PDF. Cantidades
físicamente recibidas y motivo confirmado de agotamiento siguen pendientes.
