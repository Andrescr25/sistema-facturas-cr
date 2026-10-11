---
id: tabla/producto-nuevo-catalogo
tipo: tabla
titulo: Productos nuevos — lista manual por producto propio, retiro por entrada
estado: vigente
archivos:
  - backend/migrations/independencia/036_catalogo_agente_con_ids_propios.sql
  - backend/src/modules/inventario-auditorias/productosNuevos.js
  - backend/src/modules/inventario-auditorias/inventario-auditorias.routes.js
  - frontend/src/hooks/useProductosNuevos.js
  - frontend/src/components/inventario-auditoria/SeccionProductosNuevos.jsx
  - backend/tests/productosNuevos.test.js
  - backend/tests/catalogoAgenteIdsPropios.test.js
aristas:
  relacionado: [modulo/catalogo-agente, modulo/gestion-catalogo, leccion/ids-propios-y-de-alegra-no-se-mezclan]
medido: 2026-10-03
---

`producto_nuevo_catalogo` conserva qué se agregó, cuándo y quién. No deduce
altas automáticamente ni copia nombre, imagen, precio o categoría: relee la
ficha propia actual. `producto_id` refiere a `producto.id`; el índice único
parcial evita duplicar la entrada con un doble toque, sin cambiar su fecha.

`id` es la entrada de la lista, distinta de la ficha. La API entrega
`registroId` para quitar por `DELETE /productos-nuevos/registros/:registroId`,
y `productoId` para agregar y buscar. Esta distinción permite quitar una
entrada histórica sin correspondencia. Nunca se interpreta un id de entrada
como producto, ni una referencia de Alegra como alguno de los dos.

036 rellena `producto_id` por `producto.alegra_id`, conserva huérfanos,
permite referencias históricas nulas y cambia la clave primaria a `id`.
Se puede repetir. El buscador de esta lista consulta el maestro propio;
no usa el buscador de devoluciones, que mantiene su contrato de Alegra.

La administración conserva productos ocultos, inactivos o sin precio y
explica por qué no salen. La tablet recibe solo los visibles, por id propio.
También las bajas de precio y la rotación A/B usan ese espacio de ids.
