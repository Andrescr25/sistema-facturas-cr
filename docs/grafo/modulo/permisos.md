---
id: modulo/permisos
tipo: modulo
titulo: Usuarios y permisos — cada ruta de la API tiene un dueño
estado: vigente
archivos:
  - backend/src/modules/usuarios/modulos.js
  - backend/src/modules/usuarios/permisos.middleware.js
  - backend/tests/permisosModulos.test.js
  - backend/tests/usuariosPermisos.test.js
  - frontend/src/utils/modulos.js
  - backend/routes/alegra.js
  - backend/tests/permisosDebajoDeAlegra.test.js
  - backend/tests/permisosPrestados.test.js
aristas:
  relacionado: [decision/permisos-por-prefijo-mas-especifico, modulo/gestion-catalogo, leccion/el-permiso-se-compara-como-express]
medido: 2026-10-04
---

`usuarios/modulos.js` es el registro: cada módulo declara sus `rutasApi`, y
aparte hay una lista de prefijos `COMPARTIDAS` que cualquiera con sesión puede
usar. `requirePermiso` (en `permisos.middleware.js`) clasifica cada petición
con `clasificarRuta` y deja pasar si el usuario tiene el módulo dueño, o si
es admin, o si la ruta es compartida.

`frontend/src/utils/modulos.js` es el espejo para el menú: lo que el usuario
ve. El que decide es el backend.

La regla de a quién pertenece una ruta cuando dos prefijos calzan es la que
ya abrió dos huecos — ver [[decision/permisos-por-prefijo-mas-especifico]].

LO QUE CUELGA DE `/alegra` NO PIDE PERMISO. Es un prefijo compartido: el
guardián deja pasar a cualquiera con sesión, salvo que el registro le dé dueño
a un pedazo (`/alegra/bodega` es de Facturas en Bodega). Retirado el
2026-10-04, las dos cosas sin pantalla que las usara:

- **Impresión estaba montada dos veces**: en `/api/reimpresion`, que pide el
  módulo, y en `/api/alegra/reimpresion`, que no. Sin el módulo: 403 en la
  primera, 200 en la segunda (leer la cola, vaciar el historial). Se quitó el
  segundo montaje.
- **`DELETE /alegra/faltantes/proveedor/limpiar`** borraba TODOS los faltantes,
  sin filtro. El botón de Configuración usa otra ruta
  (`/reportes/faltantes/proveedor/limpiar`), que borra solo lo procesado.

`permisosDebajoDeAlegra.test.js` cuida que no vuelvan.

UNA RUTA TIENE UN DUEÑO; SE PUEDE PRESTAR (2026-10-04, decisión del usuario).
Gestionar Relaciones no tiene API propia: su pantalla usa las relaciones
proveedor ↔ producto, que son de Revisión de Precios, y la lista de
proveedores. Quien tenía SOLO ese módulo veía la pantalla en el menú y cada
llamada le daba 403. No se le dio un segundo dueño a la ruta ni se la volvió
compartida: el módulo declara `tambienUsa`, y el guardián deja entrar al dueño
o a quien la tiene prestada (`modulosQuePuedenUsar`). Se presta lo justo:
`/productos-revision` entero, y de `/proveedores` solo leer la lista
(`exacta`, `metodos: ['GET']`). `permisosPrestados.test.js` lee las llamadas
del hook de verdad y falla si la pantalla empieza a usar una ruta que nadie
le prestó.

"LIMPIAR FALTANTES PROCESADOS" ES DE CONFIGURACIÓN (misma fecha). El botón
está solo en esa pantalla, pero su ruta cuelga de `/reportes` y de
`/alegra/reportes`, compartidas: cualquiera con sesión podía borrarlos. Las
dos direcciones quedaron con dueño; leer el reporte sigue compartido.

SIGUE ASÍ, SIN DECIDIR. El módulo Impresión decide hoy quién VE la pantalla,
no quién puede llamar lo que la pantalla usa: pendientes, procesar y recuperar
van por `/alegra/facturas/...`. Lo mismo los ajustes de entrega
(`/alegra/faltantes`), las órdenes de compra con su envío por WhatsApp
(`/alegra/orden-compra`) y las escrituras de `/reportes`. Darles dueño cambia
quién puede hacer qué, y `/alegra/facturas` lo usan varias pantallas a la vez
(Facturación, Bodega, Impresión): es una decisión, no un arreglo. En la rama
`independencia-alegra` ya tienen dueño.
