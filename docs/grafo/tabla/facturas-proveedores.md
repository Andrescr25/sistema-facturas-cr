---
id: tabla/facturas-proveedores
tipo: tabla
titulo: El buzón — lo que llegó por correo, aceptado o no
estado: vigente
archivos:
  - backend/services/emailService.js
  - backend/services/databaseService.js
aristas:
  bloqueado_por: [bloqueo/xml-historico-sin-recuperar]
  relacionado: [tabla/compra]
medido: 2026-09-20
---

Encabezado de cada factura de proveedor recibida por correo, con sus líneas en
`productos_factura_proveedor`. NO es la compra: ver
[[decision/el-buzon-no-es-la-compra]].

La columna `archivo_xml` es texto (`TEXT`), pero guarda el NOMBRE del archivo
adjunto, no su contenido. Comprobado en las 882 de producción y las 862 de la
copia local: cero tienen un `<` en esa columna. Ver
[[bloqueo/xml-historico-sin-recuperar]].

`email_id` guarda un `seqno` de IMAP —posicional, volátil, 69 de 862 en
NULL—, no un UID. La llave para recuperar un XML es `archivo_xml` (el nombre
real del adjunto) verificado contra `clave` (única en las 862).
