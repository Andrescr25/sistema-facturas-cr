---
id: modulo/rutas-clientes
tipo: modulo
titulo: Clientes organizados y rutas con recorrido fijo por semana
estado: vigente
archivos:
  - backend/migrations/independencia/044_rutas_y_ciclos.sql
  - backend/src/modules/rutas/rutas.service.js
  - backend/src/modules/rutas/rutas.validacion.js
  - backend/src/modules/rutas/rutas.routes.js
  - backend/src/modules/clientes/clientes.service.js
  - backend/src/modules/clientes/clientes.resumen.service.js
  - frontend/src/pages/Clientes.jsx
  - frontend/src/components/clientes/VistaRutas.jsx
  - frontend/src/components/clientes/ModalCliente.jsx
  - frontend/src/components/clientes/FichaCliente.jsx
  - frontend/src/hooks/useRutas.js
  - frontend/src/hooks/useClientes.js
  - backend/tests/rutasCiclos.test.js
aristas:
  relacionado: [modulo/contexto-visible-operacion, modulo/carga-entregas-por-ciclo, decision/ciclo-de-ruta-como-contexto, modulo/portal-clientes, modulo/catalogo-agente, modulo/permisos, decision/orden-enviada-y-archivo-por-recepcion]
  bloqueado_por: [bloqueo/prisma-no-se-regenera]
medido: 2026-10-06
---

Primera parte implementada y aplicada solo en la copia local. Rutas y ciclos
usan ids propios y SQL/pg. `/clientes/rutas` hereda permiso Clientes, incluyendo
lecturas de Maps; no expone ubicaciones en el catálogo compartido/público.

Cliente guarda ruta, orden, Maps https validado y días opcionales 1–7. Los
anteriores quedan Sin ruta, sin asignaciones inventadas. La copia inspeccionada
no tiene enlaces Maps en campos/textos anteriores: no conectar a producción
para recuperarlos; revisar procedencia de las ubicaciones reales con el usuario.
Direcciones y notas se conservan. Rutas inactivas conservan miembros/historia.

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
