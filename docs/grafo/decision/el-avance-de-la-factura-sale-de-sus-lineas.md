---
id: decision/el-avance-de-la-factura-sale-de-sus-lineas
tipo: decision
titulo: El avance de una factura del buzón se cuenta desde sus líneas — soltar una relación no inventa un estado
estado: vigente
archivos:
  - backend/src/modules/productos-revision/relacionPropia.js
  - backend/migrations/independencia/039_avance_de_la_factura_desde_sus_lineas.sql
  - backend/src/modules/productos-revision/productos-revision.service.js
  - backend/src/modules/revision-precios/revision-precios.service.js
  - backend/tests/relacionPropia.test.js
aristas:
  relacionado: [modulo/relacionar-productos, tabla/facturas-proveedores, modulo/revision-precios]
medido: 2026-10-04
---

**La pregunta.** Al soltar una relación, la línea vuelve a PENDIENTE pero la
factura seguía diciendo el porcentaje de antes —y, si estaba completa, seguía
marcada `RELACIONADO`—. ¿Qué estado le toca a una factura que deja de estar
completa? El usuario dejó la decisión en manos de quien lo estaba
programando (2026-10-04: "tomá la decisión que creas más acorde").

**Lo que se midió antes de decidir.**

- `facturas_proveedores.porcentaje_relacionado` y `estado_relacionado` no los
  lee nadie. Ni una pantalla ni una consulta del backend: Relacionar Productos
  y Revisión de Precios reciben la factura con sus líneas y cuentan ellas.
- Solo los escribían dos lugares: relacionar una línea a mano y recibir la
  factura. Soltar, cambiar, o confirmar desde Revisión de Precios no.
- Por eso la copia estaba vieja en **217 de 862 facturas**: 62 marcadas
  completas con líneas pendientes, y el resto al revés —completas de verdad
  que nunca se marcaron—.
- El estado de TRABAJO de la factura es otra columna, `estado`
  (`PROCESADA` → `ENVIADA`), y tiene su propia acción para volver atrás
  ("Devolver a Relacionar", en Revisión de Precios).

**La decisión.** No hay estado nuevo que inventar. El avance es un número que
se DERIVA de las líneas, y se vuelve a contar cada vez que una línea cambia:

- `recalcularAvance` (en `relacionPropia.js`) lo hace para las facturas de las
  líneas tocadas. Lo llaman relacionar, soltar una línea, eliminar una
  relación entera, crear un producto desde una línea, y confirmar o rechazar
  en Revisión de Precios.
- La migración 039 pone al día las 217.
- **Completa** es que no le falte ninguna línea, no que el redondeo dé 100:
  con 199 de 200 queda en 99 %.
- `estado` no se toca desde acá. Soltar una relación de una factura ya
  registrada como compra no la devuelve sola a relacionar: eso lo decide una
  persona con el botón que ya existe.

**Por qué no borrar las dos columnas**, si nadie las lee: el cliente de
Prisma las selecciona en cada lectura de la factura, y en esta rama no se
regenera. Si quedan, que digan la verdad.

**Lo que falta.** El buzón, al recibir una factura, todavía calcula el suyo
con el redondeo viejo (`services/databaseService.js`). Pasa a esta misma
función cuando el buzón relacione por `producto.id`.
