---
id: decision/cambio-de-categoria-en-segundo-plano
tipo: decision
titulo: Cambiar la categoría de muchos productos es un trabajo de fondo que se sondea
estado: vigente
archivos:
  - backend/src/modules/catalogo/catalogo.service.js
  - frontend/src/hooks/useAccionesLote.js
  - backend/tests/catalogoLote.test.js
aristas:
  relacionado: [modulo/gestion-catalogo, leccion/la-db-local-es-produccion]
medido: 2026-09-23
---

La categoría es de Alegra: cambiarla es un `GET` + un `PUT /items/:id` por
producto, ~3 s cada uno. Ochenta productos serían cuatro minutos de una
petición HTTP colgada, y un timeout del cliente NO detiene al servidor — un
reintento duplicaría el trabajo (ver [[leccion/la-db-local-es-produccion]]).

Por eso `POST /productos/categoria-lote` devuelve `{ jobId }` al instante, el
servidor procesa de a 3 en paralelo, y la pantalla sondea
`GET /trabajos/:jobId` (`{ total, hechos, errores, terminado }`) pintando
"23 de 80". Los trabajos viven en un `Map` en memoria y se borran solos 30
min después de terminar: son para mirar un progreso, no un historial.

Mover una subcategoría entera a otra categoría usa el mismo trabajo con un
paso `alFinalizar`: si en el destino ya hay una con el mismo nombre, se
fusionan; si se movieron todos, la subcategoría pasa al final del orden del
destino; si algunos fallaron, se crea una con el mismo nombre en el destino
para los que sí llegaron.

Mover a SUBCATEGORÍA, en cambio, es local: un solo `UPDATE`, instantáneo. Los
dos botones dicen cosas distintas a propósito, para que nadie se sorprenda
con la espera.
