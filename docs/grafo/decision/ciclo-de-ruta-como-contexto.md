---
id: decision/ciclo-de-ruta-como-contexto
tipo: decision
titulo: Una ruta se repite; cada pedido conserva su ciclo fechado
estado: vigente
archivos:
  - docs/instrucciones-vigentes-usuario.md
  - docs/checklist-rutas-ciclos-operativos.md
  - docs/plan-rutas-ciclos-operativos.md
aristas:
  relacionado: [modulo/validacion-cadena-operativa, modulo/contexto-cadena-operativa, modulo/historicos-contexto-documentos, modulo/contexto-visible-operacion, modulo/necesidades-por-ciclo, modulo/registro-carga-entrega, modulo/carga-entregas-por-ciclo, modulo/recepcion-ordenes-compra, modulo/ordenes-compra-por-ciclo, modulo/rutas-clientes, modulo/portal-clientes, modulo/catalogo-agente, modulo/facturas-bodega, modulo/faltantes, modulo/compras, decision/orden-enviada-y-archivo-por-recepcion]
medido: 2026-10-06
---

**Decisión del usuario. Rutas/ciclos, pedidos/facturas, bodega/reportes y borradores de compra por ciclo implementados; envío y recepción física implementados; archivo implementado y consulta de carga/entregas disponible; registro físico implementado y verificado en copia local.** La ruta define el
recorrido; el ciclo identifica una ejecución concreta, por ejemplo Ruta 1 /
semana 12/10/2026. Pedido, faltante y compra deben conservar ese contexto.
Relacionarlos solo por ruta mezcla semanas diferentes al repetir el recorrido.

Coexisten el ciclo actual en preparación/entrega y el próximo en preventa
anticipada. El agente mantiene preventa presencial lunes/martes, puede llevar
pedidos anticipados al visitar al cliente y tomar pedidos adicionales.
La promoción de un ciclo es controlada; no depende del reinicio del domingo.

Cliente guarda ruta, orden manual y Maps; se aprovechan ubicaciones existentes.
El orden sirve para preparación, reporte, entrega y carga sugerida, con el
primer pedido más accesible. Cambiar ruta/orden del maestro no debe reescribir
el contexto de documentos pasados. Históricos sin clasificación no reciben
un ciclo supuesto.

El checklist distingue lo implementado de los próximos vínculos y filtros.
La regla de negocio se conserva aquí; código y evidencia están en el módulo.

## Primera parte, 2026-10-05

Modelo de rutas/ciclos, asignación/orden, recorrido inmutable y ficha ya
implementados: ver [[modulo/rutas-clientes]]. Los estados pueden coexistir;
promoción explícita. Segunda parte: pedidos/facturas conservan el ciclo y sus filtros, ver
[[modulo/pedidos-por-ciclo]]. Vincular faltantes y compras sigue pendiente.

Parte de operación: faltantes derivan el ciclo de factura/recorrido fijo;
Bodega, Clientes, Proveedores, notas y Excel filtran el mismo contexto. Sin
ciclo mantiene históricos; compra pendiente aún no descuenta cobertura.
Recorrido aplicado a preparación, consulta filtrada del proveedor separada
del borrador global. Informe operacion-ciclos-2026-10-05 y [[modulo/faltantes]].
Borradores propios y reservas por origen/ciclo en la 046:
[[modulo/ordenes-compra-por-ciclo]]. No confundir reserva con envío confirmado.

049 aplica recepción física sin cambiar contexto. Cobertura final recibida se
asigna a orígenes del ciclo propio; cantidad de otra semana no se consume. Ver
[[modulo/recepcion-ordenes-compra]]. 050 archiva recibida por consulta tras 24 h sin reiniciar rutas; ver
[[modulo/archivo-ordenes-compra]]. Carga/entregas siguen pendientes.

Consulta del recorrido/carga por ciclo en [[modulo/carga-entregas-por-ciclo]]:
orden fijo, inversa sugerida, Maps del recorrido y documentos anticipados.
No registro físico de carga/entrega aún; no cerrar próximos ciclos al consultar.

051 registra operación física por factura/recorrido fijo; versión y foto
conservan semana y productos anteriores. Entrega exige promoción explícita
del ciclo, no cerrar otra semana ni mover stock por marcar lo ocurrido.
Corrección admin con motivo tras cambio operativo/reimpresión conserva historia.
Ver [[modulo/registro-carga-entrega]] y su informe de verificación/cierre.

Necesidades/cobertura compara stock general/demanda/faltantes/compras por semana
en [[modulo/necesidades-por-ciclo]], sin reasignar documentos ni usar un saldo
general como dos reservas.85/14 operativo; informes anteriores son históricos.

## Contexto visible y lecturas — 2026-10-06

Revisión vigente en [[modulo/contexto-visible-operacion]]: selección clara,
respuestas tardías descartadas, notas por semana y contexto original en la
ficha. Los párrafos anteriores son avances históricos, incluidos sus pendientes.
RUT-08/FIL-11 y validación integral se conservan abiertos; no cerrar por probar
una sola consulta, exportación o cambio de maestro. No hay nueva SQL.

2026-10-06: históricos Sin ciclo y copias sin metadata se distinguen en
Facturación. Edición y acuses consultan la fotografía guardada aun tras
cierre/cambio de ficha; los reenvíos conservan cuerpo/UUID y detalle descargado.
Ver [[modulo/historicos-contexto-documentos]]. Validación integral separada.

## Cadena integral verificada — 2026-10-06

RUT-08 y VAL-01 cerrados en [[modulo/contexto-cadena-operativa]]. Dos semanas
simultáneas de una ruta y un histórico Sin ciclo conservan sus documentos,
compras, PDF, cobertura, recepciones y eventos tras mover/renombrar cliente,
cambiar Maps y cerrar/promover ciclos. Recibir o liberar saldo pendiente de
una orden anterior opera en su origen, sin trasladarlo a la semana activa.
El cambio de estado habilita acciones nuevas sin rehacer fotografías previas.
Nueve casos nuevos, suite 2.237, grafo 12, build y 11 vistas/22 capturas
Chromium 1440/390. Sin SQL nueva ni cambio de servicios; 053 libre.

Estado vigente: 92 listos / 7 pendientes (99 IDs). Los párrafos previos
registran etapas anteriores. VAL-04–07 conservan la verificación global,
CLI-10/VAL-08 corresponden al usuario y RUT-03 requiere la fuente LOCAL de
Maps anteriores. No cerrar esas casillas por esta evidencia limitada a la
cadena descrita ni completar ubicaciones consultando producción.

2026-10-06: VAL-04 cerrado en [[modulo/validacion-cadena-operativa]], con
permisos HTTP, conexiones/transacciones paralelas y conversiones de unidades.
Stock general aumenta al recibir; cobertura/recibidos del otro ciclo no se
reasignan. Vigente 93 listos / 6 pendientes (99 IDs). VAL-05–08 conservan la
verificación final/manual; las cifras y pendientes anteriores son históricos.
