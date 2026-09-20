---
id: bloqueo/el-xml-no-se-guarda
tipo: bloqueo
titulo: El XML de compra no se guarda — se guardó SOLO el nombre
estado: vigente
archivos:
  - backend/services/emailService.js
  - backend/services/databaseService.js
  - backend/scripts/independencia/recuperar-xml-del-buzon.js
  - backend/scripts/independencia/reconciliar-compras.js
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

Este nodo se marca `retirado` (no se borra) cuando las tres partes cierren:

1. **HECHO (2026-09-20).** El XML se guarda por ruta, siguiendo
   [[decision/la-ruta-no-el-contenido]]: `almacenamiento.guardarArchivo`
   escribe en `almacenamiento-privado/` (nunca servido por HTTP), y
   `facturas_proveedores.xml_ruta` / `nota_credito_proveedor.xml_ruta` /
   `compra.xml_ruta` lo guardan (migración 021). De paso se extrajo lo que el
   parser nunca leía —`TotalOtrosCargos`, `TotalDescuentos`,
   `TotalIVADevuelto` (migración 022)— y se corrigieron dos bugs que
   afectaban directamente el cuadre: `Descuento`/`Impuesto` repetidos en una
   línea daban `NaN` (6.013 de 8.600 líneas tienen descuento > 0), y
   `estadoFinal` fuera de alcance hacía que **toda** factura procesada
   quedara marcada como error en el log aunque se hubiera guardado bien.
   Toda factura nueva desde ahora guarda su XML. 1.091 pruebas.

2. **ESCRITO, NO EJECUTADO.** El recuperador de los 882/862 ya recibidos
   (`scripts/independencia/recuperar-xml-del-buzon.js`) busca por
   `archivo_xml` —no por `email_id`, que es un seqno IMAP volátil y 69 de 862
   no lo tienen— y verifica contra `clave`. Necesita
   `PERMITIR_LECTURA_BUZON=true`, una llave nueva y propia (no
   `PERMITIR_SALIDAS`): antes esa guarda vivía solo en
   `emailService.startMonitoring()` y no en `connect()`, así que algo que
   llamara a `connect()` directamente se conectaba sin que nada lo frenara —
   corregido, las dos lo revisan ahora. **No se corrió contra el buzón real:
   necesita las credenciales de Gmail y que el usuario decida hacerlo.**

3. **ESCRITO, NO EJECUTADO.** `scripts/independencia/reconciliar-compras.js`
   copia `xml_ruta` del buzón a `compra` y recalcula cada total contra el XML
   recuperado. Probado con los montos reales de dos de las 18: el cargo de
   ₡16.941,92 de CADENA COMERCIAL RAMONENSE y el IVA devuelto de ₡6.835,31 de
   PROGRAMATICA cuadran con la fórmula. Falta correrlo contra las 18 de
   verdad, que depende del paso 2.
