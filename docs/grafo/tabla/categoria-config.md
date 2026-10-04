---
id: tabla/categoria-config
tipo: tabla
titulo: Orden y nombre visible de las categorías de Alegra
estado: vigente
archivos:
  - backend/migrations/add_orden_categorias.sql
  - backend/src/modules/productos/taxonomiaTablas.js
  - backend/tests/taxonomiaTablas.test.js
aristas:
  relacionado: [tabla/subcategoria, decision/orden-canonico-compartido, modulo/gestion-catalogo, modulo/catalogo-agente]
medido: 2026-10-04
---

`categoria_config (categoria PK, nombre_visible, orden, actualizado_en)`.
Las categorías de Alegra son planas y no tienen tabla acá; esta guarda solo
lo que es NUESTRO sobre ellas, colgado del nombre real.

- La categoría real de Alegra nunca cambia por esto: `nombre_visible` es lo
  que se pinta; todo lo que cruza por categoría usa el nombre real.
- `orden` es NULABLE a propósito: renombrar una categoría que nunca se movió
  crea su fila sin orden, y NULL se trata como "todavía no se acomodó". Con
  un default de 0 el renombre la mandaría al principio de todas.

EN ESTA RAMA LAS CATEGORÍAS SON PROPIAS (`categoria_producto`), y esta tabla
sigue colgada de su NOMBRE. La leen y escriben `taxonomiaTablas.js`
(`categoriasEnOrden`, `renombrarCategoria`, `reordenarCategorias`).

`categoriasEnOrden` es el ÚNICO lugar que decide el orden: de ahí lo toman el
árbol de Gestión de Catálogo y lo que baja la tablet. Hasta el 2026-10-04 la
tablet lo armaba pidiéndole las categorías a Alegra en vivo
(`categorias.service.js`, ya retirado): daba lo mismo —medido ese día, las 19
categorías en el mismo orden y con los mismos nombres visibles— pero dejaba el
catálogo del agente dependiendo de que Alegra respondiera.

