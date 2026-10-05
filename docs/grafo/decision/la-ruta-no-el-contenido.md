---
id: decision/la-ruta-no-el-contenido
tipo: decision
titulo: Los archivos grandes se guardan como ruta, no como columna
estado: vigente
archivos:
  - backend/migrations/independencia/015_espacio_emision_electronica.sql
  - backend/migrations/independencia/021_xml_ruta_compra.sql
  - backend/src/integrations/almacenamiento/local.js
  - backend/services/databaseService.js
aristas:
  depende_de: [bloqueo/prisma-no-se-regenera]
  relacionado: [bloqueo/xml-historico-sin-recuperar, modulo/archivo-ventas-electronicas]
medido: 2026-10-04
---

Precedente ya tomado para las facturas de VENTA
(`015_espacio_emision_electronica.sql`): el XML firmado son ~15 KB por
factura y la base ya carga con decenas de miles de líneas, así que se guarda
`xml_ruta TEXT` apuntando a un archivo, no el contenido en una columna.

Mismo criterio para las fotos de producto: `integrations/almacenamiento/`
guarda el archivo en disco y la base solo tiene la ruta.

Se aplica igual a los XML de COMPRA
([[bloqueo/xml-historico-sin-recuperar]]): `facturas_proveedores.xml_ruta`,
`nota_credito_proveedor.xml_ruta` y `compra.xml_ruta` (migración 021), con un
almacenamiento que NO se sirve por HTTP —a diferencia de las fotos, un
comprobante fiscal no puede quedar accesible sin sesión—: `guardarArchivo`
en `local.js` escribe bajo `ALMACENAMIENTO_PRIVADO_DIR` (por omisión
`backend/almacenamiento-privado/`, ignorado en git y nunca montado en
express). Orden al guardar: primero el archivo, después la fila. Si la fila
NO llega a crearse (duplicada, o la base falla antes), se borra el archivo.
Si la fila YA existe, el archivo se queda aunque falle un paso posterior —
`saveFactura` lleva la marca `facturaCreada` para eso—: borrarlo dejaría
`xml_ruta` apuntando a nada, que es peor que un archivo de más.
