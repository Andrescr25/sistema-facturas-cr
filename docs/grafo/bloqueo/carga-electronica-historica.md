---
id: bloqueo/carga-electronica-historica
tipo: bloqueo
titulo: La carga histórica electrónica debe conservar el estado real del origen
estado: vigente
archivos:
  - backend/migrations/independencia/015_espacio_emision_electronica.sql
  - backend/scripts/independencia/cargar-facturas.js
  - backend/src/modules/facturacion/desdeAlegra.js
  - backend/scripts/independencia/ensayar-corte.js
aristas:
  relacionado: [modulo/ensayo-corte, modulo/archivo-ventas-electronicas, modulo/facturacion, modulo/lectura-migracion-alegra]
medido: 2026-10-05
---

Detectado al ensayar sobre un dump nuevo: 015 se aplica antes de cargar las
facturas, y exige `hacienda_estado='aceptada'` para `electronica=true`.
`cargar-facturas.js` copia la marca electrónica pero no inserta el estado
fiscal. La primera página con un documento así revierte su transacción con
la restricción `factura_electronica_aceptada`. Una copia cargada antes de 015
no exhibía este fallo: esa migración marcó como aceptados los documentos que
ya existían, a partir de la marca, no de una respuesta fiscal comprobada.

No arreglarlo poniendo 'aceptada' a todos ni quitando la restricción para
forzar el ensayo. La marca de plantilla no demuestra emisión: la lectura del
archivo encontró 54 fichas sin clave/XML. La consulta de la fuente sí expone
`stamp.legalStatus` y `entityResponse`; hay que revisar su significado real
y representar los desconocidos/rechazados sin inventar aceptación ni perder
el documento histórico. La existencia de esos campos no prueba su valor.

El usuario excluyó Hacienda del trabajo nocturno. **Resolver esta adaptación
de datos/estado fiscal mañana**, antes de completar la carga y el ensayo.
No se emitió, anuló ni reemitió nada, no se cambiaron estados fiscales de la
compartida/producción y el intento fallido quedó incompleto. Hasta entonces
no marcar carga final, conciliación total ni corte como terminados.
