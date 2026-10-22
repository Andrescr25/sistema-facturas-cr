# Aprobación de gastos y Caja General en Finanzas — 2026-10-21

El usuario autoriza publicar a main la aprobación de gastos y pide trasladar
«tal cual» el tab Caja General de Cuentas por cobrar a Finanzas. La entrega
incluye también el formato Excel del contador 6e26d9d y la aprobación
dfbecb3, ambos de Codex. El traslado y esta publicación también son de Codex;
no se incorporan commits nuevos de otro agente.

## Caja General

Nueva entrada Finanzas → Caja General, `/caja-general`, con el mismo diseño
de movimientos, período, Hoy/Este mes, Entradas/Salidas/Todo, totales, métodos,
facturas y anulados. El componente se mueve, sin duplicar vista ni consulta;
el estado vive en useCajaGeneral y la página sólo arma. La navegación estática
se declara una vez y el filtro por permisos sigue funcionando.

Se conserva el servicio de caja y su endpoint de movimientos. Su prefijo
específico exige `caja-general`; no presta deudores, cobros ni cierre de caja.
Los permisos se administran independientemente. SQL063 conserva únicamente
el acceso previo de quien ya tenía CxC; administrador accede por rol. CxC
retiene Pendientes y Cobros del día. Volver entre esos tabs limpia el cliente
con undefined, el centinela existente, para no abrir por error al cliente NULL.

## Migraciones antes de main

SQL062/063 aplicadas por Codex en producción el **21/10/2026 a las 21:46 CR**.
Respaldo public de **20.366.893 bytes**, SHA256 comprobado y restauración local
íntegra con pg_restore antes de tocar el esquema de producción. Ensayo de las
dos migraciones sobre esa restauración; no se prueba con datos ficticios en
producción. La base de desarrollo y las pruebas permanecen locales.

Ambas SQL se ejecutan en una sola transacción con bloqueo de despliegue,
lock_timeout 5 s y statement_timeout 60 s. Comparación dentro de la misma
instantánea, antes de confirmar:

- **145 tablas conservadas**: datos de las 144 tablas de negocio idénticos,
  incluyendo las columnas anteriores de gastos; de usuario_modulo se conservan
  idénticas sus 14 filas anteriores y sólo se agrega el permiso solicitado.
- **2 gastos existentes conservados**, con su decisión histórica comprobada.
  No se inventan pagos, huellas ni condiciones fiscales anteriores.
- **1 permiso Caja General** copiado del acceso CxC existente. Ningún otro
  usuario recibe acceso. Repetir SQL063 no cambia ni duplica filas.
- **29 triggers conservados** y el índice nuevo de decisión válido.

Producción sólo recibe las SQL necesarias y lecturas de comprobación; no
creación de facturas/pagos, aceptación fiscal para probar ni mensajes reales.
No se ejecuta limpieza semanal, regeneración de Prisma o instalación backend.

## Verificación

- Suite completa sobre clon local separado: **237 archivos, 2943 pruebas
  correctas, cero fallos, 3 omisiones históricas** que requieren inventario
  provisional en cero. No se cambia el inventario existente para satisfacerlas.
- Cierre dirigido: **102 pruebas correctas**, con totales/anulados/períodos de
  Caja, permisos de servidor/menú, separación de cobros/cierres y estructura.
- Chromium: **59 comprobaciones**, 390/700/1440 px, sin errores JS ni
  desbordamiento horizontal. Ruta, filtros, recarga, menú Finanzas y CxC sin
  el tab anterior; ningún movimiento alterado por recorrer la pantalla.
- HTTP real con usuarios locales: 401 sin sesión; sólo Caja lee movimientos
  sin abrir deudores/cierres, sólo CxC conserva sus operaciones sin heredar Caja.
  Mayúsculas/barra final conservan permisos. Build y lint correctos.
- La aprobación que se publica conserva sus 49 comprobaciones de navegador
  del informe anterior y sus pruebas PostgreSQL de pago/Caja/reintentos/Hacienda
  simulado incluidas de nuevo en la suite completa.

Evidencia privada: `/private/tmp/codex-caja-main-20261021/`, con respaldo,
huellas, ensayo, migración, suite y navegador. Las copias de ensayo se retiran
al cerrar; el clon limpio y la vista 5173/3000 se conservan actualizados.
La verificación de la versión publicada y el registro de quién subió qué
se guardan en el relevo compartido `permiso-subir-a-main.md`.
