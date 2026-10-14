---
id: modulo/rutas-clientes
tipo: modulo
titulo: Clientes organizados y rutas con recorrido fijo por semana
estado: vigente
archivos:
  - backend/migrations/independencia/044_rutas_y_ciclos.sql
  - backend/src/modules/rutas/rutas.service.js
  - backend/src/modules/rutas/rutaActual.service.js
  - backend/src/modules/rutas/rutas.validacion.js
  - backend/src/modules/rutas/rutas.routes.js
  - backend/src/modules/clientes/clientes.service.js
  - backend/src/modules/clientes/clientes.resumen.service.js
  - frontend/src/pages/Clientes.jsx
  - frontend/src/components/clientes/NavegacionClientes.jsx
  - frontend/src/components/ui/NavegacionSecciones.jsx
  - frontend/src/components/clientes/ListaClientes.jsx
  - frontend/src/components/clientes/ListaCuentas.jsx
  - frontend/src/components/clientes/VistaRutas.jsx
  - frontend/src/hooks/useAsignarClientesRuta.js
  - frontend/src/components/clientes/AsignarClientesRuta.jsx
  - frontend/src/utils/asignacionRuta.js
  - frontend/src/services/rutasService.js
  - backend/tests/rutasAsignarClientes.test.js
  - backend/tests/asignacionRutaPantalla.test.js
  - frontend/src/components/clientes/ModalCliente.jsx
  - frontend/src/components/clientes/FichaCliente.jsx
  - frontend/src/hooks/useRutas.js
  - frontend/src/hooks/useClientes.js
  - backend/tests/rutasCiclos.test.js
  - backend/tests/clientesServicio.test.js
  - backend/tests/actividadEconomicaClienteLocal.test.js
  - docs/informes/actividad-economica-cliente-2026-10-13.md
  - backend/migrations/independencia/056_rotacion_por_cliente.sql
  - backend/src/modules/clientes/rotacion.js
  - frontend/src/utils/rotacionTexto.js
  - frontend/src/components/clientes/CampoRotacion.jsx
  - frontend/src/components/clientes/RotacionCliente.jsx
  - backend/tests/rotacionCliente.test.js
  - backend/migrations/independencia/060_descuento_global_cliente.sql
  - backend/tests/descuentoClientePg.test.js
  - docs/informes/descuento-global-cliente-2026-10-14.md
aristas:
  relacionado: [modulo/facturacion, modulo/preventa-agenda, modulo/reporte-proveedores, bloqueo/maps-anteriores-sin-fuente-local, modulo/contexto-visible-operacion, modulo/carga-entregas-por-ciclo, decision/ciclo-de-ruta-como-contexto, decision/rotacion-por-cliente-sin-ciclos, modulo/portal-clientes, modulo/catalogo-agente, modulo/permisos, decision/orden-enviada-y-archivo-por-recepcion]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-14
---

Primera parte implementada y aplicada solo en la copia local. Rutas y ciclos
usan ids propios y SQL/pg. `/clientes/rutas` hereda permiso Clientes, incluyendo
lecturas de Maps; no expone ubicaciones en el catálogo compartido/público.

Cliente guarda ruta, orden, Maps https validado y días opcionales 1–7. Los
anteriores quedan Sin ruta, sin asignaciones inventadas. La copia inspeccionada
no tiene enlaces Maps en campos/textos anteriores: no conectar a producción
para recuperarlos; revisar procedencia de las ubicaciones reales con el usuario.
Direcciones y notas se conservan. Rutas inactivas conservan miembros/historia.

ACTIVIDAD CON PUNTO (2026-10-13). La ficha rechazaba `4752.1` por validar
solo dígitos, aunque la integración de Hacienda ya lo admite. Crear/editar
conserva ahora el punto, acepta los códigos numéricos anteriores y vacío,
y rechaza letras y puntos sueltos/repetidos. El campo usa teclado de texto y
ejemplos con ambas formas; el número no se interpreta como cantidad.
Se conserva el límite de diez caracteres del maestro y la validación fiscal
propia del XML. No cambia identificaciones, teléfonos ni su limpieza.
Pruebas del servicio, PostgreSQL desechable y formulario en navegador; sin SQL
nueva. [Evidencia](../../informes/actividad-economica-cliente-2026-10-13.md).

