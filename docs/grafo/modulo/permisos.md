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
  relacionado: [decision/permisos-por-prefijo-mas-especifico, modulo/gestion-catalogo]
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

QUEDA POR DECIDIR (es del usuario): qué acciones exigen administrador —anular,
nota de crédito, editar una factura emitida, cerrar caja—. Hoy las puede hacer
quien tenga el módulo.

