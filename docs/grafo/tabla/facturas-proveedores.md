---
id: tabla/facturas-proveedores
tipo: tabla
titulo: El buzón — lo que llegó por correo, aceptado o no
estado: vigente
archivos:
  - backend/services/emailService.js
  - backend/services/databaseService.js
  - backend/src/modules/orders-whatsapp/ordenesCicloFactura.service.js
aristas:
  bloqueado_por: [bloqueo/xml-historico-sin-recuperar]
  relacionado: [modulo/facturas-ordenes-compra, tabla/compra, decision/el-avance-de-la-factura-sale-de-sus-lineas]
medido: 2026-10-06
---

Encabezado de cada factura de proveedor recibida por correo, con sus líneas en
`productos_factura_proveedor`. NO es la compra: ver
[[decision/el-buzon-no-es-la-compra]].

La columna `archivo_xml` es texto (`TEXT`), pero guarda el NOMBRE del archivo
adjunto, no su contenido. Comprobado en las 882 de producción y las 862 de la
copia local: cero tienen un `<` en esa columna. Ver
[[bloqueo/xml-historico-sin-recuperar]]. Las que llegan desde 2026-09-20 sí
guardan el XML, como ruta en `xml_ruta` (ver
[[decision/la-ruta-no-el-contenido]]): `saveFactura` escribe primero el
archivo y después la fila, y solo borra el archivo si la fila no llegó a
crearse.

`email_id` guarda un `seqno` de IMAP —posicional, volátil, 69 de 862 en
NULL—, no un UID. La llave para recuperar un XML es `archivo_xml` (el nombre
real del adjunto) verificado contra `clave` (única en las 862).


`porcentaje_relacionado` y `estado_relacionado` son una copia de "cuántas
líneas están relacionadas" que ninguna pantalla lee. Se recalculan desde las
líneas: [[decision/el-avance-de-la-factura-sale-de-sus-lineas]]. El estado de
trabajo es `estado`.

ORDEN POR CICLO (048). [[modulo/facturas-ordenes-compra]] permite vincular
un comprobante explícitamente a una orden enviada del mismo proveedor.
Conserva snapshot de datos/conversión y PDF privado; no cambia estado/líneas
del buzón, registra compra o acredita recepción física. Un PDF adjuntado y
una representación del snapshot son tipos distintos. Archivo original no se
recupera de archivo_xml (solo nombre) ni se inventa desde un XML inexistente.