La asignación y el orden comparten bloqueo transaccional `44005,1` ANTES de
bloquear clientes. Cambiar ruta compacta ambos recorridos. Ordenar exige lista
completa y versión vigente; UNIQUE diferida permite intercambiar puestos sin
valores provisionales inválidos. Bitácora entra en la misma transacción.

Ciclo se crea en preventa con fecha de lunes y copia nombre de ruta y recorrido
de clientes activos (nombres/Maps/días). Se fija dentro de la misma transacción;
triggers prohíben editar/borrar/ampliar recorrido y cambiar su contexto. Una
semana de la misma ruta no es otra semana. Cambio del maestro no altera esa copia.

Promoción explícita preventa → preparación → entrega → cerrado; cancelación
antes de entrega. Solo un ciclo en preparación/entrega, siguientes en preventa.
No se cierra el anterior automáticamente ni se borra nada. **Estas acciones
cambian el estado del ciclo: todavía NO asignan pedidos ni preparan bodega.**
Pedidos/facturas y filtros de pedidos ya conservan el recorrido; ver
[[modulo/pedidos-por-ciclo]]. Bodega y reportes de faltantes ya consultan ese contexto; órdenes persistentes,
cobertura y entrega todavía pendientes. Ver [[modulo/faltantes]].

Clientes abre en fichas. Rutas tiene orden con arrastre/flechas, guardado explícito,
creación de ciclos y recorrido histórico. Ficha separa información/contacto/
ruta/ubicación/notas, facturas/abonos, historial y pedidos en línea. Editarla
refresca el detalle. Deudas incluyen facturas antiguas, no solo las diez recientes;
pedidos consultan `pedido_cliente.cliente_id`, sin exigir cuenta del portal ni
referencia externa. La sección de pedidos es reciente (10), origen distinguido.

Verificación: 14 pruebas nuevas (PostgreSQL real, concurrencia, recorridos,
estados, nombres/duplicados, Maps/permisos), suite 1.949 aprobadas; build y navegador 1440/700/390.
HTTP real sin sesión 401, sin permiso 403, incluyendo POST. Navegador confirma
flechas/guardado, ciclo, edición de ficha y conservación del día original del
recorrido. Arrastre implementado, revisión manual del usuario pendiente.

044 aplicada a `tachi` LOCAL con respaldo privado y 13 huellas comerciales
iguales; nuevas tablas vacías. Sin demo en la compartida ni cambios de stock.
Nunca ejecutar la limpieza semanal: su retiro por código sigue en ARC-01/02.

2026-10-06, consulta de carga/entregas: [[modulo/carga-entregas-por-ciclo]]
usa ciclo/documentos fijos y Maps; no pide permiso Clientes al chofer.
Orden inverso sugerido desde revisión de bodega, sin confirmar entrega.
Estado operativo vigente en informe carga; textos de partes anteriores
son históricos. Limpieza global ya retirada por código en 050, ver
[[modulo/archivo-ordenes-compra]]. ENT-06/avance físico sigue pendiente.

## Contexto visible y lecturas — 2026-10-06

Revisión vigente en [[modulo/contexto-visible-operacion]]: selección clara,
respuestas tardías descartadas, notas por semana y contexto original en la
ficha. Los párrafos anteriores son avances históricos, incluidos sus pendientes.
RUT-08/FIL-11 y validación integral se conservan abiertos; no cerrar por probar
una sola consulta, exportación o cambio de maestro. No hay nueva SQL.


Búsqueda local2026-10-07 documentada en [[bloqueo/maps-anteriores-sin-fuente-local]].
106 tablas/247 clientes, tres dumps locales, archivo tar antiguo y dos JSON
históricos sin ubicaciones identificadas. RUT-03 sigue abierto; no implica
reabrir campo/botón/ciclos ya implementados ni inventar datos o consultar
producción. Operativo96/3 y revisiones humanas conservadas.


## Rediseño visual — 2026-10-07

