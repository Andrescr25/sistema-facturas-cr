---
id: leccion/proveedor-por-cedula
tipo: leccion
titulo: El proveedor de un producto sale del mapeo, por cédula — no del nombre ni de GET /proveedores
estado: vigente
archivos:
  - backend/src/modules/catalogo/catalogo.service.js
aristas:
  relacionado: [tabla/supplier-product-mapping, modulo/gestion-catalogo]
medido: 2026-09-25
---

"Qué le compro a este proveedor" parte de
[[tabla/supplier-product-mapping]] por `supplier_cedula`. Medido 2026-09-23:
el más grande tiene 504 productos visibles, y 598 no tienen ningún proveedor
relacionado.

TRAMPAS

- La tabla `proveedores` (sin cédula) NO es la fuente.
- `GET /proveedores` lista desde TODAS las facturas recibidas, incluidas las
  de gastos sin productos (luz, alquiler): filtrar productos con esa lista
  deja resultados vacíos. El endpoint correcto es
  `GET /api/alegra/catalog/proveedores` (`listarProveedoresDelCatalogo`).
- Agrupar por nombre parte al mismo proveedor en dos: "F & G Ferreteros
  Sociedad Anonima" y "F Y G FERRETEROS SOCIEDAD ANONIMA" son la misma
  cédula. Siempre agrupar por cédula y mostrar el nombre más reciente.
- `alegraItemId` es String obligatorio en Prisma: `{ not: null }` es un error
  de validación que un doble de prueba laxo deja pasar.
