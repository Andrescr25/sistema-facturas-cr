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
aristas:
  relacionado: [decision/permisos-por-prefijo-mas-especifico, modulo/gestion-catalogo, leccion/el-permiso-se-compara-como-express]
medido: 2026-09-23
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
