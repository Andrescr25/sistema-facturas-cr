---
id: decision/permisos-por-prefijo-mas-especifico
tipo: decision
titulo: A quién pertenece una ruta — gana el prefijo más largo, sea de un módulo o compartido
estado: vigente
archivos:
  - backend/src/modules/usuarios/modulos.js
  - backend/tests/permisosModulos.test.js
  - backend/tests/usuariosPermisos.test.js
aristas:
  relacionado: [modulo/permisos, modulo/gestion-catalogo]
medido: 2026-09-23
---

`clasificarRuta(ruta)` busca el prefijo MÁS LARGO que calce, entre los
`rutasApi` de los módulos y los `COMPARTIDAS`, y ese es el dueño.

ANTES se miraba primero si la ruta era compartida, y eso abrió dos huecos:
todo módulo que viviera debajo de un prefijo compartido quedaba al alcance de
cualquiera con sesión.

1. Facturación (2026-09-11): sus rutas colgaban de `/api/alegra`, que es
   compartida. Un usuario sin el módulo podía pedir `/alegra/facturacion/...`.
   Se arregló dándole su propio prefijo, `/api/facturacion`.
2. Gestión de Catálogo (2026-09-23): `/alegra/catalog`, igual. Se arregló con
   esta regla: `gestion-catalogo` declara `/alegra/catalog`, y las tres rutas
   de fotos que usan otras pantallas (`search-images`,
   `imagenes-por-referencia`, `image-proxy`) son compartidas con su ruta
   completa — más larga, así que ganan. *En esta rama ese módulo se retiró
   el 2026-10-04: Gestión de Catálogo es dueña de `/maestro`, y las fotos van
   por `/catalogos`, compartida. La regla sigue valiendo para
   `/alegra/bodega` y para las exportaciones debajo de `/reportes`.*

Al agregar un módulo: declarar sus prefijos, y agregar un caso al test de
"usuario sin el módulo → 403" con una ruta real suya.
