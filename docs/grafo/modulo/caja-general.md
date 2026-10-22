---
id: modulo/caja-general
tipo: modulo
titulo: Caja General — módulo de Finanzas con los movimientos existentes
estado: vigente
archivos:
  - frontend/src/pages/CajaGeneral.jsx
  - frontend/src/components/caja-general/MovimientosCaja.jsx
  - frontend/src/hooks/useCajaGeneral.js
  - frontend/src/services/cuentasPorCobrarService.js
  - frontend/src/pages/CuentasPorCobrar.jsx
  - frontend/src/App.jsx
  - frontend/src/components/Layout.jsx
  - frontend/src/utils/modulos.js
  - backend/src/modules/cuentas-por-cobrar/cuentas-por-cobrar.routes.js
  - backend/src/modules/cuentas-por-cobrar/cobros.controller.js
  - backend/src/modules/cuentas-por-cobrar/cajaGeneral.service.js
  - backend/src/modules/usuarios/modulos.js
  - backend/migrations/independencia/063_caja_general_permiso.sql
  - backend/tests/cajaGeneral.test.js
  - backend/tests/permisosModulos.test.js
  - backend/tests/usuariosPermisos.test.js
aristas:
  relacionado: [decision/caja-general-es-el-centro, modulo/permisos, modulo/gastos-operativos]
medido: 2026-10-21
---

El usuario pide mover «tal cual» el tab Caja General de Cuentas por cobrar
a un módulo dentro de Finanzas. Pantalla `/caja-general`, clave propia en
ambos catálogos de permisos y entrada del menú. Se mueve el componente, no se
duplica: mismos filtros Desde/Hasta, Hoy/Este mes, entradas/salidas, totales
del período, desglose por método, facturas y anulados que no suman.
Página que arma, sección que dibuja y estado/consulta en useCajaGeneral;
una respuesta tardía no reemplaza el período recién seleccionado.

Se conserva GET `/cuentas-por-cobrar/propios/caja/movimientos` con su servicio
y vista `movimiento_caja` existentes. Su prefijo específico ahora pertenece
a `caja-general`. No abre deudores, cobros ni cierres; éstos siguen bajo
`cuentas-por-cobrar`. Su tab Cobros del día también se conserva. Sólo los
movimientos globales pasan a Finanzas. No otra API ni copia de los datos.

SQL063 conserva acceso: copia los permisos CxC existentes a Caja General,
sin modificar los otros ni otorgarlo a personas que antes no podían verla.
Administrador tiene acceso por rol y podrá asignar/revocar el permiso nuevo
de manera independiente. Se aplica antes de publicar el nuevo catálogo.
Pruebas de permisos cubren servidor/menú y la separación de cobros/cierres.

La publicación solicitada incluye Excel del contador 6e26d9d y aprobación
dfbecb3, ambos de Codex. SQL062/063 aplicadas en producción el 21/10 a las
21:46 CR, con datos anteriores conservados. [Validación y publicación](../../informes/despliegue-aprobacion-caja-2026-10-21.md).
