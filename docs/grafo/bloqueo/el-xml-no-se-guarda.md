---
id: bloqueo/el-xml-no-se-guarda
tipo: bloqueo
titulo: El XML de compra no se guarda — se guardó SOLO el nombre
estado: vigente
archivos:
  - backend/services/emailService.js
  - backend/services/databaseService.js
aristas:
  depende_de: [decision/la-ruta-no-el-contenido]
  relacionado: [tabla/facturas-proveedores, decision/el-total-manda-sobre-las-lineas]
medido: 2026-09-20
---

`emailService.js` parsea el adjunto XML en memoria (`saveXmlAttachment`) y el
Buffer muere ahí: la última vez que existe es al pasarlo a
`xmlParser.parseFacturaXML` antes de guardar. `archivo_xml` guarda el NOMBRE
del archivo, nunca su contenido. Comprobado: **0 de 882** en producción y **0
de 862** en la copia local tienen un `<` en esa columna.

Las facturas van del 2025-07-24 al 2026-09-18: más de un año de comprobantes
cuyo único ejemplar vive en el buzón de correo (por ley, hay que
conservarlos 5 años).

Este nodo se marca `retirado` (no se borra) cuando: (1) el XML se guarde por
ruta, siguiendo [[decision/la-ruta-no-el-contenido]]; (2) se recupere lo
posible de los 882/862 ya recibidos, leyendo el buzón por IMAP con una llave
explícita que distinga lectura de escritura en `config/aislado.js`; (3) las
18 facturas de [[decision/el-total-manda-sobre-las-lineas]] cuadren o queden
con su diferencia explicada.
