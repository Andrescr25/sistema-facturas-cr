---
id: decision/la-ruta-no-el-contenido
tipo: decision
titulo: Los archivos grandes se guardan como ruta, no como columna
estado: vigente
archivos:
  - docs/informes/simplificacion-sin-semanas-2026-10-20.md
  - backend/migrations/independencia/015_espacio_emision_electronica.sql
  - backend/migrations/independencia/021_xml_ruta_compra.sql
  - backend/src/integrations/almacenamiento/local.js
  - backend/services/databaseService.js
  - backend/migrations/independencia/048_factura_orden_compra_ciclo.sql
aristas:
  depende_de: [bloqueo/prisma-no-se-regenera]
  relacionado: [modulo/facturas-ordenes-compra, modulo/hacienda, bloqueo/xml-historico-sin-recuperar, modulo/archivo-ventas-electronicas, modulo/gastos-operativos]
medido: 2026-10-21
---

## Vigencia desde el 2026-10-20

Se retiraron los selectores/asignaciones de semana y el enlace de compras
a órdenes desde Revisión de precios. La ruta actual y próxima visita siguen
vigentes; los documentos y envíos anteriores se conservan. El alcance y las pruebas actuales están en
[el informe del retiro](../../informes/simplificacion-sin-semanas-2026-10-20.md).


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

Hacienda conserva XML y respuestas en archivos privados con huellas. El
paquete pequeño de certificado/PIN/usuario/contraseña se guarda cifrado en la
configuración por ambiente (AES-GCM); la llave maestra vive fuera de Git.
Este cifrado permite rotación transaccional del certificado y revisión del
token sin exponer contenido en GET/bitácora. No hay XML en la columna de
secretos. Respaldar base, llave y archivos juntos; [[modulo/hacienda]].

PDF DEL PROVEEDOR (048). [[modulo/facturas-ordenes-compra]] aplica este
criterio: ruta/bytes/huella en DB, archivo privado fuera de Git/HTTP. Copias
inmutables con tipo original adjuntado o representación; no regenerarlas al
leer ni borrar al retirar vínculo. Respaldo debe incluir DB y
ALMACENAMIENTO_PRIVADO_DIR/ordenes-facturas. La copia pequeña del PDF de la
orden enviada (047, BYTEA) se conserva tal como ya fue implementada.

GASTOS OPERATIVOS (061). XML/PDF siguen en el almacén privado existente;
la ficha descarga con sesión y permiso propios. No se reemplaza un original.
El correo sólo empareja PDF/XML por nombre inequívoco o por un único par;
con varios candidatos se adjunta explícitamente desde la ficha. Los datos
extraídos y las líneas XML de respaldo se conservan en los metadatos del
gasto; ese JSON no sustituye al archivo original.