La prioridad actual del usuario es reorganizar Clientes; la revisión de
migración queda para después. Cuatro áreas: Clientes, Rutas, Pedidos y Accesos;
esta última reúne portal y tablets. Directorio en tarjetas grandes con filtros
juntos; ficha con un solo título, resumen de deuda, secciones y vuelta al origen.
Formulario de 22 campos en seis tarjetas con navegación interna, sin ocultar
campos a la validación nativa. Rutas en tarjetas seleccionables; semanas en
curso separadas del historial cerrado/cancelado desplegable. Conserva servicios,
orden guardado y copias de recorrido. No inventar métricas ni datos de cliente.

`useClientes` retira resultados/total anteriores desde el cambio de filtro y
descarta respuestas tardías A → B → A mediante `useContextoConsulta`; errores
muestran reintento en la misma selección. La ficha conserva vuelta/reintento
si falla su consulta. La vuelta desde ficha mantiene la ruta seleccionada.

Verificación vigente: 20 escenarios de navegador, 1440/390 px, sin errores JS,
desbordes, escrituras ni salidas. Build y grafo12 aprobados. Auditoría106 tablas/
80 secuencias iguales y stock0. Solo frontend/documentación, sin SQL ni backend.
Evidencia y límites en `docs/informes/clientes-redisenados-2026-10-07.md`.
CLI-10/VAL-08 siguen abiertos al usuario; RUT-03 necesita fuente local Maps.
Operativo96/3 e independencia133/14 conservados. No acredita corte ni Hacienda real.


## Navegación compartida con Proveedores — 2026-10-07

`NavegacionClientes` reutiliza ahora `ui/NavegacionSecciones`; mantiene cuatro
áreas, agrupación de accesos y contador real de pedidos. Extracción para el
rediseño [[modulo/reporte-proveedores]], sin cambiar servicios ni datos de Clientes.
Regresión1440/390: navegación y ficha abiertas sin guardar, sin errores/desbordes.
La verificación completa previa de Clientes y sus revisiones humanas se conservan.

## Asignar clientes desde la ruta — 2026-10-11

Pedido del usuario, que va a poner a un empleado que se sabe las rutas a
asignarlas: «si yo toco una ruta y le doy asignar clientes NO me redirija al
portal de clientes sino que me traiga una lista de esos clientes donde puedo
darle click y poner un check para asignarlo». El botón mandaba al directorio
filtrado por "sin ruta" y había que abrir, editar y cerrar la ficha de cada
uno; en producción hay 3 rutas y 248 clientes sin ruta.

Ahora "Asignar clientes" abre, dentro de Rutas, `AsignarClientesRuta`:
tarjetas de resumen que filtran (Sin ruta / En esta ruta / En otra ruta),
buscador que mira nombre Y lugar (cantón, distrito, señas: quien arma las
rutas las conoce por lugar), "Marcar los N de esta lista", y una tarjeta
grande por cliente que entera es el check. Mientras está abierta, la página
suelta su cabecera y sus pestañas, igual que al abrir una ficha.

SE GUARDA AL FINAL, NO EN CADA TOQUE, a propósito. Sacar a un cliente le hace
perder su puesto en el recorrido y traerlo de otra ruta lo saca de allá: con
guardado inmediato, un toque de más ya hizo ese daño. La marca es un cambio
que se deshace tocando otra vez; lo pendiente queda en una barra pegada abajo
("3 se agregan · 1 se quita · Todavía no se guardó"), y salir con cambios
pregunta antes. Es la misma costumbre del orden de visita.

EN EL SERVIDOR: `GET /clientes/rutas/:id/asignacion` (todos los activos con
su ruta de hoy, más los inactivos que ya están en esta) y
`PUT /clientes/rutas/:id/clientes` con `{ agregar: [{clienteId, desdeRutaId}],
quitar: [ids] }`, en una transacción bajo el mismo bloqueo de rutas:
- los que entran van al final, en el orden en que se tocaron; los que ya
  estaban conservan su lugar;
