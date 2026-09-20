---
id: modulo/compras
tipo: modulo
titulo: Compras — de recibir la factura a que sea nuestra
estado: vigente
archivos:
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/services/emailService.js
  - backend/services/databaseService.js
aristas:
  depende_de: [tabla/compra, tabla/compra-linea, tabla/facturas-proveedores]
  bloqueado_por: [bloqueo/el-xml-no-se-guarda, bloqueo/prisma-no-se-regenera]
  relacionado: [modulo/inventario]
medido: 2026-09-20
---

QUÉ ES HOY Y QUÉ VA A SER

El correo trae el XML de la factura electrónica del proveedor. Se guarda un
encabezado en `facturas_proveedores` y sus líneas en
`productos_factura_proveedor` —el BUZÓN, ver [[tabla/facturas-proveedores]]—,
se relacionan con nuestro catálogo, pasan por Revisión de Precios y terminan
con `POST /bills` en Alegra (`revision-precios.service.js:595-858`).

El destino es que "Enviar a Alegra" se convierta en "Registrar compra": una
transacción propia que crea la fila en [[tabla/compra]], mueve el costo del
producto y libera la cuenta por pagar, sin tocar Alegra.

POR QUÉ ES EL SIGUIENTE MÓDULO GRANDE

Es el último camino, aparte de facturar, que todavía escribe en Alegra. Y es
el que bloquea retirar `alegra_products_cache`: entre `productos-revision` (20
usos) y `revision-precios` (12) suman la mitad de las 20 lecturas medidas de
esa caché el 17 de setiembre de 2026.

QUÉ YA ESTÁ

860 compras y 8.590 líneas cargadas desde el buzón (migraciones 019 y 020),
todas colgando de `proveedor_id` y `producto_id` propios. Falta el camino de
registrar una compra NUEVA sin pasar por Alegra.
