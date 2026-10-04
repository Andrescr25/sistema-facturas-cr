---
id: leccion/el-permiso-se-compara-como-express
tipo: leccion
titulo: El permiso se saltaba cambiando una mayúscula — el guardián comparaba distinto que Express
estado: vigente
archivos:
  - backend/src/modules/usuarios/modulos.js
  - backend/src/modules/usuarios/permisos.middleware.js
  - backend/tests/permisosModulos.test.js
  - backend/tests/usuariosPermisos.test.js
aristas:
  relacionado: [modulo/permisos, decision/permisos-por-prefijo-mas-especifico, leccion/lo-publico-no-lleva-costo-ni-margen]
medido: 2026-10-03
---

`requirePermiso` decide de quién es cada ruta comparando su texto contra los
prefijos de `usuarios/modulos.js`. Express, que es quien después entrega la
petición al módulo, no distingue mayúsculas y acepta la barra final. Eran dos
maneras de leer la misma dirección, y la diferencia era la falla.

Medido el 2026-10-03, con un token de usuario común:

| Petición | Respuesta |
|---|---|
| `GET /api/usuarios` | 403 |
| `GET /api/Usuarios` | **200** |
| `GET /api/rentabilidad/resumen` | 403 |
| `GET /api/Rentabilidad/resumen` | **200** |

`/Usuarios` no calzaba con `/usuarios`, así que no era de ningún módulo ni de
administrador; caía en "sin clasificar", que el guardián deja pasar a
propósito para no romper pantallas. Ni siquiera llegaba a mirar si la cuenta
seguía activa: un token de una cuenta desactivada también pasaba. Quedaba
abierto cualquier módulo —y crear usuarios o cambiar contraseñas— para
cualquiera que tuviera una sesión.

**La regla:** quien autoriza tiene que leer la ruta EXACTAMENTE como la lee
quien la atiende. `normalizarRuta` la pasa a minúsculas, le quita la barra
final y las barras dobles y la decodifica, y recién entonces se clasifica. Los
prefijos del registro van siempre en minúsculas; una prueba lo cuida.

**Cómo volver a medirlo:** con un usuario sin el módulo, pedir la misma ruta
escrita de varias maneras (`/Modulo`, `/MODULO/`, `/modulo//x`). Todas tienen
que responder lo mismo que la forma normal.
