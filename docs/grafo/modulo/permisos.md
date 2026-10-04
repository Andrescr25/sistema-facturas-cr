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
  - backend/src/modules/usuarios/bitacora.service.js
  - backend/src/utils/bitacora.js
  - backend/src/modules/usuarios/usuarios.routes.js
  - frontend/src/pages/Bitacora.jsx
  - frontend/src/hooks/useBitacora.js
  - frontend/src/utils/bitacoraFormato.js
  - backend/tests/bitacoraConsulta.test.js
  - backend/tests/bitacoraFormato.test.js
aristas:
  relacionado: [decision/permisos-por-prefijo-mas-especifico, modulo/gestion-catalogo, modulo/exportaciones-reportes, leccion/el-permiso-se-compara-como-express]
medido: 2026-10-03
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

NINGÚN PREFIJO MONTADO QUEDA SIN CLASIFICAR (2026-10-03). Una ruta que no es
de un módulo, ni compartida, ni de administrador, ni pública, pasa para
cualquiera con sesión: es la red para no romper pantallas. El comentario del
middleware decía que un test cuidaba que eso no pasara, y ese test no existía;
había un prefijo, `/envios-whatsapp`, pasando por omisión. Ahora está en
`COMPARTIDAS` (son solo lecturas: teléfonos e historial de envíos) y
`permisosModulos.test.js` recorre cada `app.use('/api/…')` de `server.js`:
montar un módulo nuevo sin decirle dueño rompe la prueba.

Los módulos nuevos de la migración ya tienen dueño: clientes (`clientes`),
productos (`gestion-catalogo`, por `/maestro`), caja (`cuentas-por-cobrar`,
por `/cuentas-por-cobrar/propios/caja`), notas de crédito (`facturacion`),
proveedores (`reporte-proveedores`) y configuración.

Las descargas Excel de faltantes tienen dueño también bajo los prefijos
compartidos: `/reportes/faltantes/cliente/exportar` y
`/reportes/faltantes/proveedor/exportar`, incluidos sus alias
`/alegra/reportes/…`. El prefijo específico exige el módulo del reporte;
Inicio y Rentabilidad heredan el suyo. Ver [[modulo/exportaciones-reportes]].

LA BITÁCORA SE PUEDE LEER (`/usuarios/bitacora`, solo administradores).
`utils/bitacora.js` la escribe desde el principio de la migración, dentro de
la transacción de cada cambio; `usuarios/bitacora.service.js` la consulta:
lista con filtros (qué, acción, quién, fechas, texto), y cada línea abierta
con lo que cambió campo por campo.

- Vive bajo `/usuarios` a propósito, la API y la pantalla: así la protege la
  regla que ya existe (`RUTAS_ADMIN`), sin una lista nueva que mantener en dos
  lados.
- Es de SOLO LECTURA. No hay ruta que escriba en ella y una prueba barre los
  módulos buscando un `UPDATE` o `DELETE` sobre `bitacora_cambio`.
- El nombre de cada registro sale de la foto guardada; si la foto no lo trae
  (una edición guarda solo lo que cambió) se lee de su tabla, por una lista
  cerrada de entidades. Un registro borrado sigue diciendo qué era.
- La hora se muestra como está guardada, sin pasarla por `Date`: la columna
  no lleva zona horaria.

ACCIONES QUE PIDEN ADMINISTRADOR AUNQUE SE TENGA EL MÓDULO (decisión del
usuario, 2026-10-03): anular una factura, anular un cobro y reabrir una caja
ya cerrada. Viven en `ACCIONES_ADMIN` (`usuarios/modulos.js`), por método y
ruta, y `requirePermiso` responde 403 diciendo cuál es. El frontend espeja las
claves (`ACCIONES_SOLO_ADMIN`, `puedeAccion`) solo para no dibujar el botón.
Quedaron con el módulo, a propósito: notas de crédito, editar una factura
emitida —Impresión lo hace todos los días al rebajar faltantes— y cerrar la
caja.

LA RUTA SE CLASIFICA COMO LA ENTIENDE EXPRESS. Express no distingue mayúsculas
y acepta la barra final; el guardián comparaba el texto tal cual. Medido el
2026-10-03 con un usuario común: `/api/usuarios` respondía 403 y
`/api/Usuarios` respondía 200. La ruta con otra letra no calzaba con ningún
prefijo, caía en "sin clasificar" y pasaba; Express la entregaba igual al
módulo. Así se abría cualquier módulo, y la gestión de usuarios, a cualquiera
con sesión. `normalizarRuta` la pasa a minúsculas, le quita la barra final y
las barras dobles y la decodifica antes de clasificarla. Los prefijos del
registro van siempre en minúsculas (una prueba lo cuida).
