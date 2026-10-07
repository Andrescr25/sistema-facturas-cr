# Clientes reorganizados — 2026-10-07

El usuario aplazó la revisión de los pendientes de migración y pidió rediseñar
Clientes porque se veía desordenado. Esta entrega reorganiza el módulo en la
rama local `independencia-alegra`, siguiendo su preferencia por tarjetas grandes
como las de Cuentas por Cobrar. La aceptación visual final sigue a su cargo.

## Resultado

- Cuatro entradas claras: Clientes, Rutas, Pedidos y Accesos. Las cuentas del
  portal y las tablets del agente se administran dentro de Accesos. El contador
  de pedidos en revisión corresponde a los pedidos cargados de la selección.
- Directorio con tarjetas legibles, búsqueda y filtros de estado/ruta juntos.
  Cada tarjeta permite abrir la ficha y editar; la desactivación queda en
  «Más opciones». El total corresponde a la selección, sin inventar saldos
  ni indicadores por cliente.
- Ficha con un único título del cliente y vuelta al directorio o a la ruta
  desde donde se abrió. Saldo, vencido, facturas y crédito disponible visibles;
  información, facturas/abonos, historial de compras y pedidos en línea
  separados. Contacto, recorrido, ubicación y notas tienen sus propias tarjetas.
- Formulario de alta/edición con seis secciones y accesos para desplazarse
  directamente entre ellas. Mantiene los 22 campos, validaciones y guardado
  de diferencias. No oculta campos obligatorios al navegador.
- Rutas en tarjetas seleccionables. Se distinguen las semanas en curso del
  historial de semanas cerradas/canceladas, que se puede desplegar. Orden,
  arrastre/flechas, guardado y promoción de ciclos conservan sus servicios.
- Botones y textos mayores, nombres que pueden ocupar varias líneas y
  controles accesibles en celular. Las cuentas del portal usan tarjetas y
  acciones con texto para devolver/quitar acceso.

## Verificación

Navegador real a 1440 y 390 px: 10 escenarios por tamaño, 20 en total.
Directorio/navegación; apertura por teclado/nombre legible; filtros/paginación/vacíos; respuestas A → B → A;
error de lista/reintento; ficha/secciones/formulario/regreso; alta y estado
abiertos y cancelados; error de ficha/regreso/reintento; rutas/ficha/regreso/
histórico; pedidos, cuentas y tablets separados. Sin desbordes horizontales
ni errores JavaScript. Ninguna escritura de negocio ni salida externa.

Las respuestas demoradas y errores se simulan únicamente en el navegador,
con respuestas derivadas de las lecturas locales; no se insertan fichas demo.
La fuente externa de Google se bloqueó también, usando la tipografía de respaldo.
La lista retira los resultados anteriores desde que cambia el filtro, también
durante la espera de búsqueda; un error conserva filtros y ofrece reintento.
La ficha permite volver aun cuando no carga.

Build del frontend aprobado; conserva el aviso existente de tamaño del bundle.
Grafo: 12 pruebas aprobadas. No hay cambios de backend, SQL, Prisma ni
instalaciones. No se repite la suite completa de backend: la última auditoría
registró 2.270 pruebas/363 suites. Esta entrega verifica presentación y lecturas;
no vuelve a emitir facturas, guardar clientes ni enviar invitaciones.

Auditoría READ ONLY antes/después: las 106 tablas y 80 secuencias de la copia
local idénticas, cero diferencias/fallos; stock/apertura provisional en cero y
históricos conservados. Frontend privado 5175 con caché propia, lecturas contra
backend local3002 y prohibición de mutaciones/salidas en el navegador. Publicación
local por avance sin fusión; comprobación de la aplicación habitual5174.
No se reinicia el backend ni se alteran producción, developer o main.

Evidencia privada0700/0600: `/private/tmp/codex-clientes-diseno-20261007`;
capturas anteriores/nuevas, validación, build e instantáneas de conservación.
La copia/rama temporal y el frontend privado se retiran al finalizar; no se
creó otra base. Memoria y grafo actualizados conservando las quince decisiones.

## Pendiente

El checklist operativo conserva **96 listos / 3 pendientes (99 IDs)**.
CLI-10 y VAL-08 necesitan la revisión del usuario; RUT-03 necesita la fuente
local de Maps. El rediseño no recupera ubicaciones inexistentes en las fuentes
revisadas ni cierra esas casillas. Independencia conserva **133/14** separados.
Migración total, aceptación fiscal real y corte permanecen aplazados.
