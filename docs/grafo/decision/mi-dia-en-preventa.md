---
id: decision/mi-dia-en-preventa
tipo: decision
titulo: «Mi día» en Preventa — el agente arma y ordena su plan de visitas del día, y se guarda en el sistema
estado: vigente
archivos:
  - backend/migrations/independencia/077_plan_de_visitas.sql
  - backend/src/modules/preventa/planDelDia.js
  - backend/src/modules/preventa/preventa.service.js
  - backend/src/modules/preventa/preventa.controller.js
  - backend/src/modules/preventa/preventa.routes.js
  - frontend/src/pages/Preventa.jsx
  - frontend/src/components/preventa/PlanDelDia.jsx
  - frontend/src/components/preventa/ListaOrdenable.jsx
  - frontend/src/components/preventa/ModalAgregarAlPlan.jsx
  - frontend/src/components/preventa/DetalleVisita.jsx
  - frontend/src/hooks/usePlanDelDia.js
  - frontend/src/hooks/useClientesDeRuta.js
  - frontend/src/hooks/useAgendaPreventa.js
  - frontend/src/hooks/useClienteDesdePreventa.js
  - frontend/src/utils/planDelDia.js
  - backend/tests/planDelDia.test.js
aristas:
  relacionado: [modulo/preventa-agenda, decision/agente-de-ventas-monitoreado, decision/planilla-del-agente]
medido: 2026-11-01
---

## Qué pidió el usuario (2026-11-01)

«Mejoremos el módulo de Preventa: acá el agente de ventas quiero que pueda
organizar mejor cuál cliente quiere visitar primero, o sea quiero que este
módulo sea más dinámico, que el agente lo edite a su gusto.»

Decidió, entre las propuestas: un plan **por día** con clientes de todas sus
rutas (no uno por ruta); que el agente **también pueda cambiar el orden de sus
rutas** («Guardar como orden de mi ruta», con bitácora); y como atajos, solo
**«Orden de la ruta»** y **«Mapa del día»** (no «más cerca de mí» ni «más
urgentes primero»). Se construye por partes: 1 «Mi día» · 2 orden de la ruta
· 3 mapa del día · 4 el plan en «Su día» (Empleados).

## 1 (2026-11-01): «Mi día» — migración 077

- **Preventa abre en «Mi día»**; «Toda la ruta» es la agenda de siempre. La
  pestaña va en la dirección (`?vista=ruta`) y viaja a Facturar y de vuelta:
  se vuelve a donde se estaba. `useAgendaPreventa` ya no pisa los demás
  parámetros de la dirección al poner `ruta`.
- **`plan_visita`**: una fila por cliente del plan, con su lugar. Se arma sola
  la primera vez que se abre en el día (GET `/preventa/plan`): los atrasados y
  los de hoy de SUS rutas (`usuario_ruta`), ruta por ruta (por nombre) y en el
  `orden_ruta` de cada una. Quien no tiene rutas asignadas arranca vacío y sin
  filas. Un candado por agente (`pg_advisory_xact_lock(44006, usuario)`)
  evita armarlo dos veces desde dos teléfonos.
- **Agregar** (de cualquiera de las rutas que puede ver: las suyas, o todas
  con «Ver todas las rutas») va al final; **quitar** deja la fila `quitado`
  (se ve a quién sacó; agregarlo de nuevo lo devuelve al final); al que ya
  visitó no se lo puede quitar. **Ordenar** manda la lista entera: si no
  calza con lo guardado (lo cambió en otro teléfono), 409 y se recarga.
- **Visitado** = ese día le facturó (factura emitida suya) o le marcó
  «próxima visita». Se LEE de `factura`/`visita`, no se guarda en el plan.
  Arriba «Siguiente»: el primero sin visitar, con Waze y Maps.
- **El cliente del plan tiene la misma forma que el de la agenda**
  (`SELECT_CLIENTE`/`comoCliente` en preventa.service): la visita se abre
  igual desde las dos pestañas.
- **Ordenar con el dedo** (`ListaOrdenable`): eventos de puntero en el asa,
  con `touch-none` y desplazamiento automático en los bordes. El arrastre HTML5
  de Clientes → Rutas no funciona en pantallas táctiles. Las flechas siguen.
- «Cliente nuevo» registrado desde «Mi día» entra al plan.
