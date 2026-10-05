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
  relacionado: [modulo/rutas-clientes, modulo/portal-clientes, modulo/catalogo-agente, modulo/facturas-bodega, modulo/faltantes, modulo/compras, decision/orden-enviada-y-archivo-por-recepcion]
medido: 2026-10-05
---

**Decisión del usuario. Rutas/ciclos y pedidos/facturas implementados; faltantes/compras pendientes.** La ruta define el
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