- sacar o mover compacta el recorrido que se deja (hay UNIQUE sobre
  ruta + orden, diferida) y sube la versión de CADA ruta tocada, para que
  quien la tenga abierta ordenándola se entere;
- `desdeRutaId` es la ruta en que la pantalla veía al cliente: si otra
  pantalla ya lo movió, responde 409 con el nombre y NO guarda nada. Una
  lista abierta hace una hora no le saca clientes a otra ruta sin que nadie
  lo haya decidido. Traer a alguien de otra ruta, además, se confirma en
  pantalla antes de guardar;
- no pide `version` de la ruta: agregar o quitar no depende del orden, y
  reordenar en otra pantalla no hace perder la selección;
- los recorridos de las semanas ya creadas no cambian (son una foto).

Las cuentas de la pantalla (qué es una marca, qué se manda, qué marcas
sobreviven a una recarga) viven sin React en `utils/asignacionRuta.js`.
Comprobado en Chromium a 1440, 820 y 390 px sobre una base desechable:
buscar un lugar, marcar todos, desmarcar uno, guardar, quitar, traer de otra
ruta con su confirmación y salir sin guardar; después de cada paso se leyó
la base. La ficha del cliente sigue pudiendo cambiar ruta y puesto.

## Rotación por cliente — 2026-10-13

El usuario retira los ciclos: [[decision/rotacion-por-cliente-sin-ciclos]].
Primera parte, en la ficha. La sección «Ruta y visitas» del formulario tiene
«Rotación: cada cuántos días se le visita» (`CampoRotacion`: 7/15/22/30 a un
toque, o cualquier número de 1 a 365; tocar el elegido lo deja en blanco).
Se guarda en `cliente.rotacion_dias` (migración 056) por el mismo
`PUT /clientes/:id`, con su renglón en la bitácora.

La ficha (`RotacionCliente`, dentro del bloque «Ruta y visitas») muestra la
rotación, la última atención y la próxima visita con su estado —Próximo, Le
toca hoy, Atrasado, Sin facturas, Sin rotación—. Llegan calculadas en
`rotacion` de `GET /clientes/:id/resumen`: la última atención es la última
factura EMITIDA de TODA su historia (no de los doce meses de «compras»: a
quien no compra hace un año es a quien más toca visitar).

Relevo Codex: se excluye también la anulación con notas completas (el estado
de la factura sigue emitida). Comparte el criterio SQL de Facturación/Bodega;
una parcial o un cobro no borran la atención. Integrado sobre `e5b1cd2` y
publicado solo en `developer`, conforme al pedido más reciente.
[Verificación y pendiente](../../informes/rotacion-clientes-relevo-2026-10-13.md).

Ruta y rotación son dos cosas: cambiar una no toca la otra (hay prueba). Los
campos «Día habitual de visita/entrega» siguen como estaban; en producción
los tienen 2 clientes.

Comprobado: 22 pruebas (`rotacionCliente.test.js`, 8 contra PostgreSQL real)
y Chromium a 1440 y 390 px sobre una copia desechable con la 056: poner 22
días con un toque, ver el 1 de noviembre para una factura del 10 de octubre,
el aviso de 400 días, quitarla, y crear un cliente con 15 días.

## ROT-04: lectura de la ruta actual sin semanas

[Preventa](preventa-agenda.md) incluye toda ficha activa por `cliente.ruta_id`,
incluso si no hay factura ni faltante. `rutaActual.service.js` comparte el
filtro parametrizado y el selector mínimo con Reporte Clientes; consulta
rutas sin ciclos e inactivas asignadas. No se cambian recorridos históricos.


DESCUENTO GLOBAL (2026-10-14). Input porcentual en «Crédito y descuento»
de crear/editar cliente; la ficha muestra la condición. Guardar, editar y
bitácora comparten transacción. 0 o vacío desactiva; negativos, más de 100
y más de dos decimales se rechazan antes de escribir. La respuesta y el
catálogo compartido entregan el porcentaje como número; los costos siguen
privados en Facturación. Regla de margen >21 %, mayor descuento sin acumular
y conservación de ventas anteriores: [[modulo/facturacion]]. SQL 060 local;
producción pendiente antes de main.
