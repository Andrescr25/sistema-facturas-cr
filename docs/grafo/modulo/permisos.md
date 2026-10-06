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
  - backend/server.js
  - backend/tests/sinPrefijoAlegra.test.js
  - backend/tests/dobles/sinComentarios.js
  - backend/tests/permisosPrestados.test.js
aristas:
  relacionado: [decision/permisos-por-prefijo-mas-especifico, modulo/gestion-catalogo, modulo/exportaciones-reportes, leccion/el-permiso-se-compara-como-express]
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

EL PREFIJO `/alegra` YA NO EXISTE (2026-10-04). Era el de un router
adaptador (`backend/routes/alegra.js`, borrado) que montaba media aplicación
debajo de una sola dirección, y esa dirección era COMPARTIDA: lo que colgaba
de ahí pasaba con cualquier sesión. Por ahí quedaron sin permiso, en
distintos momentos, la Gestión de Catálogo, Facturación, Bodega, Impresión,
los ajustes de entrega y las órdenes de compra. Ahora cada módulo tiene su
dirección y su dueño:

| Prefijo | Dueño | Qué es |
|---|---|---|
| `/bodega` | `facturas-bodega` | Facturas en Bodega |
| `/reimpresion` | `impresion` | la cola de Impresión |
| `/faltantes` | `reporte-clientes` | ajustes de entrega (guardar, quitar) |
| `/orden-compra` | `reporte-proveedores` | la orden de compra y su envío por WhatsApp |
| `/reportes` | compartido | lo leen los dos reportes y la cola de impresión; los Excel sí tienen dueño |

LAS DOS FORMAS EN QUE EL HUECO VUELVE, y que cuida `sinPrefijoAlegra.test.js`:

1. **Un router montado en dos prefijos.** Impresión estaba en
   `/api/reimpresion` (pide el módulo) y también en `/api/alegra/reimpresion`.
   Medido con un usuario real sin el módulo: 403 en la primera, 200 en la
   segunda, incluido procesar una factura de la cola, que la edita.
2. **Un prefijo montado que nadie registró.** Una ruta sin clasificar pasa
   como compartida; la prueba recorre cada `app.use('/api/…')` de `server.js`
   y exige que sea de un módulo, compartido, de administrador o público.

La misma prueba compara cada llamada de las tres pantallas mudadas contra las
rutas que define el servidor (23 llamadas): cambiar un prefijo a mano es
donde una queda mal escrita y responde 404 recién cuando alguien toca el
botón.

UNA PRUEBA DE AUSENCIA NO PUEDE ESCONDER CÓDIGO. Las pruebas que afirman
"nadie llama a esto" quitaban los comentarios con dos expresiones regulares,
y un `/*` adentro de un comentario de línea o de un texto abría un bloque
falso que se tragaba el código siguiente: en `alegraService.js` se comía dos
llamadas de verdad, y la prueba pasaba sin haberlas mirado. Usan
`tests/dobles/sinComentarios.js`, que sabe cuándo está dentro de una cadena.

LAS ESCRITURAS DE `/reportes` TIENEN DUEÑO (2026-10-04, decisión del
usuario). `/reportes` es compartido porque lo LEEN las dos pantallas de
reporte y la cola de impresión. Las tres rutas que escriben eran botones de
una sola pantalla cada una, y pasaban con cualquier sesión:

| Ruta | Dueño | Botón |
|---|---|---|
| `POST /reportes/faltantes/cliente/facturas/:id/impresion` | `reporte-clientes` | "lista para imprimir" |
| `POST /reportes/faltantes/cliente/facturas/:id/recuperar` | `reporte-clientes` | recuperar la factura |
| `DELETE /reportes/faltantes/proveedor/limpiar` | `configuracion` | Mantenimiento → limpiar faltantes procesados |

`permisosPrestados.test.js` lee `report.routes.js` y falla si aparece una
escritura nueva en ese router sin dueño.

EN PRODUCCIÓN (`main` `1a4d666`, 2026-10-04, autorizado por el usuario) se
cerraron el montaje doble de Impresión y el borrado total de faltantes. Allá
`/alegra` sigue existiendo y compartido —la propia Impresión trabaja por
`/alegra/facturas/...`—: el módulo decide quién ve la pantalla, no quién
puede llamar sus rutas. Su prueba (`permisosDebajoDeAlegra.test.js`) vive en
`developer`; en esta rama la reemplaza `sinPrefijoAlegra.test.js`, y al
fusionar `developer` hay que dejarla borrada.

UNA RUTA TIENE UN DUEÑO; SE PUEDE PRESTAR (2026-10-04, decisión del usuario).
Gestionar Relaciones no tiene API propia: su pantalla usa las relaciones
proveedor ↔ producto, que son de Revisión de Precios, y la lista de
proveedores. Quien tenía SOLO ese módulo veía la pantalla en el menú y cada
llamada le daba 403. No se le dio un segundo dueño a la ruta ni se la volvió
compartida: el módulo declara `tambienUsa`, y el guardián deja entrar al dueño
o a quien la tiene prestada (`modulosQuePuedenUsar`). Se presta lo justo:
`/productos-revision` entero, y de `/proveedores` solo leer la lista
(`exacta`, `metodos: ['GET']`) — de ahí cuelgan también las fichas y las
asignaciones, que se escriben y siguen siendo solo de Reporte Proveedores.
`permisosPrestados.test.js` lee las llamadas del hook de verdad y falla si la
pantalla empieza a usar una ruta que nadie le prestó. Vino de `developer`
(`main` `b0989bf`), donde es igual.

2026-10-05: Bodega /ciclos y reportes cliente/proveedor tienen selector bajo
su módulo, sin requerir permiso Clientes. Listas ahora incluyen Maps/contexto
fijo y dejan de ser compartidas; notas por producto pertenecen a Reporte
Proveedores. Prefijo más largo conserva /proveedor/limpiar en Configuración
(compatibilidad 410 sin consulta desde 050; botón retirado). Prueba operacionCiclos y
permiso HTTP real en copia desechable; contexto en informe de operación.

Archivo 050 conserva ACL de detalle/PDF/historia y contratos retirados.
401/403 antes de 410; ver [[modulo/archivo-ordenes-compra]].
