---
id: bloqueo/carga-electronica-historica
tipo: bloqueo
titulo: La carga histórica electrónica debe conservar el estado real del origen
estado: retirado
archivos:
  - backend/migrations/independencia/015_espacio_emision_electronica.sql
  - backend/scripts/independencia/cargar-facturas.js
  - backend/src/modules/facturacion/desdeAlegra.js
  - backend/scripts/independencia/ensayar-corte.js
aristas:
  relacionado: [modulo/hacienda, modulo/ensayo-corte, modulo/archivo-ventas-electronicas, modulo/facturacion, modulo/lectura-migracion-alegra]
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

2026-10-05: el usuario autorizó Hacienda y el adaptador ya conserva
`stamp.legalStatus`, clave y fecha de origen en facturas y notas. Solo
`STAMPED_AND_ACCEPTED` con clave válida habilita la marca electrónica.
Rechazados/desconocidos no se inventan; plantilla se guarda aparte.
Se verificaron estados reales mediante GET: 5 aceptados entre 30 fichas
recientes, sin modificar Alegra. 015 dejó de asignar aceptación por plantilla.
Las bases viejas conservan sus datos hasta la recarga de origen; no se
retocan para aparentar aceptación propia. Pruebas de traducción y restricción
conservadas. La carga final/ensayo completo y conciliación siguen pendientes;
la corrección de código no demuestra que el corte ya se haya ensayado.
No se emitió, anuló ni reemitió nada, no se cambiaron estados fiscales de las facturas históricas de la
compartida/producción y el intento fallido quedó incompleto. Hasta entonces
no marcar carga final, conciliación total ni corte como terminados.

**BLOQUEO DE CÓDIGO RESUELTO, 2026-10-05:** la carga corregida completó 5.526
facturas y 53.582 líneas en una base de ensayo propia. También se corrigió la
colisión entre serie comercial y fiscal abreviada: se conserva número impreso
y se toma serie/consecutivo de la clave cuando existe. De 548 plantillas
electrónicas: 487 aceptadas en origen, 5 rechazadas y 56 estado desconocido.
No se supuso aceptación ni se relajó UNIQUE/CHECK. El ensayo completo de dos
pasadas y conciliaciones sigue pendiente; este nodo conserva el antecedente
y la regla para futuras recargas, ya no bloquea el cargador por código.
