---
id: decision/agente-de-ventas-monitoreado
tipo: decision
titulo: El agente de ventas factura a precio de lista, no cobra y no ve costos; se construye función a función
estado: vigente
archivos:
  - backend/src/modules/usuarios/modulos.js
  - backend/src/modules/usuarios/permisos.middleware.js
  - backend/src/modules/facturacion/precioFijo.js
  - backend/src/modules/facturacion/facturaPropia.service.js
  - backend/src/modules/facturacion/facturaPropia.controller.js
  - backend/src/modules/facturacion/descuentoCliente.service.js
  - backend/src/modules/configuracion/configuracion.service.js
  - backend/migrations/independencia/068_permisos_accion_facturacion.sql
  - frontend/src/utils/modulos.js
  - frontend/src/utils/descuentoCliente.js
  - frontend/src/hooks/useDescuentoClienteFacturacion.js
  - frontend/src/components/usuarios/TableroPermisos.jsx
  - frontend/src/components/facturacion/LineaFactura.jsx
  - frontend/src/components/facturacion/LineasFactura.jsx
  - frontend/src/pages/Facturacion.jsx
  - frontend/src/components/Layout.jsx
  - backend/tests/precioFijoFactura.test.js
aristas:
  relacionado: [modulo/permisos, modulo/facturacion, modulo/preventa-agenda, decision/rotacion-por-cliente-sin-ciclos]
medido: 2026-10-29
---

## Qué pidió el usuario (2026-10-29)

«Voy a contratar un agente de ventas, este se hará cargo de las rutas poco a
poco, pero quiero tenerlo completamente monitoreado.» Le da Facturación,
Catálogo del agente y Preventa; en Preventa, la cola de clientes que tiene
que visitar, facturarle desde ahí o marcar «próxima visita», y la ubicación
del cliente. «Vamos poco a poco, función a función para ir probando.»

Decisiones, textuales:
1. «El precio y descuento no lo puede tocar.»
2. «De momento este no podrá cobrar, porque lo voy a poner a prueba (pero
   igual esto desarróllalo para futuro): cuánto dinero recogió por usuario y
   todo más acomodado a cierre de caja.» Su usuario va sin Cuentas por Cobrar.
3. Próxima visita: hoy + la rotación del cliente, por defecto; «que el agente
   planifique bien cómo va a visitar y esto sea más personalizable».
4. GPS en cada acción: sí.

## F1 (2026-10-29): su usuario y los candados

**Permisos de acción** (`PERMISOS_DE_ACCION`): se otorgan aparte aunque se
tenga el módulo, se guardan en `usuario_modulo` y en el tablero salen debajo
de su módulo; quitar el módulo los quita. Un administrador los tiene por rol.
- `precio-factura` «Cambiar precio y descuento». Sin él, el servidor exige el
  precio de lista (al editar, también el que ya tenía la línea) y solo la
  oferta vigente o el descuento del cliente (`precioFijo.js`, 409
  `PRECIO_FIJO`, sin corregir en silencio). La pantalla no muestra los campos;
  el precio se sigue viendo junto al subtotal.
- `cobro-factura` «Cobrar al facturar». Sin él, la pantalla no ofrece métodos
  de pago (la factura queda pendiente, que ya era lo elegido por defecto) y el
  servidor rechaza un cobro (403 `SIN_COBRO`).
- La migración 068 se los dio a todos los que ya tenían Facturación: a nadie
  le cambia nada. Impresión y Bodega editan facturas por su cuenta y no pasan
  por la regla.

**Lo que se cerró al auditar qué lee un usuario con solo esos tres módulos**
(las 184 rutas GET, con un usuario ZZ en la copia local):
- El descuento del cliente mandaba el COSTO de cada producto (de ahí sale el
  margen). Sin `precio-factura` ahora llega `aplica`: en qué productos aplica,
  ya resuelto por el servidor con la misma regla de guardar.
- `/catalogos/configuracion` (compartida con cualquier sesión) mandaba las
  cuentas de dinero enteras, con número y saldo inicial: ahora solo id, nombre
  y tipo, que es lo único que usaba la pantalla.
- `/reportes/historial` (tabla `procesamientos`) no la usaba ninguna pantalla
  y la leía cualquiera: se borró.
- «Catálogo del agente» no estaba en el menú de nadie (se llegaba por el
  Dashboard o el ingreso): ahora sale para quien tenga el módulo.

**Abierto, para que decida el usuario:** con Facturación el agente ve TODAS
las facturas emitidas (de todos los clientes, con saldo) en «Facturas».

## Lo que sigue

F2 rutas asignadas al agente · F3 visita con ubicación y «Facturar» · F4
«Próxima visita» con motivo, fecha elegible y GPS · F5 seguimiento del agente
para el administrador · después: Preventa sin señal, guardar ubicación con
GPS, cobros y cierre de caja por usuario.
