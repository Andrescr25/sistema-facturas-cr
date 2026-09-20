---
id: decision/la-ruta-no-el-contenido
tipo: decision
titulo: Los archivos grandes se guardan como ruta, no como columna
estado: vigente
archivos:
  - backend/migrations/independencia/015_espacio_emision_electronica.sql
  - backend/src/integrations/almacenamiento/local.js
aristas:
  depende_de: [bloqueo/prisma-no-se-regenera]
  relacionado: [bloqueo/el-xml-no-se-guarda]
medido: 2026-09-11
---

Precedente ya tomado para las facturas de VENTA
(`015_espacio_emision_electronica.sql`): el XML firmado son ~15 KB por
factura y la base ya carga con decenas de miles de líneas, así que se guarda
`xml_ruta TEXT` apuntando a un archivo, no el contenido en una columna.

Mismo criterio para las fotos de producto: `integrations/almacenamiento/`
guarda el archivo en disco y la base solo tiene la ruta.

Se aplica igual a los XML de COMPRA
([[bloqueo/el-xml-no-se-guarda]]): `facturas_proveedores.xml_ruta` y
`compra.xml_ruta`, con un almacenamiento que NO se sirve por HTTP —a
diferencia de las fotos, un comprobante fiscal no puede quedar accesible sin
sesión.
