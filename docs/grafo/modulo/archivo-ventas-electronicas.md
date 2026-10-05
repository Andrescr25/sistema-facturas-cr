---
id: modulo/archivo-ventas-electronicas
tipo: modulo
titulo: Originales electrónicos de ventas — PDF, XML y huellas fuera de Git
estado: vigente
archivos:
  - backend/scripts/independencia/archivar-ventas-electronicas.js
  - backend/scripts/independencia/lib/archivo-electronico.js
  - backend/tests/archivoElectronico.test.js
aristas:
  relacionado: [modulo/facturacion, modulo/conciliacion-ventas, modulo/correo-facturas, decision/la-ruta-no-el-contenido, leccion/la-db-local-es-produccion]
medido: 2026-10-04
---

SECCIÓN 15. Archiva los PDF y XML que entrega Alegra para las ventas
electrónicas ya emitidas, incluidos tiquetes y anuladas. No genera un PDF
de sustitución, no emite ante Hacienda y no cambia facturas, series ni SQL.
No se conecta al buzón ni envía mensajes. El XML histórico de COMPRAS
es otro trabajo, descrito por su bloqueo en el mapa.

Desde `backend` en independencia:

```sh
node scripts/independencia/archivar-ventas-electronicas.js --todos --destino=/ruta/privada/ventas
node scripts/independencia/archivar-ventas-electronicas.js --desde=2026-09-01 --hasta=2026-09-30 --destino=/ruta/privada/ventas-septiembre --a-la-vez=3
```

`--todos` recorre el historial de Alegra, también las facturas aún no copiadas
en SQL. El período alternativo es inclusivo. Borradores no emitidos y ventas
no electrónicas quedan fuera. La identidad incluye id de Alegra, número,
fecha, tipo y clave fiscal de 50 dígitos, sin usar el serial propio.

Si el listado omite datos fiscales se consulta el detalle. Si tampoco tiene
clave/identidad suficiente, queda pendiente en el manifiesto; los demás
originales se descargan igualmente y la revisión termina incompleta.

La [consulta oficial del detalle](https://developer.alegra.com/reference/get_invoices-id)
documenta `fields=pdf,xml`; el [listado](https://developer.alegra.com/reference/get_invoices)
documenta fechas inclusivas, orden por id y máximo 30 por página. Solo
GET: metadatos con autenticación; archivos sin ella. Hosts comprobados: CDN
de Alegra y `alegra.s3.amazonaws.com`, por HTTPS sin credenciales en la URL
ni puerto alternativo. Se revisa cada redirección; un host desconocido queda
pendiente. Enlaces firmados y errores internos no se imprimen ni se guardan.

LECTURA COMPLETA. Concurrencia por omisión 3, ajustable de 1 a 5. Una página
corta vuelve al offset real, descartando las páginas especulativas posteriores.
Duplicados, orden incorrecto, fechas fuera del filtro, página fallida o datos
después de una página vacía impiden certificar. Hay reintentos acotados de
GET transitorios y límites, también para archivos (máximo tres intentos).
Un fallo HTTP al consultar la ficha se distingue de un cambio de identidad.
Los GET no son una instantánea transaccional:
repetir con el origen congelado al cortar.

ARCHIVO PRIVADO. Destino absoluto fuera de cualquier repositorio; su padre
debe existir. Carpeta 0700, archivos 0600; no se siguen enlaces simbólicos.
Cada factura tiene `documentos/<alegraId>.pdf` y `.xml`. `manifiesto.json`
conserva identidades, bytes, SHA-256, alcance, selección, inicio/fin y fallos.
No se publica por Express ni entra en Git. Respaldar esta carpeta junto con
SQL y trasladarla al almacenamiento privado del servidor al cortar: la copia
del equipo de desarrollo no es el respaldo del servidor. No se llena
`factura.xml_ruta` con una ruta que allí todavía no existe.

VALIDACIÓN. PDF con cabecera y fin; XML UTF-8 parseable sin DTD/entidades,
raíz de factura/tiquete, clave igual a la de Alegra y firma presente. Es
pertenencia y formato, no validación criptográfica ni consulta de Hacienda.
Las huellas verifican después que no cambiaron los bytes archivados.

REANUDAR. El mismo comando verifica y reutiliza originales completos sin
descargarlos ni alterar su fecha. Si llegó solo el PDF, trae el XML faltante.
Un archivo guardado antes de confirmar el manifiesto solo se adopta si
coincide byte por byte con la descarga. Un original distinto, manifiesto
inválido o alcance nuevo no pisa lo anterior. Los documentos fuera de una
nueva lectura se conservan y se reportan, sin certificar esa revisión.

`.en-curso` impide dos descargas en la misma carpeta. Se retira al terminar,
incluso con error. Tras un cierre abrupto, comprobar que su PID ya no existe
antes de quitar ese bloqueo y repetir. El manifiesto tiene un solo escritor,
aunque varios documentos se descarguen juntos. Se espera a los trabajadores
antes de liberar el bloqueo después de un fallo de disco.

CÓDIGOS. 0: originales completos para esa lectura y alcance; 2: archivos
pendientes o documentos fuera de la nueva lectura; 1: lectura interrumpida.
Una lectura fallida deja el manifiesto incompleto. Un 0 de este script no
significa que el corte esté terminado. La medición real y las pruebas finales
se documentan en el informe de avance.

MEDICIÓN REAL, 2026-10-04. El recorrido devuelve 5.526 facturas y 546
marcadas electrónicas. En 54, ni el listado ni el detalle entregan clave
fiscal. Una segunda consulta de cada una confirma que ofrecen PDF, pero
ninguna devuelve XML: 46 cerradas y 8 anuladas. La marca de plantilla no
demuestra por sí sola emisión fiscal; no afirmar que se perdieron 54 XML,
ni inventarlos o reemitir para completar el archivo. Esos ids quedan en
`fallos`, sin archivos archivados como fiscalmente identificados; la
herramienta exige la clave. Revisar su emisión/originales en Alegra antes
de cerrar la fila de §15. Las restantes 492 sí tienen identidad suficiente.
Primer intento: **446 pares completos y un PDF adicional**, 100 pendientes:
54 sin clave, 3 descargas fallidas y 43 consultas de detalle que fallaron.
Las primeras tres de estas últimas coinciden al volver a consultarlas;
no afirmar por ese fallo que cambiaron de identidad. Se reanuda con dos
trabajadores, conservando todo lo confirmado. La verificación independiente
comprobó las huellas, formato, claves/firma y permisos de los 893 archivos
guardados. El manifiesto sigue incompleto. El resultado del reintento y
la verificación final se registran en
[el informe de avance](../../informes/avance-independencia-2026-10-04.md).
