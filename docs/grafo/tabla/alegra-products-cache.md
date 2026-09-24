---
id: tabla/alegra-products-cache
tipo: tabla
titulo: La copia local del catálogo de Alegra, con columnas nuestras pegadas por SQL
estado: vigente
archivos:
  - backend/prisma/schema.prisma
  - backend/migrations/add_subcategorias.sql
  - backend/migrations/add_tax_percentage_products_cache.sql
  - backend/setupDatabase.js
aristas:
  relacionado: [tabla/subcategoria, bloqueo/prisma-no-se-regenera, leccion/precio-sin-iva-costo-con-iva]
medido: 2026-09-23
---

Copia de los items de Alegra (`alegra_id`, `name`, `reference`, `price`,
`cost`, `category`, `image_url`…), refrescada al sincronizar.

LO QUE HAY QUE SABER ANTES DE LEERLA

- `price` va SIN impuesto y `cost` CON él. Ver
  [[leccion/precio-sin-iva-costo-con-iva]].
- `tax_percentage` NULL es "no se sincronizó", no "exento".
- "Visible" es `status = 'active' AND hidden_locally = false`. Todo conteo
  que se muestre al lado de una lista tiene que usar ese mismo `WHERE`: si
  no, "Sin clasificar (37)" muestra 35 filas.
- `category` es TEXTO: las categorías de Alegra no tienen tabla acá. Lo que
  es nuestro sobre ellas vive en [[tabla/categoria-config]].
- `subcategoria_id` NO está en el esquema de Prisma (se agregó por SQL en
  `add_subcategorias.sql`): se lee y escribe con `query` crudo, nunca con el
  cliente de Prisma. Ver [[bloqueo/prisma-no-se-regenera]].
